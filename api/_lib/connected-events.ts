import {
  listCalendarExclusions,
  listIntegrationAccountsWithCredentials,
  updateIntegrationAccountStatus,
  type IntegrationAccountRow,
} from './db.js'
import type { CalendarEvent } from './events.js'
import {
  cacheFreshness,
  exclusionFingerprint,
  expandToMonthBounds,
  eventOverlapsRange,
  invalidateGoogleEventCache,
  listGoogleEventCache,
  monthStartsOverlapping,
  writeGoogleEventCache,
  type GoogleEventCacheRow,
} from './google-event-cache.js'
import {
  getGoogleAccessToken,
  GOOGLE_CALENDAR_PROVIDER_ID,
  hasGoogleCalendarReadScope,
  isGoogleAuthRevokedError,
  listAllGoogleEvents,
} from './providers/google-calendar.js'

const CALENDAR_TYPE_RANK = {
  'read-only': 0,
  editable: 1,
  owner: 2,
  primary: 3,
} as const

export type ConnectedGoogleStatus = 'ok' | 'disconnected' | 'error' | 'reconnect'

const inflightFetches = new Map<string, Promise<CalendarEvent[]>>()

export function retainInflight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key)
  if (existing) return existing
  const pending = start()
  map.set(key, pending)
  // Settle the cleanup chain so a rejected fetch cannot become an unhandled
  // rejection after the caller has already caught the original promise.
  void pending.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    if (map.get(key) === pending) map.delete(key)
  })
  return pending
}

async function markGoogleAccountNeedsReconnect(
  databaseUrl: string,
  ownerId: string,
  externalAccountId: string,
) {
  try {
    await updateIntegrationAccountStatus(
      databaseUrl,
      ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
      externalAccountId,
      'error',
    )
  } catch (error) {
    console.error(
      `Unable to mark Google account ${externalAccountId} as needing reconnect`,
      error,
    )
  }
}

export async function invalidateConnectedCalendarCache(
  databaseUrl: string,
  ownerId: string,
  externalAccountId?: string,
) {
  await invalidateGoogleEventCache(databaseUrl, ownerId, externalAccountId)
}

function mergeGoogleEvent(eventsById: Map<string, CalendarEvent>, event: CalendarEvent) {
  const existing = eventsById.get(event.id)
  if (existing?.google && event.google) {
    if (
      CALENDAR_TYPE_RANK[event.google.calendar.type]
      > CALENDAR_TYPE_RANK[existing.google.calendar.type]
    ) {
      existing.google.calendar = event.google.calendar
      existing.calendar = event.calendar
    }
    for (const sourceAccount of event.google.accounts) {
      if (!existing.google.accounts.some(({ id }) => id === sourceAccount.id)) {
        existing.google.accounts.push(sourceAccount)
      }
    }
    return
  }
  eventsById.set(event.id, event)
}

function eventsFromCacheRows(
  rows: GoogleEventCacheRow[],
  timeMin: Date,
  timeMax: Date,
  fingerprints: Map<string, string>,
) {
  const eventsById = new Map<string, CalendarEvent>()
  for (const row of rows) {
    if (row.exclusion_fingerprint !== fingerprints.get(row.external_account_id)) continue
    for (const event of row.events) {
      if (eventOverlapsRange(event, timeMin, timeMax)) {
        mergeGoogleEvent(eventsById, event)
      }
    }
  }
  return [...eventsById.values()]
}

async function fetchAccountEvents(config: {
  databaseUrl: string
  encryptionKey: string
  clientId: string
  clientSecret: string
  ownerId: string
  account: IntegrationAccountRow
  excludedCalendarIds: Set<string>
  timeMin: Date
  timeMax: Date
}) {
  const expanded = expandToMonthBounds(config.timeMin, config.timeMax)
  const months = monthStartsOverlapping(expanded.start, expanded.end)
  const fingerprint = exclusionFingerprint(config.excludedCalendarIds)
  const fetchKey = [
    config.ownerId,
    config.account.external_account_id,
    expanded.start.toISOString(),
    expanded.end.toISOString(),
    fingerprint,
  ].join(':')

  const fetchEvents = retainInflight(inflightFetches, fetchKey, async () => {
    const accessToken = await getGoogleAccessToken({
      databaseUrl: config.databaseUrl,
      encryptionKey: config.encryptionKey,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }, config.account)
    const events = await listAllGoogleEvents(
      accessToken,
      expanded.start,
      expanded.end,
      {
        account: config.account,
        excludedCalendarIds: config.excludedCalendarIds,
      },
    )
    await writeGoogleEventCache(
      config.databaseUrl,
      config.ownerId,
      config.account.external_account_id,
      months,
      events,
      fingerprint,
    )
    return events
  })

  const events = await fetchEvents
  return events.filter((event) => eventOverlapsRange(event, config.timeMin, config.timeMax))
}

