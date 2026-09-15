import { format } from 'date-fns'
import type { EventRecurrence, EventRecurrenceFrequency, IsoWeekday } from './events'

export const RECURRENCE_OPTIONS: Array<{ value: EventRecurrenceFrequency | ''; label: string }> = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

export const WEEKDAY_PICKS: Array<{ value: IsoWeekday; label: string; short: string }> = [
  { value: 1, label: 'Monday', short: 'M' },
  { value: 2, label: 'Tuesday', short: 'T' },
  { value: 3, label: 'Wednesday', short: 'W' },
  { value: 4, label: 'Thursday', short: 'T' },
  { value: 5, label: 'Friday', short: 'F' },
  { value: 6, label: 'Saturday', short: 'S' },
  { value: 7, label: 'Sunday', short: 'S' },
]

export const WEEKDAY_PRESET = [1, 2, 3, 4, 5] as IsoWeekday[]

export function recurrenceOptionLabel(value: EventRecurrenceFrequency | '') {
  return RECURRENCE_OPTIONS.find((option) => option.value === value)?.label ?? 'Does not repeat'
}

export function isoWeekdayFromJs(jsDay: number): IsoWeekday {
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday
}

export function isoWeekdayLocal(date: Date): IsoWeekday {
  return isoWeekdayFromJs(date.getDay())
}

export function isoWeekdayUtc(date: Date): IsoWeekday {
  return isoWeekdayFromJs(date.getUTCDay())
}

function shiftWeekdays(weekdays: IsoWeekday[], shift: number): IsoWeekday[] {
  const amount = ((shift % 7) + 7) % 7
  return [...new Set(weekdays.map((day) => (
    ((day - 1 + amount) % 7 + 1) as IsoWeekday
  )))].sort((left, right) => left - right)
}

export function localWeekdaysToUtc(start: Date, weekdays: IsoWeekday[]): IsoWeekday[] {
  return shiftWeekdays(weekdays, isoWeekdayUtc(start) - isoWeekdayLocal(start))
}

export function utcWeekdaysToLocal(start: Date, weekdays: IsoWeekday[]): IsoWeekday[] {
  return shiftWeekdays(weekdays, isoWeekdayLocal(start) - isoWeekdayUtc(start))
}

export function weekdayFromDateInput(date: string): IsoWeekday {
  return isoWeekdayLocal(new Date(`${date}T12:00:00`))
}

export function toggleWeekday(weekdays: IsoWeekday[], day: IsoWeekday): IsoWeekday[] {
  if (weekdays.includes(day)) {
    if (weekdays.length === 1) return weekdays
    return weekdays.filter((item) => item !== day)
  }
  return [...weekdays, day].sort((left, right) => left - right)
}

function sameDays(left: IsoWeekday[], right: IsoWeekday[]) {
  return left.length === right.length && left.every((day, index) => day === right[index])
}

function formatWeekdayList(weekdays: IsoWeekday[]) {
  if (sameDays(weekdays, WEEKDAY_PRESET)) return 'weekdays'
  if (sameDays(weekdays, [6, 7])) return 'weekends'
  if (weekdays.length === 7) return 'every day'
  const names = weekdays.map((day) => WEEKDAY_PICKS[day - 1].label)
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function ordinal(day: number) {
  const remainder = day % 100
  if (remainder >= 11 && remainder <= 13) return `${day}th`
  if (day % 10 === 1) return `${day}st`
  if (day % 10 === 2) return `${day}nd`
  if (day % 10 === 3) return `${day}rd`
  return `${day}th`
}

function untilLabel(until: string | null) {
  if (!until) return null
  const [year, month, day] = until.split('-').map(Number)
  const date = year && month && day ? new Date(year, month - 1, day) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return format(date, 'MMM d, yyyy')
}

export function recurrenceSummary(
  recurrence: EventRecurrence | null | undefined,
  start: Date,
) {
  if (!recurrence) return null
  let base = 'Repeats every day'
  if (recurrence.frequency === 'weekly') {
    const weekdays = recurrence.weekdays?.length
      ? recurrence.weekdays
      : [isoWeekdayLocal(start)]
    base = `Repeats ${formatWeekdayList(weekdays)}`
  }
  if (recurrence.frequency === 'monthly') base = `Repeats monthly on the ${ordinal(start.getDate())}`
  if (recurrence.frequency === 'yearly') base = `Repeats every ${format(start, 'MMMM d')}`
  const until = untilLabel(recurrence.until)
  return until ? `${base} until ${until}` : base
}
