import type { CalendarEvent } from './events.js'
import {
  ALL_DAY_REMINDER_HOUR,
  FREQUENCY_INTERVAL_MINUTES,
  type NotifyMinutes,
  type ReminderFrequency,
} from './reminder-options.js'
import { dateKeyInTimeZone, formatInTimeZone, zonedLocalToUtc } from './zoned-time.js'

export type DueReminder = {
  event: CalendarEvent
  fireAt: Date
  eventStartAt: string
  fireKey: string
}

export type EventReminderSchedule = {
  notifyMinutes: NotifyMinutes
  frequency: ReminderFrequency
}

function allDayDate(value: string | null | undefined) {
  const date = value?.slice(0, 10)
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

function allDayMorning(date: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number)
  return zonedLocalToUtc(year, month, day, ALL_DAY_REMINDER_HOUR, 0, timezone)
}

export function reminderFireAt(
  event: CalendarEvent,
  timezone: string,
  notifyMinutes: NotifyMinutes,
) {
  if (event.allDay) {
    const date = allDayDate(event.startAt)
    if (!date) return null
    return new Date(allDayMorning(date, timezone).getTime() - notifyMinutes * 60_000)
  }

  const start = new Date(event.startAt)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() - notifyMinutes * 60_000)
}

export function reminderHorizon(event: CalendarEvent, timezone: string) {
  if (event.allDay) {
    const last = allDayDate(event.endAt) ?? allDayDate(event.startAt)
    if (!last) return null
    return allDayMorning(last, timezone)
  }
  const start = new Date(event.startAt)
  return Number.isNaN(start.getTime()) ? null : start
}

export function reminderOccurrenceKey(event: CalendarEvent) {
  if (event.allDay) return allDayDate(event.startAt) ?? event.startAt
  return event.startAt
}

function isDueFire(fireAt: Date, now: Date, lookbackMs: number) {
  const age = now.getTime() - fireAt.getTime()
  return age >= 0 && age <= lookbackMs
}

function dueFireTimes(
  event: CalendarEvent,
  timezone: string,
  schedule: EventReminderSchedule,
  now: Date,
  lookbackMs: number,
) {
  const first = reminderFireAt(event, timezone, schedule.notifyMinutes)
  const horizon = reminderHorizon(event, timezone)
  if (!first || !horizon) return []
  if (horizon.getTime() < first.getTime()) return []

  const intervalMinutes = FREQUENCY_INTERVAL_MINUTES[schedule.frequency]
  if (intervalMinutes == null) {
    return isDueFire(first, now, lookbackMs) ? [first] : []
  }

  const intervalMs = intervalMinutes * 60_000
  const horizonTime = horizon.getTime()
  const nowTime = now.getTime()
  const windowStart = nowTime - lookbackMs
  let current = first.getTime()
  if (current < windowStart) {
    const skip = Math.ceil((windowStart - current) / intervalMs)
    current += skip * intervalMs
  }

  const fires: Date[] = []
  while (current <= horizonTime && current <= nowTime) {
    const fireAt = new Date(current)
    if (isDueFire(fireAt, now, lookbackMs)) fires.push(fireAt)
    current += intervalMs
  }
  return fires
}

export function dueReminders(
  events: CalendarEvent[],
  now: Date,
  options: {
    timezone: string
    lookbackMs: number
    scheduleFor: (event: CalendarEvent) => EventReminderSchedule | null
  },
) {
  const due: DueReminder[] = []
  for (const event of events) {
    const schedule = options.scheduleFor(event)
    if (!schedule) continue
    if (!event.allDay) {
      const start = new Date(event.startAt)
      if (!Number.isNaN(start.getTime()) && start.getTime() < now.getTime() - 5 * 60_000) {
        continue
      }
    }
    const eventStartAt = reminderOccurrenceKey(event)
    const repeating = FREQUENCY_INTERVAL_MINUTES[schedule.frequency] != null
    for (const fireAt of dueFireTimes(event, options.timezone, schedule, now, options.lookbackMs)) {
      due.push({
        event,
        fireAt,
        eventStartAt,
        fireKey: repeating ? fireAt.toISOString() : 'once',
      })
    }
  }
  return due.sort((left, right) => left.fireAt.getTime() - right.fireAt.getTime())
}

export function reminderPayload(event: CalendarEvent, timezone: string) {
  if (event.allDay) {
    const location = event.location ? ` · ${event.location}` : ''
    return {
      title: event.title,
      body: `Today · All day${location}`,
      url: '/calendar',
      tag: `event:${event.id}`,
    }
  }

  const start = new Date(event.startAt)
  const when = Number.isNaN(start.getTime())
    ? 'soon'
    : formatInTimeZone(start, timezone, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  const today = dateKeyInTimeZone(new Date(), timezone) === dateKeyInTimeZone(start, timezone)
  const location = event.location ? ` · ${event.location}` : ''
  return {
    title: event.title,
    body: `${today ? 'Starts' : 'Upcoming'} ${when}${location}`,
    url: '/calendar',
    tag: `event:${event.id}`,
  }
}
