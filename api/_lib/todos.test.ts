import assert from 'node:assert/strict'
import {
  compareTodos,
  parseSavedEventId,
  parseTodoDueOn,
  parseTodoNotes,
  parseTodoPatch,
  parseTodoTitle,
  parseTodoWrite,
  publicSavedEventId,
  serializeTodo,
  todoMatchesFilters,
  TodoValidationError,
  type HouseholdTodo,
} from './todo-model.ts'

function todo(partial: Partial<HouseholdTodo> & Pick<HouseholdTodo, 'id' | 'title'>): HouseholdTodo {
  return {
    notes: null,
    dueOn: null,
    assigneeId: null,
    completed: false,
    completedAt: null,
    sortOrder: 1,
    createdAt: '2026-09-26T12:00:00.000Z',
    updatedAt: '2026-09-26T12:00:00.000Z',
    calendarEvent: null,
    ...partial,
  }
}

assert.equal(parseTodoTitle(' Buy milk '), 'Buy milk')
assert.throws(() => parseTodoTitle(''), TodoValidationError)
assert.throws(() => parseTodoTitle('   '), TodoValidationError)
assert.throws(() => parseTodoTitle('x'.repeat(201)), TodoValidationError)

assert.equal(parseTodoNotes('  extra  '), 'extra')
assert.equal(parseTodoNotes(''), null)
assert.equal(parseTodoNotes(null), null)
assert.throws(() => parseTodoNotes('n'.repeat(2001)), TodoValidationError)

assert.equal(parseTodoDueOn('2026-10-02'), '2026-10-02')
assert.equal(parseTodoDueOn(''), null)
assert.throws(() => parseTodoDueOn('10/02/2026'), TodoValidationError)
assert.throws(() => parseTodoDueOn('2026-13-40'), TodoValidationError)

assert.deepEqual(parseTodoWrite({ title: 'Call school', notes: '', dueOn: '', assigneeId: '' }), {
  title: 'Call school',
  notes: null,
  dueOn: null,
  assigneeId: null,
})

assert.deepEqual(parseTodoPatch({ completed: true, calendarEventId: 'saved:evt-1' }), {
  completed: true,
  calendarEventId: 'evt-1',
})
assert.deepEqual(parseTodoPatch({ calendarEventId: null, removeFromCalendar: true }), {
  calendarEventId: null,
  removeFromCalendar: true,
})
assert.throws(() => parseTodoPatch({ completed: 'yes' }), TodoValidationError)

assert.equal(parseSavedEventId('saved:abc'), 'abc')
assert.equal(parseSavedEventId('abc'), 'abc')
assert.equal(publicSavedEventId('abc'), 'saved:abc')
assert.throws(() => parseSavedEventId('google:cal:1'), TodoValidationError)

const openUnassigned = todo({ id: '1', title: 'Open', dueOn: '2026-10-03' })
const openAssigned = todo({ id: '2', title: 'Alex task', assigneeId: 'alex', dueOn: '2026-10-01' })
const done = todo({
  id: '3',
  title: 'Done',
  completed: true,
  completedAt: '2026-09-20T12:00:00.000Z',
  assigneeId: 'alex',
})

assert.equal(todoMatchesFilters(openUnassigned, 'open', 'everyone'), true)
assert.equal(todoMatchesFilters(done, 'open', 'everyone'), false)
assert.equal(todoMatchesFilters(done, 'completed', 'everyone'), true)
assert.equal(todoMatchesFilters(openAssigned, 'all', 'alex'), true)
assert.equal(todoMatchesFilters(openUnassigned, 'all', 'alex'), false)
assert.equal(todoMatchesFilters(openUnassigned, 'all', 'unassigned'), true)

const sorted = [done, openUnassigned, openAssigned].sort(compareTodos)
assert.deepEqual(sorted.map((item) => item.id), ['2', '1', '3'])

assert.deepEqual(serializeTodo({
  id: 'todo-1',
  title: 'Pack bags',
  notes: 'shoes',
  due_on: '2026-10-04',
  assignee_id: 'maya',
  calendar_event_id: 'evt-9',
  completed_at: null,
  sort_order: 2,
  created_at: '2026-09-26T10:00:00.000Z',
  updated_at: '2026-09-26T11:00:00.000Z',
  event_title: 'Pack bags',
  event_start_at: '2026-10-04T00:00:00.000Z',
  event_end_at: null,
  event_all_day: true,
  event_all_day_date: '2026-10-04',
  event_all_day_end_date: null,
  event_calendar_name: 'Maya',
}), {
  id: 'todo-1',
  title: 'Pack bags',
  notes: 'shoes',
  dueOn: '2026-10-04',
  assigneeId: 'maya',
  completed: false,
  completedAt: null,
  sortOrder: 2,
  createdAt: '2026-09-26T10:00:00.000Z',
  updatedAt: '2026-09-26T11:00:00.000Z',
  calendarEvent: {
    id: 'saved:evt-9',
    title: 'Pack bags',
    startAt: '2026-10-04',
    endAt: null,
    allDay: true,
    calendar: 'Maya',
  },
})

console.log('todos lib tests passed')
