import assert from 'node:assert/strict'
import {
  allDayRangeDraft,
  dateAtMinutes,
  dayIndexFromClientX,
  DEFAULT_EVENT_MINUTES,
  draftForDate,
  minutesFromClientY,
  movedEventBounds,
  movedEventWrite,
  SNAP_MINUTES,
  snapMinutes,
  slotToDraft,
  TIMELINE_END_MINUTES,
  TIMELINE_START_MINUTES,
} from './calendar-slot.ts'

assert.equal(snapMinutes(8 * 60 + 7), 8 * 60)
assert.equal(snapMinutes(8 * 60 + 8), 8 * 60 + SNAP_MINUTES)
assert.equal(snapMinutes(6 * 60), TIMELINE_START_MINUTES)
assert.equal(snapMinutes(24 * 60), TIMELINE_END_MINUTES)

const rect = { top: 0, height: 160, left: 56, width: 700 } as DOMRect
assert.equal(minutesFromClientY(0, rect), TIMELINE_START_MINUTES)
assert.equal(minutesFromClientY(160, rect), TIMELINE_END_MINUTES)
assert.equal(dayIndexFromClientX(56, rect, 7, 56), 0)
assert.equal(dayIndexFromClientX(755, rect, 7, 56), 6)

const day = new Date(2026, 7, 27)
const draft = slotToDraft(day, 10 * 60, 10 * 60)
assert.equal(draft.date, '2026-08-27')
assert.equal(draft.time, '10:00')
assert.equal(draft.endTime, '11:00')
assert.equal(draft.allDay, false)

const ranged = slotToDraft(day, 14 * 60, 15 * 60 + 30)
assert.equal(ranged.time, '14:00')
assert.equal(ranged.endTime, '15:30')

const overnight = slotToDraft(day, 23 * 60, 24 * 60)
assert.equal(overnight.date, '2026-08-27')
assert.equal(overnight.endDate, '2026-08-28')
assert.equal(overnight.endTime, '00:00')

const allDay = allDayRangeDraft(day, new Date(2026, 7, 29))
assert.equal(allDay.allDay, true)
assert.equal(allDay.date, '2026-08-27')
assert.equal(allDay.endDate, '2026-08-29')

const defaultDraft = draftForDate(day)
assert.equal(defaultDraft.time, '09:00')
assert.equal(defaultDraft.endTime, '10:00')

const saved = {
  id: 'saved:1',
  source: 'saved' as const,
  date: dateAtMinutes(day, 9 * 60),
  endDate: dateAtMinutes(day, 10 * 60),
  allDay: false,
  title: 'Pickup',
  calendar: 'Family',
}
const moved = movedEventBounds(saved, dateAtMinutes(new Date(2026, 7, 28), 13 * 60), false)
assert.equal(moved.start.toISOString(), dateAtMinutes(new Date(2026, 7, 28), 13 * 60).toISOString())
assert.equal(moved.end?.toISOString(), dateAtMinutes(new Date(2026, 7, 28), 14 * 60).toISOString())

const write = movedEventWrite(saved, moved.start, moved.end, false)
assert.equal(write.title, 'Pickup')
assert.equal(write.allDay, false)
assert.ok(write.endAt)

const allDayEvent = {
  ...saved,
  allDay: true,
  date: new Date(2026, 7, 27),
  endDate: new Date(2026, 7, 29),
}
const allDayMove = movedEventBounds(allDayEvent, new Date(2026, 8, 1), true)
assert.equal(allDayMove.start.toISOString(), new Date(2026, 8, 1).toISOString())
assert.equal(allDayMove.end?.toISOString(), new Date(2026, 8, 3).toISOString())
assert.equal(DEFAULT_EVENT_MINUTES, 60)

console.log('calendar-slot tests passed')
