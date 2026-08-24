import {
  listCalendarExclusions,
  listIntegrationAccountsWithCredentials,
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
  listAllGoogleEvents,
} from './providers/google-calendar.js'

const CALENDAR_TYPE_RANK = {
  'read-only': 0,
  editable: 1,
  owner: 2,
  primary: 3,
} as const

const inflightFetches = new Map<string, Promise<CalendarEvent[]>>()

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

  const existing = inflightFetches.get(fetchKey)
  const fetchEvents = existing ?? (async () => {
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
  })()

  if (!existing) {
    inflightFetches.set(fetchKey, fetchEvents)
    fetchEvents.finally(() => {
      if (inflightFetches.get(fetchKey) === fetchEvents) {
        inflightFetches.delete(fetchKey)
      }
    })
  }

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

  if (!config.revalidate && freshness.complete) {
    return { events: cachedEvents, status: 'ok' as const, stale }
  }
  if (!config.revalidate) {
    return { events: cachedEvents, status: 'ok' as const, stale: true }
  }

  const eventsById = new Map<string, CalendarEvent>()
  let status: 'ok' | 'error' = 'ok'
  const failedAccounts = new Set<string>()
  for (const account of readableAccounts) {
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
      status = 'error'
      failedAccounts.add(account.external_account_id)
      console.error(
        `Unable to load Google Calendar events for ${account.external_account_id}`,
        error,
      )
    }
  }
  if (failedAccounts.size) {
    for (const row of cacheRows) {
      if (!failedAccounts.has(row.external_account_id)) continue
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
