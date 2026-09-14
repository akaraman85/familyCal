import { neon } from '@neondatabase/serverless'
import {
  isNotifyMinutes,
  isReminderFrequency,
  type EventReminderPreference,
  type ResolvedEventReminder,
} from './reminder-options.js'

export {
  attachEventReminders,
  defaultEventReminder,
  FALLBACK_EVENT_REMINDER,
  reminderForDispatch,
  resolveEventReminder,
  type EventReminderPreference,
  type ResolvedEventReminder,
} from './reminder-options.js'

type EventReminderRow = {
  event_id: string
  enabled: boolean
  notify_minutes: number
  frequency: string
}

function serializeRow(row: EventReminderRow): EventReminderPreference | null {
  if (!isNotifyMinutes(row.notify_minutes) || !isReminderFrequency(row.frequency)) {
    return null
  }
  return {
    eventId: row.event_id,
    enabled: row.enabled,
    notifyMinutes: row.notify_minutes,
    frequency: row.frequency,
  }
}

export async function listEventReminderPreferences(databaseUrl: string, ownerId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT event_id, enabled, notify_minutes, frequency
       FROM event_notification_preferences
      WHERE owner_id = $1`,
    [ownerId],
  ) as EventReminderRow[]
  const overrides = new Map<string, EventReminderPreference>()
  for (const row of rows) {
    const parsed = serializeRow(row)
    if (parsed) overrides.set(parsed.eventId, parsed)
  }
  return overrides
}

export async function saveEventReminderPreference(
  databaseUrl: string,
  ownerId: string,
  reminder: EventReminderPreference,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO event_notification_preferences (
       owner_id, event_id, enabled, notify_minutes, frequency
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id, event_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       notify_minutes = EXCLUDED.notify_minutes,
       frequency = EXCLUDED.frequency,
       updated_at = NOW()
     RETURNING event_id, enabled, notify_minutes, frequency`,
    [
      ownerId,
      reminder.eventId,
      reminder.enabled,
      reminder.notifyMinutes,
      reminder.frequency,
    ],
  ) as EventReminderRow[]
  const parsed = serializeRow(rows[0])
  if (!parsed) {
    return {
      ...reminder,
      custom: true,
    } satisfies ResolvedEventReminder
  }
  return {
    enabled: parsed.enabled,
    notifyMinutes: parsed.notifyMinutes,
    frequency: parsed.frequency,
    custom: true,
  } satisfies ResolvedEventReminder
}

export async function deleteEventReminderPreference(
  databaseUrl: string,
  ownerId: string,
  eventId: string,
) {
  const sql = neon(databaseUrl)
  await sql.query(
    `DELETE FROM event_notification_preferences
      WHERE owner_id = $1 AND event_id = $2`,
    [ownerId, eventId],
  )
}
