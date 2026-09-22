import assert from 'node:assert/strict'
import {
  expandRecurringEvent,
  occurrenceEventId,
  parseSavedEventRef,
  savedEventSeriesId,
  shiftOccurrenceStart,
} from './recurrence.ts'

const weekly = expandRecurringEvent(
  {
    id: 'saved:series-1',
    startAt: '2026-09-14T15:00:00.000Z',
    endAt: '2026-09-14T16:00:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: '2026-10-05' },
  new Date('2026-09-01T00:00:00.000Z'),
  new Date('2026-10-20T00:00:00.000Z'),
)
assert.deepEqual(weekly.map((event) => event.startAt), [
  '2026-09-14T15:00:00.000Z',
  '2026-09-21T15:00:00.000Z',
  '2026-09-28T15:00:00.000Z',
  '2026-10-05T15:00:00.000Z',
])
assert.equal(weekly[1].id, occurrenceEventId('series-1', '2026-09-21T15:00:00.000Z'))
assert.equal(weekly[1].endAt, '2026-09-21T16:00:00.000Z')
assert.equal(weekly[1].recurrence?.frequency, 'weekly')

const weekdays = expandRecurringEvent(
  {
    id: 'saved:school',
    startAt: '2026-09-14T15:00:00.000Z',
    endAt: '2026-09-14T16:00:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: '2026-09-21', weekdays: [1, 2, 3, 4, 5] },
  new Date('2026-09-13T00:00:00.000Z'),
  new Date('2026-09-22T00:00:00.000Z'),
)
assert.deepEqual(weekdays.map((event) => event.startAt), [
  '2026-09-14T15:00:00.000Z',
  '2026-09-15T15:00:00.000Z',
  '2026-09-16T15:00:00.000Z',
  '2026-09-17T15:00:00.000Z',
  '2026-09-18T15:00:00.000Z',
  '2026-09-21T15:00:00.000Z',
])

const skipWeekend = expandRecurringEvent(
  {
    id: 'saved:school',
    startAt: '2026-09-14T15:00:00.000Z',
    endAt: '2026-09-14T16:00:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: '2026-09-20', weekdays: [1, 2, 3, 4, 5] },
  new Date('2026-09-13T00:00:00.000Z'),
  new Date('2026-09-22T00:00:00.000Z'),
)
assert.deepEqual(skipWeekend.map((event) => event.startAt.slice(0, 10)), [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
])

const weekSlice = expandRecurringEvent(
  {
    id: 'saved:series-1',
    startAt: '2026-09-14T15:00:00.000Z',
    endAt: '2026-09-14T16:00:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: null },
  new Date('2026-09-21T00:00:00.000Z'),
  new Date('2026-09-28T00:00:00.000Z'),
)
assert.deepEqual(weekSlice.map((event) => event.startAt), ['2026-09-21T15:00:00.000Z'])

const dailyUntil = expandRecurringEvent(
  {
    id: 'saved:chores',
    startAt: '2026-09-14',
    endAt: null,
    allDay: true,
  },
  { frequency: 'daily', until: '2026-09-16' },
  new Date('2026-09-13T00:00:00.000Z'),
  new Date('2026-09-20T00:00:00.000Z'),
)
assert.deepEqual(dailyUntil.map((event) => event.startAt), [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
])

const multiDay = expandRecurringEvent(
  {
    id: 'saved:trip',
    startAt: '2026-09-14',
    endAt: '2026-09-16',
    allDay: true,
  },
  { frequency: 'weekly', until: '2026-09-28' },
  new Date('2026-09-01T00:00:00.000Z'),
  new Date('2026-10-10T00:00:00.000Z'),
)
assert.deepEqual(multiDay.map((event) => ({ startAt: event.startAt, endAt: event.endAt })), [
  { startAt: '2026-09-14', endAt: '2026-09-16' },
  { startAt: '2026-09-21', endAt: '2026-09-23' },
  { startAt: '2026-09-28', endAt: '2026-09-30' },
])

const lockUp = expandRecurringEvent(
  {
    id: 'saved:lock-up',
    startAt: '2026-09-15T05:00:00.000Z',
    endAt: '2026-09-21T05:30:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: '2026-09-21', weekdays: [1, 2, 3, 4, 5, 6, 7] },
  new Date('2026-09-14T00:00:00.000Z'),
  new Date('2026-09-28T00:00:00.000Z'),
)
assert.deepEqual(lockUp.map((event) => ({ startAt: event.startAt, endAt: event.endAt })), [
  { startAt: '2026-09-15T05:00:00.000Z', endAt: '2026-09-15T05:30:00.000Z' },
  { startAt: '2026-09-16T05:00:00.000Z', endAt: '2026-09-16T05:30:00.000Z' },
  { startAt: '2026-09-17T05:00:00.000Z', endAt: '2026-09-17T05:30:00.000Z' },
  { startAt: '2026-09-18T05:00:00.000Z', endAt: '2026-09-18T05:30:00.000Z' },
  { startAt: '2026-09-19T05:00:00.000Z', endAt: '2026-09-19T05:30:00.000Z' },
  { startAt: '2026-09-20T05:00:00.000Z', endAt: '2026-09-20T05:30:00.000Z' },
  { startAt: '2026-09-21T05:00:00.000Z', endAt: '2026-09-21T05:30:00.000Z' },
])
const afterSeries = expandRecurringEvent(
  {
    id: 'saved:lock-up',
    startAt: '2026-09-15T05:00:00.000Z',
    endAt: '2026-09-21T05:30:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: '2026-09-21', weekdays: [1, 2, 3, 4, 5, 6, 7] },
  new Date('2026-09-22T00:00:00.000Z'),
  new Date('2026-09-23T00:00:00.000Z'),
)
assert.deepEqual(afterSeries, [])

const overnight = expandRecurringEvent(
  {
    id: 'saved:night',
    startAt: '2026-09-14T22:00:00.000Z',
    endAt: '2026-09-21T02:00:00.000Z',
    allDay: false,
  },
  { frequency: 'weekly', until: '2026-09-21' },
  new Date('2026-09-14T00:00:00.000Z'),
  new Date('2026-09-22T00:00:00.000Z'),
)
assert.deepEqual(overnight.map((event) => ({ startAt: event.startAt, endAt: event.endAt })), [
  { startAt: '2026-09-14T22:00:00.000Z', endAt: '2026-09-15T02:00:00.000Z' },
  { startAt: '2026-09-21T22:00:00.000Z', endAt: '2026-09-22T02:00:00.000Z' },
])

const january = new Date('2026-01-31T15:00:00.000Z')
assert.equal(shiftOccurrenceStart(january, 'monthly', 1).toISOString(), '2026-02-28T15:00:00.000Z')
assert.equal(shiftOccurrenceStart(january, 'monthly', 2).toISOString(), '2026-03-31T15:00:00.000Z')

const leap = new Date('2024-02-29T12:00:00.000Z')
assert.equal(shiftOccurrenceStart(leap, 'yearly', 1).toISOString(), '2025-02-28T12:00:00.000Z')

const none = expandRecurringEvent(
  {
    id: 'saved:once',
    startAt: '2026-09-14T15:00:00.000Z',
    endAt: '2026-09-14T16:00:00.000Z',
    allDay: false,
  },
  null,
  new Date('2026-09-01T00:00:00.000Z'),
  new Date('2026-09-20T00:00:00.000Z'),
)
assert.equal(none.length, 1)
assert.equal(none[0].id, 'saved:once')
assert.equal(none[0].recurrence, null)

assert.deepEqual(parseSavedEventRef('saved:abc::2026-09-21T15:00:00.000Z'), {
  eventId: 'abc',
  occurrenceKey: '2026-09-21T15:00:00.000Z',
})
assert.equal(savedEventSeriesId('saved:abc::2026-09-21'), 'saved:abc')
assert.equal(savedEventSeriesId('google:cal:1'), 'google:cal:1')

console.log('recurrence tests passed')
