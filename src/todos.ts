import {
  compareTodos,
  todoMatchesFilters,
  type HouseholdTodo,
  type TodoAssigneeFilter,
  type TodoStatusFilter,
} from '../api/_lib/todo-model.ts'

export type {
  HouseholdTodo,
  TodoAssigneeFilter,
  TodoCalendarEvent,
  TodoStatusFilter,
} from '../api/_lib/todo-model.ts'

export type TodoWriteInput = {
  title: string
  notes?: string | null
  dueOn?: string | null
  assigneeId?: string | null
}

export type TodoPatchInput = {
  title?: string
  notes?: string | null
  dueOn?: string | null
  assigneeId?: string | null
  completed?: boolean
  calendarEventId?: string | null
  removeFromCalendar?: boolean
}

async function readResponse<T>(response: Response) {
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export async function loadTodos() {
  const response = await fetch('/api/todos', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return readResponse<{ todos: HouseholdTodo[] }>(response)
}

export async function createTodo(input: TodoWriteInput) {
  const response = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  })
  return readResponse<{ todo: HouseholdTodo }>(response)
}

export async function updateTodo(todoId: string, patch: TodoPatchInput) {
  const response = await fetch('/api/todos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ todoId, ...patch }),
  })
  return readResponse<{ todo: HouseholdTodo }>(response)
}

export async function deleteTodo(todoId: string) {
  const response = await fetch('/api/todos', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ todoId }),
  })
  await readResponse<undefined>(response)
}

export function visibleTodos(
  todos: HouseholdTodo[],
  status: TodoStatusFilter,
  assignee: TodoAssigneeFilter,
) {
  return todos.filter((todo) => todoMatchesFilters(todo, status, assignee)).sort(compareTodos)
}
