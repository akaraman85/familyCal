import { addDays, startOfDay } from 'date-fns'
import { eventOverlapsRange } from '../api/_lib/event-range.ts'
import type { CalendarEventData } from './events'

export function mergeCalendarEvents(
  current: CalendarEventData[],
  incoming: CalendarEventData[],
  range: { start: Date; end: Date },
  prune: boolean,
) {
  const incomingIds = new Set(incoming.map((event) => event.id))
  const next = new Map<string, CalendarEventData>()
  for (const event of current) {
    const missingFromRange = eventOverlapsRange(event, range.start, range.end)
      && !incomingIds.has(event.id)
    // Saved events are complete for the range; Google results can be stale.
    if (missingFromRange && (prune || event.source === 'saved')) continue
    next.set(event.id, event)
  }
  for (const event of incoming) next.set(event.id, event)
  return [...next.values()]
}

export function omitCalendarEvent<T extends { id: string }>(events: T[], id: string) {
  return events.filter((event) => event.id !== id)
}

export function eventOccursOnDay(
  event: { date: Date; endDate?: Date; allDay: boolean; source?: 'saved' | 'google' },
  day: Date,
) {
  const dayStart = startOfDay(day)
  const start = startOfDay(event.date)
  const dayTime = dayStart.getTime()
  const startTime = start.getTime()
  if (!event.endDate) return dayTime === startTime
  if (event.allDay) {
    const end = startOfDay(event.endDate)
    const exclusiveEnd = event.source === 'google'
      ? (end.getTime() <= startTime ? addDays(start, 1) : end)
      : addDays(end, 1)
    return dayTime >= startTime && dayTime < exclusiveEnd.getTime()
  }
  return event.date.getTime() < addDays(dayStart, 1).getTime()
    && event.endDate.getTime() > dayTime
}

export function parseCalendarDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return new Date(value)
  return new Date(year, month - 1, day)
}
