import { randomUUID } from 'node:crypto'
import { neon, Pool } from '@neondatabase/serverless'
import type { NotifyMinutes, ReminderFrequency } from './reminder-options.js'
import {
  expandRecurringEvent,
  occurrenceEventId,
  recurrenceFromRow,
  type RecurrenceFrequency,
  type RecurrenceRule,
} from './recurrence.js'

export type CalendarEvent = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  calendar: string
  location: string | null
  description: string | null
  externalUrl: string | null
  organizer: {
    email: string | null
    displayName: string | null
    self: boolean
  } | null
  source: 'saved' | 'google'
  visibility?: 'full' | 'busy'
  reminder?: {
    enabled: boolean
    notifyMinutes: NotifyMinutes
    frequency: ReminderFrequency
    custom: boolean
  }
  recurrence?: RecurrenceRule | null
  seriesStartAt?: string
  seriesEndAt?: string | null
  google?: {
    calendar: {
      id: string
      name: string
      primary: boolean
      type: 'primary' | 'owner' | 'editable' | 'read-only'
      accessRole: string
      color: string | null
    }
    accounts: Array<{
      id: string
      memberId: string | null
      email: string | null
      displayName: string | null
      calendarType: 'primary' | 'owner' | 'editable' | 'read-only'
      accessRole: string
    }>
  }
}

type SavedEventRow = {
  id: string
  title: string
  start_at: string | Date
  end_at: string | Date | null
  all_day: boolean
  all_day_date: string | Date | null
  all_day_end_date: string | Date | null
  calendar_name: string
  location: string | null
  recurrence: string | null
  recurrence_until: string | Date | null
}

type NewSavedEvent = {
  title: string
  startAt: string
  endAt?: string | null
  allDay?: boolean
  allDayDate?: string | null
  allDayEndDate?: string | null
  calendar: string
  location?: string | null
  recurrence?: RecurrenceFrequency | null
  recurrenceUntil?: string | null
}

export class PlannerSessionConflictError extends Error {}

