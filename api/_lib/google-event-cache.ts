import { neon } from '@neondatabase/serverless'
import type { CalendarEvent } from './events.js'
import { GOOGLE_CALENDAR_PROVIDER_ID } from './providers/google-calendar.js'

export const GOOGLE_EVENT_CACHE_FRESH_MS = 2 * 60 * 1000

export type GoogleEventCacheRow = {
  external_account_id: string
  month_start: string
  exclusion_fingerprint: string
  events: CalendarEvent[]
  fetched_at: string | Date
}

export function exclusionFingerprint(excludedCalendarIds: Iterable<string>) {
  return [...excludedCalendarIds].sort().join('\n')
}

function database(databaseUrl: string) {
  return neon(databaseUrl)
}

function dateOnly(value: string | Date) {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

export function monthStartsOverlapping(timeMin: Date, timeMax: Date) {
  if (!(timeMax.getTime() > timeMin.getTime())) return []
  const months: string[] = []
  const cursor = new Date(Date.UTC(timeMin.getUTCFullYear(), timeMin.getUTCMonth(), 1))
  const lastInstant = new Date(timeMax.getTime() - 1)
  const last = new Date(Date.UTC(
    lastInstant.getUTCFullYear(),
    lastInstant.getUTCMonth(),
    1,
  ))
  while (cursor.getTime() <= last.getTime()) {
    months.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

export function expandToMonthBounds(timeMin: Date, timeMax: Date) {
  const months = monthStartsOverlapping(timeMin, timeMax)
  if (!months.length) return { start: timeMin, end: timeMax }
  const last = new Date(`${months[months.length - 1]}T00:00:00.000Z`)
  last.setUTCMonth(last.getUTCMonth() + 1)
  return {
    start: new Date(`${months[0]}T00:00:00.000Z`),
    end: last,
  }
}

export function eventTimeRange(event: Pick<CalendarEvent, 'startAt' | 'endAt' | 'allDay'>) {
  if (event.allDay) {
    const start = Date.parse(`${event.startAt}T00:00:00.000Z`)
    const end = event.endAt
      ? Date.parse(`${event.endAt}T00:00:00.000Z`)
      : start + 24 * 60 * 60 * 1000
    return { start, end: Number.isNaN(end) ? start : end }
  }
  const start = Date.parse(event.startAt)
  const end = event.endAt ? Date.parse(event.endAt) : start
  return { start, end: Number.isNaN(end) ? start : end }
}

export function eventOverlapsRange(
  event: Pick<CalendarEvent, 'startAt' | 'endAt' | 'allDay'>,
  timeMin: Date,
  timeMax: Date,
) {
  const { start, end } = eventTimeRange(event)
  if (Number.isNaN(start)) return false
  return start < timeMax.getTime() && end >= timeMin.getTime()
}

function monthBounds(monthStart: string) {
  const start = new Date(`${monthStart}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

export function eventsForMonth(events: CalendarEvent[], monthStart: string) {
  const { start, end } = monthBounds(monthStart)
  return events.filter((event) => eventOverlapsRange(event, start, end))
}

export function cacheFreshness(
  rows: GoogleEventCacheRow[],
  accountIds: string[],
  months: string[],
  fingerprints: Map<string, string>,
  now = Date.now(),
) {
  if (!accountIds.length || !months.length) {
    return { complete: true, fresh: true }
  }
  const fetchedAt = new Map<string, number>()
  for (const row of rows) {
    if (row.exclusion_fingerprint !== fingerprints.get(row.external_account_id)) continue
    fetchedAt.set(
      `${row.external_account_id}:${dateOnly(row.month_start)}`,
      new Date(row.fetched_at).getTime(),
    )
  }
  let complete = true
  let fresh = true
  for (const accountId of accountIds) {
    for (const month of months) {
      const cachedAt = fetchedAt.get(`${accountId}:${month}`)
      if (cachedAt === undefined) {
        complete = false
        fresh = false
        continue
      }
      if (now - cachedAt > GOOGLE_EVENT_CACHE_FRESH_MS) fresh = false
    }
  }
  return { complete, fresh }
}

export async function listGoogleEventCache(
  databaseUrl: string,
  ownerId: string,
  accountIds: string[],
  months: string[],
) {
  if (!accountIds.length || !months.length) return []
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT external_account_id, month_start::text AS month_start, exclusion_fingerprint,
            events, fetched_at
       FROM google_event_cache
      WHERE owner_id = $1
        AND provider = $2
        AND external_account_id = ANY($3::text[])
        AND month_start = ANY($4::date[])`,
    [ownerId, GOOGLE_CALENDAR_PROVIDER_ID, accountIds, months],
  ) as Array<{
    external_account_id: string
    month_start: string
    exclusion_fingerprint: string
    events: CalendarEvent[] | string
    fetched_at: string | Date
  }>
  return rows.map((row) => {
    const parsed = typeof row.events === 'string' ? JSON.parse(row.events) : row.events
    return {
      external_account_id: row.external_account_id,
      month_start: dateOnly(row.month_start),
      exclusion_fingerprint: row.exclusion_fingerprint,
      events: Array.isArray(parsed) ? parsed as CalendarEvent[] : [],
      fetched_at: row.fetched_at,
    }
  })
}

export async function writeGoogleEventCache(
  databaseUrl: string,
  ownerId: string,
  externalAccountId: string,
  months: string[],
  events: CalendarEvent[],
  fingerprint: string,
) {
  const sql = database(databaseUrl)
  for (const monthStart of months) {
    await sql.query(
      `INSERT INTO google_event_cache (
         owner_id, provider, external_account_id, month_start, exclusion_fingerprint,
         events, fetched_at
       ) VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, NOW())
       ON CONFLICT (owner_id, provider, external_account_id, month_start)
       DO UPDATE SET
         exclusion_fingerprint = EXCLUDED.exclusion_fingerprint,
         events = EXCLUDED.events,
         fetched_at = NOW()`,
      [
        ownerId,
        GOOGLE_CALENDAR_PROVIDER_ID,
        externalAccountId,
        monthStart,
        fingerprint,
        JSON.stringify(eventsForMonth(events, monthStart)),
      ],
    )
  }
  await sql.query(
    `DELETE FROM google_event_cache
      WHERE owner_id = $1
        AND fetched_at < NOW() - INTERVAL '14 days'`,
    [ownerId],
  )
}

export async function invalidateGoogleEventCache(
  databaseUrl: string,
  ownerId: string,
  externalAccountId?: string,
) {
  const sql = database(databaseUrl)
  if (externalAccountId) {
    await sql.query(
      `DELETE FROM google_event_cache
        WHERE owner_id = $1
          AND provider = $2
          AND external_account_id = $3`,
      [ownerId, GOOGLE_CALENDAR_PROVIDER_ID, externalAccountId],
    )
    return
  }
  await sql.query(
    `DELETE FROM google_event_cache
      WHERE owner_id = $1 AND provider = $2`,
    [ownerId, GOOGLE_CALENDAR_PROVIDER_ID],
  )
}
