import { format } from 'date-fns'
import type { EventRecurrence, EventRecurrenceFrequency } from './events'

export const RECURRENCE_OPTIONS: Array<{ value: EventRecurrenceFrequency | ''; label: string }> = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

export function recurrenceOptionLabel(value: EventRecurrenceFrequency | '') {
  return RECURRENCE_OPTIONS.find((option) => option.value === value)?.label ?? 'Does not repeat'
}

function ordinal(day: number) {
  const remainder = day % 100
  if (remainder >= 11 && remainder <= 13) return `${day}th`
  if (day % 10 === 1) return `${day}st`
  if (day % 10 === 2) return `${day}nd`
  if (day % 10 === 3) return `${day}rd`
  return `${day}th`
}

export function recurrenceSummary(
  recurrence: EventRecurrence | null | undefined,
  start: Date,
) {
  if (!recurrence) return null
  let base = 'Repeats every day'
  if (recurrence.frequency === 'weekly') base = `Repeats every ${format(start, 'EEEE')}`
  if (recurrence.frequency === 'monthly') base = `Repeats monthly on the ${ordinal(start.getDate())}`
  if (recurrence.frequency === 'yearly') base = `Repeats every ${format(start, 'MMMM d')}`
  if (!recurrence.until) return `${base}`
  const [year, month, day] = recurrence.until.split('-').map(Number)
  const until = year && month && day ? new Date(year, month - 1, day) : null
  if (!until || Number.isNaN(until.getTime())) return base
  return `${base} until ${format(until, 'MMM d, yyyy')}`
}
