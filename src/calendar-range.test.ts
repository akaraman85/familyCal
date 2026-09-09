import assert from 'node:assert/strict'
import { eventOverlapsRange, eventTimeRange } from '../api/_lib/event-range.ts'
import { eventOccursOnDay, mergeCalendarEvents, parseCalendarDate } from './calendar-range.ts'
import type { CalendarEventData } from './events.ts'

const allDay = {
  startAt: '2026-09-09',
  endAt: null as string | null,
  allDay: true,
}
const dayStart = new Date('2026-09-09T04:00:00.000Z')
const dayEnd = new Date('2026-09-10T04:00:00.000Z')
const weekStart = new Date('2026-09-07T04:00:00.000Z')
const weekEnd = new Date('2026-09-14T04:00:00.000Z')

assert.equal(eventOverlapsRange(allDay, weekStart, weekEnd), true)
assert.equal(eventOverlapsRange(allDay, dayStart, dayEnd), true)

const zeroDuration = { startAt: '2026-09-09', endAt: '2026-09-09', allDay: true }
assert.equal(eventOverlapsRange(zeroDuration, dayStart, dayEnd), true)
assert.ok(eventTimeRange(zeroDuration).end > eventTimeRange(zeroDuration).start)

const isoAllDay = {
  startAt: '2026-09-09T00:00:00.000Z',
  endAt: '2026-09-09T00:00:00.000Z',
  allDay: true,
}
assert.equal(Number.isNaN(eventTimeRange(isoAllDay).start), false)
assert.equal(eventOverlapsRange(isoAllDay, dayStart, dayEnd), true)

const timed = {
  startAt: '2026-09-09T22:00:00.000Z',
  endAt: '2026-09-09T23:00:00.000Z',
  allDay: false,
}
assert.equal(eventOverlapsRange(timed, dayStart, dayEnd), true)

const googleSpan = {
  date: new Date(2026, 8, 7),
  endDate: new Date(2026, 8, 10),
  allDay: true,
  source: 'google' as const,
}
assert.equal(eventOccursOnDay(googleSpan, new Date(2026, 8, 7)), true)
assert.equal(eventOccursOnDay(googleSpan, new Date(2026, 8, 9)), true)
assert.equal(eventOccursOnDay(googleSpan, new Date(2026, 8, 10)), false)

const savedSpan = {
  date: new Date(2026, 8, 7),
  endDate: new Date(2026, 8, 9),
  allDay: true,
  source: 'saved' as const,
}
assert.equal(eventOccursOnDay(savedSpan, new Date(2026, 8, 7)), true)
assert.equal(eventOccursOnDay(savedSpan, new Date(2026, 8, 9)), true)
assert.equal(eventOccursOnDay(savedSpan, new Date(2026, 8, 10)), false)

assert.deepEqual(parseCalendarDate('2026-09-09'), new Date(2026, 8, 9))
assert.deepEqual(parseCalendarDate('2026-09-09T00:00:00.000Z'), new Date(2026, 8, 9))

const existing: CalendarEventData[] = [{
  id: 'google:week',
  title: 'Peer dinner',
  startAt: '2026-09-09T22:00:00.000Z',
  endAt: '2026-09-09T23:00:00.000Z',
  allDay: false,
  calendar: 'Family',
  location: null,
  description: null,
  externalUrl: null,
  organizer: null,
  source: 'google',
}]
const merged = mergeCalendarEvents(existing, [], { start: dayStart, end: dayEnd }, false)
assert.equal(merged.length, 1)
const pruned = mergeCalendarEvents(existing, [], { start: dayStart, end: dayEnd }, true)
assert.equal(pruned.length, 0)
const kept = mergeCalendarEvents(
  existing,
  [{ ...existing[0], title: 'Updated' }],
  { start: dayStart, end: dayEnd },
  true,
)
assert.equal(kept[0].title, 'Updated')

console.log('calendar-range tests passed')
