import assert from 'node:assert/strict'
import { visibleTodos, type HouseholdTodo } from './todos.ts'

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

const items = [
  todo({ id: 'done', title: 'Done', completed: true, completedAt: '2026-09-21T00:00:00.000Z' }),
  todo({ id: 'later', title: 'Later', dueOn: '2026-10-10' }),
  todo({ id: 'soon', title: 'Soon', dueOn: '2026-10-01', assigneeId: 'alex' }),
]

assert.deepEqual(visibleTodos(items, 'open', 'everyone').map((item) => item.id), ['soon', 'later'])
assert.deepEqual(visibleTodos(items, 'completed', 'everyone').map((item) => item.id), ['done'])
assert.deepEqual(visibleTodos(items, 'all', 'alex').map((item) => item.id), ['soon'])
assert.deepEqual(visibleTodos(items, 'open', 'unassigned').map((item) => item.id), ['later'])

console.log('todos client tests passed')
