import { randomUUID } from 'node:crypto'
import { neon, Pool } from '@neondatabase/serverless'

export type CalendarEvent = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  calendar: string
  location: string | null
  source: 'saved' | 'google'
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
}

function dateOnly(value: string | Date | null) {
  if (!value) return null
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

function serialize(row: SavedEventRow): CalendarEvent {
  const startAt = new Date(row.start_at).toISOString()
  const endAt = row.end_at ? new Date(row.end_at).toISOString() : null
  const allDayDate = dateOnly(row.all_day_date)
  const allDayEndDate = dateOnly(row.all_day_end_date)
  return {
    id: `saved:${row.id}`,
    title: row.title,
    startAt: row.all_day && allDayDate ? allDayDate : startAt,
    endAt: row.all_day ? allDayEndDate : endAt,
    allDay: row.all_day,
    calendar: row.calendar_name,
    location: row.location,
    source: 'saved',
  }
}

export async function listSavedEvents(
  databaseUrl: string,
  ownerId: string,
  timeMin: Date,
  timeMax: Date,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT id, title, start_at, end_at, all_day, all_day_date,
            all_day_end_date, calendar_name, location
       FROM saved_events
      WHERE owner_id = $1
        AND CASE
              WHEN all_day THEN COALESCE(all_day_date::timestamptz, start_at)
              ELSE start_at
            END < $3
        AND CASE
              WHEN all_day THEN COALESCE(all_day_end_date::timestamptz, start_at)
              ELSE COALESCE(end_at, start_at)
            END >= $2
      ORDER BY start_at`,
    [ownerId, timeMin.toISOString(), timeMax.toISOString()],
  ) as SavedEventRow[]
  return rows.map(serialize)
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
       all_day_end_date, calendar_name, location
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, title, start_at, end_at, all_day, all_day_date, all_day_end_date,
       calendar_name, location`,
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
    ],
  ) as SavedEventRow[]
  return serialize(rows[0])
}

export async function createSavedEvents(
  databaseUrl: string,
  ownerId: string,
  events: NewSavedEvent[],
  requestId: string,
) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(
      `SELECT id, title, start_at, end_at, all_day, all_day_date, all_day_end_date,
              calendar_name, location
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

    const created: CalendarEvent[] = []
    for (const [index, event] of events.entries()) {
      const rows = await client.query(
        `INSERT INTO saved_events (
           id, owner_id, title, start_at, end_at, all_day, all_day_date,
           all_day_end_date, calendar_name, location, planner_request_id,
           planner_item_index
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, title, start_at, end_at, all_day, all_day_date, all_day_end_date,
           calendar_name, location`,
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
        ],
      )
      created.push(serialize(rows.rows[0] as SavedEventRow))
    }
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
