import { neon } from '@neondatabase/serverless'

export const CALENDAR_VIEWS = ['Day', 'Week', 'Month', 'Year'] as const
export const WEEK_STARTS = ['monday', 'sunday'] as const

export type CalendarView = (typeof CALENDAR_VIEWS)[number]
export type WeekStart = (typeof WEEK_STARTS)[number]

export type CalendarSettings = {
  defaultView: CalendarView
  weekStartsOn: WeekStart
  showWeekends: boolean
  dailyAgendaEmail: boolean
}

type CalendarSettingsRow = {
  default_view: CalendarView
  week_starts_on: WeekStart
  show_weekends: boolean
  daily_agenda_email: boolean
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  defaultView: 'Month',
  weekStartsOn: 'monday',
  showWeekends: true,
  dailyAgendaEmail: false,
}

function serialize(row: CalendarSettingsRow | undefined): CalendarSettings {
  if (!row) return DEFAULT_CALENDAR_SETTINGS
  return {
    defaultView: row.default_view,
    weekStartsOn: row.week_starts_on,
    showWeekends: row.show_weekends,
    dailyAgendaEmail: row.daily_agenda_email,
  }
}

export function isCalendarView(value: unknown): value is CalendarView {
  return typeof value === 'string' && (CALENDAR_VIEWS as readonly string[]).includes(value)
}

export function isWeekStart(value: unknown): value is WeekStart {
  return typeof value === 'string' && (WEEK_STARTS as readonly string[]).includes(value)
}

export async function getCalendarSettings(databaseUrl: string, ownerId: string) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT default_view, week_starts_on, show_weekends, daily_agenda_email
       FROM calendar_settings
      WHERE owner_id = $1
      LIMIT 1`,
    [ownerId],
  ) as CalendarSettingsRow[]
  return serialize(rows[0])
}

export async function saveCalendarSettings(
  databaseUrl: string,
  ownerId: string,
  settings: CalendarSettings,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO calendar_settings (
       owner_id, default_view, week_starts_on, show_weekends, daily_agenda_email
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id) DO UPDATE SET
       default_view = EXCLUDED.default_view,
       week_starts_on = EXCLUDED.week_starts_on,
       show_weekends = EXCLUDED.show_weekends,
       daily_agenda_email = EXCLUDED.daily_agenda_email,
       updated_at = NOW()
     RETURNING default_view, week_starts_on, show_weekends, daily_agenda_email`,
    [
      ownerId,
      settings.defaultView,
      settings.weekStartsOn,
      settings.showWeekends,
      settings.dailyAgendaEmail,
    ],
  ) as CalendarSettingsRow[]
  return serialize(rows[0])
}