function dateOnly(value: string | Date | null) {
  if (!value) return null
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

const SAVED_EVENT_COLUMNS = `id, title, start_at, end_at, all_day, all_day_date,
            all_day_end_date, calendar_name, location, recurrence, recurrence_until`

function withSeriesFields(event: CalendarEvent, rule: RecurrenceRule | null, master: CalendarEvent) {
  if (!rule) return { ...event, recurrence: null }
  return {
    ...event,
    recurrence: rule,
    seriesStartAt: master.startAt,
    seriesEndAt: master.endAt,
  }
}

function serialize(row: SavedEventRow): CalendarEvent {
  const startAt = new Date(row.start_at).toISOString()
  const endAt = row.end_at ? new Date(row.end_at).toISOString() : null
  const allDayDate = dateOnly(row.all_day_date)
  const allDayEndDate = dateOnly(row.all_day_end_date)
  const recurrence = recurrenceFromRow(row.recurrence, row.recurrence_until)
  const event: CalendarEvent = {
    id: `saved:${row.id}`,
    title: row.title,
    startAt: row.all_day && allDayDate ? allDayDate : startAt,
    endAt: row.all_day ? allDayEndDate : endAt,
    allDay: row.all_day,
    calendar: row.calendar_name,
    location: row.location,
    description: null,
    externalUrl: null,
    organizer: null,
    source: 'saved',
    recurrence,
  }
  return withSeriesFields(event, recurrence, event)
}

function serializeOccurrence(row: SavedEventRow, occurrenceKey?: string | null) {
  const master = serialize(row)
  if (!master.recurrence) return master
  const firstKey = master.allDay ? master.startAt.slice(0, 10) : master.startAt
  if (!occurrenceKey) {
    return { ...master, id: occurrenceEventId(row.id, firstKey) }
  }
  const occStart = Date.parse(
    master.allDay || !occurrenceKey.includes('T')
      ? `${occurrenceKey.slice(0, 10)}T00:00:00.000Z`
      : occurrenceKey,
  )
  if (Number.isNaN(occStart)) {
    return { ...master, id: occurrenceEventId(row.id, firstKey) }
  }
  const match = expandRecurringEvent(
    master,
    master.recurrence,
    new Date(occStart),
    new Date(occStart + 24 * 60 * 60 * 1000),
  ).find((event) => event.id === occurrenceEventId(row.id, occurrenceKey))
  return match ?? { ...master, id: occurrenceEventId(row.id, firstKey) }
}

export async function listSavedEvents(
  databaseUrl: string,
  ownerId: string,
  timeMin: Date,
  timeMax: Date,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT ${SAVED_EVENT_COLUMNS}
       FROM saved_events
      WHERE owner_id = $1
        AND (
          (
            recurrence IS NULL
            AND CASE
                  WHEN all_day THEN COALESCE(all_day_date::timestamptz, start_at)
                  ELSE start_at
                END < $3
            AND CASE
                  WHEN all_day THEN COALESCE(
                    all_day_end_date::timestamptz + INTERVAL '1 day',
                    all_day_date::timestamptz + INTERVAL '1 day',
                    start_at + INTERVAL '1 day'
                  )
                  ELSE COALESCE(end_at, start_at)
                END >= $2
          )
          OR (
            recurrence IS NOT NULL
            AND CASE
                  WHEN all_day THEN COALESCE(all_day_date::timestamptz, start_at)
                  ELSE start_at
                END < $3
            AND (
              recurrence_until IS NULL
              OR recurrence_until >= ($2::timestamptz::date - 400)
            )
          )
        )
      ORDER BY start_at`,
    [ownerId, timeMin.toISOString(), timeMax.toISOString()],
  ) as SavedEventRow[]
  return rows.flatMap((row) => {
    const master = serialize(row)
    return expandRecurringEvent(master, master.recurrence ?? null, timeMin, timeMax)
      .map((event) => withSeriesFields(event, master.recurrence ?? null, master))
  }).sort((left, right) => left.startAt.localeCompare(right.startAt))
}

export async function createSavedEvent(
  databaseUrl: string,
  ownerId: string,
  event: NewSavedEvent,
) {
  const sql = neon(databaseUrl)
  const id = randomUUID()
  const rows = await sql.query(
    `INSERT INTO saved_events (
       id, owner_id, title, start_at, end_at, all_day, all_day_date,
       all_day_end_date, calendar_name, location, recurrence, recurrence_until
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${SAVED_EVENT_COLUMNS}`,
    [
      id,
      ownerId,
      event.title,
      event.startAt,
      event.endAt ?? null,
      event.allDay ?? false,
      event.allDayDate ?? null,
      event.allDayEndDate ?? null,
      event.calendar,
      event.location ?? null,
      event.recurrence ?? null,
      event.recurrenceUntil ?? null,
    ],
  ) as SavedEventRow[]
  return serializeOccurrence(rows[0])
}

export async function deleteSavedEvent(
  databaseUrl: string,
  ownerId: string,
  eventId: string,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `DELETE FROM saved_events
      WHERE owner_id = $1 AND id = $2
      RETURNING id`,
    [ownerId, eventId],
  )
  if (rows.length !== 1) return false
  await sql.query(
    `DELETE FROM event_notification_preferences
      WHERE owner_id = $1
        AND (event_id = $2 OR event_id LIKE $3)`,
    [ownerId, `saved:${eventId}`, `saved:${eventId}::%`],
  )
  return true
}

export async function updateSavedEvent(
  databaseUrl: string,
  ownerId: string,
  eventId: string,
  event: NewSavedEvent,
  occurrenceKey?: string | null,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `UPDATE saved_events
        SET title = $3,
            start_at = $4,
            end_at = $5,
            all_day = $6,
            all_day_date = $7,
            all_day_end_date = $8,
            calendar_name = $9,
            location = $10,
            recurrence = $11,
            recurrence_until = $12,
            updated_at = NOW()
      WHERE owner_id = $1 AND id = $2
      RETURNING ${SAVED_EVENT_COLUMNS}`,
    [
      ownerId,
      eventId,
      event.title,
      event.startAt,
      event.endAt ?? null,
      event.allDay ?? false,
      event.allDayDate ?? null,
      event.allDayEndDate ?? null,
      event.calendar,
      event.location ?? null,
      event.recurrence ?? null,
      event.recurrenceUntil ?? null,
    ],
  ) as SavedEventRow[]
  return rows[0] ? serializeOccurrence(rows[0], occurrenceKey) : null
}

export async function createSavedEvents(
  databaseUrl: string,
  ownerId: string,
  events: NewSavedEvent[],
  requestId: string,
  session: { sessionId: string; revision: number },
) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(
      `SELECT ${SAVED_EVENT_COLUMNS}
         FROM saved_events
        WHERE owner_id = $1 AND planner_request_id = $2
        ORDER BY planner_item_index`,
      [ownerId, requestId],
    )
    if (existing.rows.length) {
      if (existing.rows.length !== events.length) {
        throw new Error('Planner request ID conflicts with an existing batch')
      }
      await client.query('COMMIT')
      return existing.rows.map((row) => serialize(row as SavedEventRow))
    }
    const plannerSession = await client.query(
      `SELECT revision
         FROM ai_planner_sessions
        WHERE owner_id = $1
          AND id = $2
          AND revision = $3
          AND status = 'active'
          AND expires_at > NOW()
        FOR UPDATE`,
      [ownerId, session.sessionId, session.revision],
    )
    if (!plannerSession.rows.length) {
      const committed = await client.query(
        `SELECT ${SAVED_EVENT_COLUMNS}
           FROM saved_events
          WHERE owner_id = $1 AND planner_request_id = $2
          ORDER BY planner_item_index`,
        [ownerId, requestId],
      )
      if (committed.rows.length === events.length) {
        await client.query('COMMIT')
        return committed.rows.map((row) => serialize(row as SavedEventRow))
      }
      throw new PlannerSessionConflictError(
        'This planner proposal is no longer current',
      )
    }

    const created: CalendarEvent[] = []
    for (const [index, event] of events.entries()) {
      const rows = await client.query(
        `INSERT INTO saved_events (
           id, owner_id, title, start_at, end_at, all_day, all_day_date,
           all_day_end_date, calendar_name, location, planner_request_id,
           planner_item_index, recurrence, recurrence_until
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${SAVED_EVENT_COLUMNS}`,
        [
          randomUUID(),
          ownerId,
          event.title,
          event.startAt,
          event.endAt ?? null,
          event.allDay ?? false,
          event.allDayDate ?? null,
          event.allDayEndDate ?? null,
          event.calendar,
          event.location ?? null,
          requestId,
          index,
          event.recurrence ?? null,
          event.recurrenceUntil ?? null,
        ],
      )
      created.push(serialize(rows.rows[0] as SavedEventRow))
    }
    await client.query(
      `UPDATE ai_planner_sessions
          SET status = 'confirmed',
              encrypted_last_response = NULL,
              updated_at = NOW()
        WHERE owner_id = $1 AND id = $2`,
      [ownerId, session.sessionId],
    )
    await client.query('COMMIT')
    return created
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
