import assert from 'node:assert/strict'
import type { CalendarEvent } from './events.ts'
import {
  dueReminders,
  reminderFireAt,
  reminderHorizon,
  reminderPayload,
} from './reminders.ts'

const timezone = 'America/New_York'

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'startAt'>): CalendarEvent {
  return {
    title: 'Piano lesson',
    endAt: null,
    allDay: false,
    calendar: 'Family',
    location: 'Studio',
    description: null,
    externalUrl: null,
    organizer: null,
    source: 'saved',
    ...partial,
  }
}

const timed = event({
  id: 'saved:lesson',
  startAt: '2026-09-12T16:00:00.000Z',
})

assert.equal(
  reminderFireAt(timed, timezone, 30)?.toISOString(),
  '2026-09-12T15:30:00.000Z',
)
assert.equal(
  reminderFireAt(timed, timezone, 0)?.toISOString(),
  '2026-09-12T16:00:00.000Z',
)
assert.equal(
  reminderHorizon(timed, timezone)?.toISOString(),
  '2026-09-12T16:00:00.000Z',
)

const allDay = event({
  id: 'saved:holiday',
  startAt: '2026-09-14',
  endAt: '2026-09-15',
  allDay: true,
  location: null,
})
assert.equal(
  reminderFireAt(allDay, timezone, 0)?.toISOString(),
  '2026-09-14T12:00:00.000Z',
)
assert.equal(
  reminderFireAt(allDay, timezone, 1440)?.toISOString(),
  '2026-09-13T12:00:00.000Z',
)
assert.equal(
  reminderHorizon(allDay, timezone)?.toISOString(),
  '2026-09-15T12:00:00.000Z',
)

const now = new Date('2026-09-12T15:31:00.000Z')
const onceDue = dueReminders([timed], now, {
  timezone,
  lookbackMs: 2 * 60 * 60 * 1000,
  scheduleFor: () => ({ notifyMinutes: 30, frequency: 'once' }),
})
assert.equal(onceDue.length, 1)
assert.equal(onceDue[0]?.fireKey, 'once')
assert.equal(onceDue[0]?.fireAt.toISOString(), '2026-09-12T15:30:00.000Z')

const repeatingDue = dueReminders([timed], new Date('2026-09-12T15:46:00.000Z'), {
  timezone,
  lookbackMs: 2 * 60 * 60 * 1000,
  scheduleFor: () => ({ notifyMinutes: 30, frequency: 'every_15m' }),
})
assert.deepEqual(
  repeatingDue.map((item) => item.fireAt.toISOString()),
  ['2026-09-12T15:30:00.000Z', '2026-09-12T15:45:00.000Z'],
)
assert.ok(repeatingDue.every((item) => item.fireKey !== 'once'))

const skippedOff = dueReminders([timed], now, {
  timezone,
  lookbackMs: 2 * 60 * 60 * 1000,
  scheduleFor: () => null,
})
assert.equal(skippedOff.length, 0)

const started = dueReminders([timed], new Date('2026-09-12T16:10:00.000Z'), {
  timezone,
  lookbackMs: 2 * 60 * 60 * 1000,
  scheduleFor: () => ({ notifyMinutes: 0, frequency: 'once' }),
})
assert.equal(started.length, 0)

const dailyAllDay = dueReminders([allDay], new Date('2026-09-14T12:05:00.000Z'), {
  timezone,
  lookbackMs: 2 * 60 * 60 * 1000,
  scheduleFor: () => ({ notifyMinutes: 1440, frequency: 'daily' }),
})
assert.equal(dailyAllDay.length, 1)
assert.equal(dailyAllDay[0]?.fireAt.toISOString(), '2026-09-14T12:00:00.000Z')

const payload = reminderPayload(timed, timezone)
assert.equal(payload.title, 'Piano lesson')
assert.match(payload.body, /Studio/)
assert.equal(payload.tag, 'event:saved:lesson')

console.log('reminder tests passed')
