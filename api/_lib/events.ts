import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

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
  calendar_name: string
  location: string | null
}

type NewSavedEvent = {
  title: string
  startAt: string
  endAt?: string | null
  calendar: string
  location?: string | null
}

function serialize(row: SavedEventRow): CalendarEvent {
  return {
    id: `saved:${row.id}`,
    title: row.title,
    startAt: new Date(row.start_at).toISOString(),
    endAt: row.end_at ? new Date(row.end_at).toISOString() : null,
    allDay: false,
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
    `SELECT id, title, start_at, end_at, calendar_name, location
       FROM saved_events
      WHERE owner_id = $1
        AND start_at < $3
        AND COALESCE(end_at, start_at) >= $2
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
       id, owner_id, title, start_at, end_at, calendar_name, location
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, start_at, end_at, calendar_name, location`,
    [
      id,
      ownerId,
      event.title,
      event.startAt,
      event.endAt ?? null,
      event.calendar,
      event.location ?? null,
    ],
  ) as SavedEventRow[]
  return serialize(rows[0])
}
