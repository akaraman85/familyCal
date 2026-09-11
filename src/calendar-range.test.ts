import assert from 'node:assert/strict'
import { eventOverlapsRange, eventTimeRange } from '../api/_lib/event-range.ts'
import {
  eventOccursOnDay,
  mergeCalendarEvents,
  omitCalendarEvent,
  parseCalendarDate,
} from './calendar-range.ts'
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

function eventData(
  id: string,
  source: CalendarEventData['source'],
  startAt: string,
  endAt: string | null = null,
  title = id,
): CalendarEventData {
  return {
    id,
    title,
    startAt,
    endAt,
    allDay: !startAt.includes('T'),
    calendar: 'Family',
    location: null,
    description: null,
    externalUrl: null,
    organizer: null,
    source,
  }
}

const existing: CalendarEventData[] = [eventData(
  'google:week',
  'google',
  '2026-09-09T22:00:00.000Z',
  '2026-09-09T23:00:00.000Z',
  'Peer dinner',
)]
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

const savedInRange = eventData('saved:deleted', 'saved', '2026-09-09T18:00:00.000Z', '2026-09-09T19:00:00.000Z')
const savedOutside = eventData('saved:next-week', 'saved', '2026-09-16T18:00:00.000Z', '2026-09-16T19:00:00.000Z')
const googleKept = existing[0]
const afterDelete = mergeCalendarEvents(
  [savedInRange, savedOutside, googleKept],
  [],
  { start: dayStart, end: dayEnd },
  false,
)
assert.deepEqual(afterDelete.map((event) => event.id), ['saved:next-week', 'google:week'])

const remainingSaved = eventData('saved:kept', 'saved', '2026-09-09T20:00:00.000Z', '2026-09-09T21:00:00.000Z')
const refreshed = mergeCalendarEvents(
  [savedInRange, remainingSaved],
  [remainingSaved],
  { start: dayStart, end: dayEnd },
  false,
)
assert.deepEqual(refreshed.map((event) => event.id), ['saved:kept'])

assert.deepEqual(
  omitCalendarEvent([savedInRange, remainingSaved], 'saved:deleted').map((event) => event.id),
  ['saved:kept'],
)

console.log('calendar-range tests passed')
