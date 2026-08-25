export const CALENDAR_VIEWS = ['Day', 'Week', 'Month', 'Year'] as const
export const WEEK_STARTS = ['monday', 'sunday'] as const

export type CalendarView = (typeof CALENDAR_VIEWS)[number]
export type WeekStart = (typeof WEEK_STARTS)[number]
export type WeekStartDay = 0 | 1

export type CalendarSettings = {
  defaultView: CalendarView
  weekStartsOn: WeekStart
  showWeekends: boolean
  dailyAgendaEmail: boolean
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  defaultView: 'Month',
  weekStartsOn: 'monday',
  showWeekends: true,
  dailyAgendaEmail: false,
}

export const WEEKDAY_LABELS: Record<WeekStart, string[]> = {
  monday: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  sunday: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
}

export const MINI_WEEKDAY_LABELS: Record<WeekStart, string[]> = {
  monday: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  sunday: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
}

export function weekStartDay(weekStartsOn: WeekStart): WeekStartDay {
  return weekStartsOn === 'sunday' ? 0 : 1
}

export function isWeekendDate(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function yearGridOffset(firstOfMonth: Date, weekStartsOn: WeekStart) {
  return (firstOfMonth.getDay() - weekStartDay(weekStartsOn) + 7) % 7
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as {
    error?: string
  } & T
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export async function loadCalendarSettings() {
  const response = await fetch('/api/settings/calendar', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{ settings: CalendarSettings }>(response)
}

export async function updateCalendarSettings(settings: CalendarSettings) {
  const response = await fetch('/api/settings/calendar', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(settings),
  })
  return responseJson<{ settings: CalendarSettings }>(response)
}