export async function loadConnectedGoogleEvents(config: {
  databaseUrl: string
  encryptionKey: string
  clientId: string
  clientSecret: string
  ownerId: string
  timeMin: Date
  timeMax: Date
  revalidate: boolean
}) {
  const [accounts, exclusions] = await Promise.all([
    listIntegrationAccountsWithCredentials(
      config.databaseUrl,
      config.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
    ),
    listCalendarExclusions(
      config.databaseUrl,
      config.ownerId,
      GOOGLE_CALENDAR_PROVIDER_ID,
    ),
  ])
  const readableAccounts = accounts.filter((account) => (
    hasGoogleCalendarReadScope(account.scopes)
  ))
  if (!accounts.length) {
    return { events: [] as CalendarEvent[], status: 'disconnected' as const, stale: false }
  }
  if (!readableAccounts.length) {
    return { events: [] as CalendarEvent[], status: 'error' as const, stale: false }
  }
  const liveAccounts = readableAccounts.filter((account) => account.status !== 'error')
  const reconnectAccountIds = new Set(
    readableAccounts
      .filter((account) => account.status === 'error')
      .map((account) => account.external_account_id),
  )

  const months = monthStartsOverlapping(config.timeMin, config.timeMax)
  const accountIds = readableAccounts.map((account) => account.external_account_id)
  const fingerprints = new Map(
    readableAccounts.map((account) => [
      account.external_account_id,
      exclusionFingerprint(
        exclusions
          .filter((row) => row.external_account_id === account.external_account_id)
          .map((row) => row.calendar_id),
      ),
    ]),
  )
  const cacheRows = await listGoogleEventCache(
    config.databaseUrl,
    config.ownerId,
    accountIds,
    months,
  )
  const freshness = cacheFreshness(cacheRows, accountIds, months, fingerprints)
  const cachedEvents = eventsFromCacheRows(
    cacheRows,
    config.timeMin,
    config.timeMax,
    fingerprints,
  )
  const stale = !freshness.complete || !freshness.fresh
  const cachedStatus: ConnectedGoogleStatus = reconnectAccountIds.size ? 'reconnect' : 'ok'
  if (!config.revalidate && freshness.complete) {
    return { events: cachedEvents, status: cachedStatus, stale }
  }
  if (!config.revalidate) {
    return { events: cachedEvents, status: cachedStatus, stale: true }
  }
  if (!liveAccounts.length) {
    return {
      events: cachedEvents,
      status: 'reconnect' as const,
      stale: !freshness.complete || !freshness.fresh,
    }
  }

  const eventsById = new Map<string, CalendarEvent>()
  let status: ConnectedGoogleStatus = reconnectAccountIds.size ? 'reconnect' : 'ok'
  const fallbackAccountIds = new Set(reconnectAccountIds)
  for (const account of liveAccounts) {
    try {
      const accountEvents = await fetchAccountEvents({
        ...config,
        account,
        excludedCalendarIds: new Set(
          exclusions
            .filter((row) => row.external_account_id === account.external_account_id)
            .map((row) => row.calendar_id),
        ),
      })
      for (const event of accountEvents) mergeGoogleEvent(eventsById, event)
    } catch (error) {
      fallbackAccountIds.add(account.external_account_id)
      if (isGoogleAuthRevokedError(error)) {
        reconnectAccountIds.add(account.external_account_id)
        if (status === 'ok') status = 'reconnect'
        console.error(
          `Google Calendar grant revoked for ${account.external_account_id}`,
          error,
        )
        await markGoogleAccountNeedsReconnect(
          config.databaseUrl,
          config.ownerId,
          account.external_account_id,
        )
      } else {
        status = 'error'
        console.error(
          `Unable to load Google Calendar events for ${account.external_account_id}`,
          error,
        )
      }
    }
  }
  if (fallbackAccountIds.size) {
    for (const row of cacheRows) {
      if (!fallbackAccountIds.has(row.external_account_id)) continue
      if (row.exclusion_fingerprint !== fingerprints.get(row.external_account_id)) continue
      for (const event of row.events) {
        if (eventOverlapsRange(event, config.timeMin, config.timeMax)) {
          mergeGoogleEvent(eventsById, event)
        }
      }
    }
  }
  return { events: [...eventsById.values()], status, stale: false }
}
