import assert from 'node:assert/strict'
import { recurrenceOptionLabel, recurrenceSummary, toggleWeekday } from './event-recurrence.ts'

assert.equal(recurrenceOptionLabel(''), 'Does not repeat')
assert.equal(recurrenceOptionLabel('weekly'), 'Every week')
assert.equal(
  recurrenceSummary({ frequency: 'weekly', until: null }, new Date(2026, 8, 14)),
  'Repeats Monday',
)
assert.equal(
  recurrenceSummary(
    { frequency: 'weekly', until: '2026-12-18', weekdays: [1, 2, 3, 4, 5] },
    new Date(2026, 8, 14),
  ),
  'Repeats weekdays until Dec 18, 2026',
)
assert.equal(
  recurrenceSummary({ frequency: 'monthly', until: '2026-12-31' }, new Date(2026, 0, 31)),
  'Repeats monthly on the 31st until Dec 31, 2026',
)
assert.equal(recurrenceSummary(null, new Date(2026, 8, 14)), null)
assert.deepEqual(toggleWeekday([1], 1), [1])
assert.deepEqual(toggleWeekday([1], 5), [1, 5])
assert.deepEqual(toggleWeekday([1, 5], 1), [5])

console.log('event-recurrence tests passed')
