import assert from 'node:assert/strict'
import { eventOverlapsRange, eventTimeRange } from './event-range.ts'

const dayStart = new Date('2026-09-09T04:00:00.000Z')
const dayEnd = new Date('2026-09-10T04:00:00.000Z')

assert.equal(
  eventOverlapsRange({ startAt: '2026-09-09', endAt: null, allDay: true }, dayStart, dayEnd),
  true,
)
assert.equal(
  eventOverlapsRange({ startAt: '2026-09-09', endAt: '2026-09-09', allDay: true }, dayStart, dayEnd),
  true,
)

const iso = eventTimeRange({
  startAt: '2026-09-09T00:00:00.000Z',
  endAt: '2026-09-09T00:00:00.000Z',
  allDay: true,
})
assert.equal(Number.isNaN(iso.start), false)
assert.ok(iso.end > iso.start)
assert.equal(
  eventOverlapsRange({
    startAt: '2026-09-09T00:00:00.000Z',
    endAt: '2026-09-09T00:00:00.000Z',
    allDay: true,
  }, dayStart, dayEnd),
  true,
)

console.log('event-range tests passed')
