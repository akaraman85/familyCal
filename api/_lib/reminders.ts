import type { CalendarEvent } from './events.js'
import { ALL_DAY_REMINDER_HOUR, type ReminderMinutes } from './push.js'
import { dateKeyInTimeZone, formatInTimeZone, zonedLocalToUtc } from './zoned-time.js'

export type DueReminder = {
  event: CalendarEvent
  fireAt: Date
  eventStartAt: string
}

function allDayDate(event: CalendarEvent) {
  const value = event.startAt.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function reminderFireAt(
  event: CalendarEvent,
  timezone: string,
  reminderMinutes: ReminderMinutes,
) {
  if (event.allDay) {
    const date = allDayDate(event)
    if (!date) return null
    const [year, month, day] = date.split('-').map(Number)
    return zonedLocalToUtc(year, month, day, ALL_DAY_REMINDER_HOUR, 0, timezone)
  }

  const start = new Date(event.startAt)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() - reminderMinutes * 60_000)
}

export function dueReminders(
  events: CalendarEvent[],
  now: Date,
  options: {
    timezone: string
    reminderMinutes: ReminderMinutes
    lookbackMs: number
  },
) {
  const due: DueReminder[] = []
  for (const event of events) {
    const fireAt = reminderFireAt(event, options.timezone, options.reminderMinutes)
    if (!fireAt) continue
    const age = now.getTime() - fireAt.getTime()
    if (age < 0 || age > options.lookbackMs) continue
    if (!event.allDay) {
      const start = new Date(event.startAt)
      if (!Number.isNaN(start.getTime()) && start.getTime() < now.getTime() - 5 * 60_000) {
        continue
      }
    }
    due.push({
      event,
      fireAt,
      eventStartAt: event.allDay ? (allDayDate(event) ?? event.startAt) : event.startAt,
    })
  }
  return due.sort((left, right) => left.fireAt.getTime() - right.fireAt.getTime())
}

export function reminderPayload(event: CalendarEvent, timezone: string) {
  if (event.allDay) {
    const location = event.location ? ` · ${event.location}` : ''
    return {
      title: event.title,
      body: `Today · All day${location}`,
      url: '/',
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
    url: '/',
    tag: `event:${event.id}`,
  }
}
