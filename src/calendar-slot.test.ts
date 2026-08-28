import assert from 'node:assert/strict'
import {
  allDayRangeDraft,
  dateAtMinutes,
  dayIndexFromClientX,
  DEFAULT_EVENT_MINUTES,
  draftForDate,
  layoutGridTimedEvents,
  layoutOverlappingTimedEvents,
  minutesFromClientY,
  movedEventBounds,
  movedEventWrite,
  SNAP_MINUTES,
  snapMinutes,
  slotToDraft,
  TIMELINE_END_MINUTES,
  TIMELINE_START_MINUTES,
  timedEventRange,
  timedOverlapStyleVars,
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

const solo = layoutOverlappingTimedEvents([
  { id: 'a', startMinutes: 9 * 60, endMinutes: 10 * 60 },
])
assert.deepEqual(solo.get('a'), { column: 0, columnCount: 1 })

const identical = layoutOverlappingTimedEvents([
  { id: 'a', startMinutes: 9 * 60, endMinutes: 10 * 60 },
  { id: 'b', startMinutes: 9 * 60, endMinutes: 10 * 60 },
])
assert.deepEqual(identical.get('a'), { column: 0, columnCount: 2 })
assert.deepEqual(identical.get('b'), { column: 1, columnCount: 2 })

const partial = layoutOverlappingTimedEvents([
  { id: 'long', startMinutes: 9 * 60, endMinutes: 12 * 60 },
  { id: 'short', startMinutes: 10 * 60, endMinutes: 11 * 60 },
])
assert.deepEqual(partial.get('long'), { column: 0, columnCount: 2 })
assert.deepEqual(partial.get('short'), { column: 1, columnCount: 2 })

const touching = layoutOverlappingTimedEvents([
  { id: 'first', startMinutes: 9 * 60, endMinutes: 10 * 60 },
  { id: 'second', startMinutes: 10 * 60, endMinutes: 11 * 60 },
])
assert.deepEqual(touching.get('first'), { column: 0, columnCount: 1 })
assert.deepEqual(touching.get('second'), { column: 0, columnCount: 1 })

const chain = layoutOverlappingTimedEvents([
  { id: 'a', startMinutes: 9 * 60, endMinutes: 10 * 60 + 30 },
  { id: 'b', startMinutes: 10 * 60, endMinutes: 11 * 60 + 30 },
  { id: 'c', startMinutes: 11 * 60, endMinutes: 12 * 60 },
])
assert.deepEqual(chain.get('a'), { column: 0, columnCount: 2 })
assert.deepEqual(chain.get('b'), { column: 1, columnCount: 2 })
assert.deepEqual(chain.get('c'), { column: 0, columnCount: 2 })

const triple = layoutOverlappingTimedEvents([
  { id: 'a', startMinutes: 14 * 60, endMinutes: 15 * 60 },
  { id: 'b', startMinutes: 14 * 60, endMinutes: 15 * 60 },
  { id: 'c', startMinutes: 14 * 60, endMinutes: 15 * 60 },
])
assert.equal(triple.get('a')?.columnCount, 3)
assert.deepEqual([...triple.values()].map((item) => item.column).sort(), [0, 1, 2])

const separateDays = layoutOverlappingTimedEvents([
  { id: 'morning', startMinutes: 8 * 60, endMinutes: 9 * 60 },
  { id: 'afternoon', startMinutes: 15 * 60, endMinutes: 16 * 60 },
])
assert.deepEqual(separateDays.get('morning'), { column: 0, columnCount: 1 })
assert.deepEqual(separateDays.get('afternoon'), { column: 0, columnCount: 1 })

const gridEvents = layoutGridTimedEvents([
  {
    id: 'saved:1',
    source: 'saved',
    date: dateAtMinutes(day, 9 * 60),
    endDate: dateAtMinutes(day, 10 * 60),
    allDay: false,
    title: 'Pickup',
    calendar: 'Family',
  },
  {
    id: 'google:1',
    source: 'google',
    date: dateAtMinutes(day, 9 * 60),
    endDate: dateAtMinutes(day, 10 * 60),
    allDay: false,
    title: 'School',
    calendar: 'Maya',
  },
  {
    id: 'saved:all-day',
    source: 'saved',
    date: day,
    allDay: true,
    title: 'Holiday',
    calendar: 'Family',
  },
])
assert.equal(gridEvents.size, 2)
assert.deepEqual(gridEvents.get('google:1'), { column: 0, columnCount: 2 })
assert.deepEqual(gridEvents.get('saved:1'), { column: 1, columnCount: 2 })
assert.equal(timedEventRange({ allDay: true, date: day }), null)

const splitVars = timedOverlapStyleVars({ column: 1, columnCount: 3 })
assert.equal(splitVars['--event-col'], '1')
assert.equal(splitVars['--event-cols'], '3')
assert.equal(splitVars['--event-not-last'], '1')
const lastVars = timedOverlapStyleVars({ column: 2, columnCount: 3 })
assert.equal(lastVars['--event-not-last'], '0')

console.log('calendar-slot tests passed')
