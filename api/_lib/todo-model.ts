export const TODO_TITLE_MAX = 200
export const TODO_NOTES_MAX = 2000

export class TodoValidationError extends Error {}

export type TodoStatusFilter = 'open' | 'completed' | 'all'
export type TodoAssigneeFilter = 'everyone' | 'unassigned' | string

export type HouseholdTodo = {
  id: string
  title: string
  notes: string | null
  dueOn: string | null
  assigneeId: string | null
  completed: boolean
  completedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  calendarEvent: TodoCalendarEvent | null
}

export type TodoCalendarEvent = {
  id: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  calendar: string
}

export type TodoWrite = {
  title: string
  notes?: string | null
  dueOn?: string | null
  assigneeId?: string | null
}

export type TodoPatch = {
  title?: string
  notes?: string | null
  dueOn?: string | null
  assigneeId?: string | null
  completed?: boolean
  calendarEventId?: string | null
  removeFromCalendar?: boolean
}

export type TodoRow = {
  id: string
  title: string
  notes: string | null
  due_on: string | Date | null
  assignee_id: string | null
  calendar_event_id: string | null
  completed_at: string | Date | null
  sort_order: number
  created_at: string | Date
  updated_at: string | Date
  event_title: string | null
  event_start_at: string | Date | null
  event_end_at: string | Date | null
  event_all_day: boolean | null
  event_all_day_date: string | Date | null
  event_all_day_end_date: string | Date | null
  event_calendar_name: string | null
}

function dateOnly(value: string | Date | null | undefined) {
  if (!value) return null
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10)
}

function timestamp(value: string | Date) {
  return new Date(value).toISOString()
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function parseTodoTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title) throw new TodoValidationError('Title is required')
  if (title.length > TODO_TITLE_MAX) throw new TodoValidationError('Title is too long')
  return title
}

export function parseTodoNotes(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TodoValidationError('Notes are invalid')
  const notes = value.trim()
  if (notes.length > TODO_NOTES_MAX) throw new TodoValidationError('Notes are too long')
  return notes || null
}

export function parseTodoDueOn(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !isIsoDate(value)) {
    throw new TodoValidationError('Due date is invalid')
  }
  return value
}

export function parseTodoAssigneeId(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !value.trim() || value.length > 80) {
    throw new TodoValidationError('Assignee is invalid')
  }
  return value.trim()
}

export function parseSavedEventId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TodoValidationError('Calendar event is invalid')
  }
  const raw = value.trim()
  const rest = raw.startsWith('saved:') ? raw.slice('saved:'.length) : raw
  const separator = rest.indexOf('::')
  const eventId = separator === -1 ? rest : rest.slice(0, separator)
  if (!eventId || eventId.length > 80 || eventId.includes(':')) {
    throw new TodoValidationError('Calendar event is invalid')
  }
  return eventId
}

export function publicSavedEventId(eventId: string) {
  return `saved:${eventId}`
}

export function parseTodoWrite(body: Record<string, unknown>): TodoWrite {
  return {
    title: parseTodoTitle(body.title),
    notes: parseTodoNotes(body.notes),
    dueOn: parseTodoDueOn(body.dueOn),
    assigneeId: parseTodoAssigneeId(body.assigneeId),
  }
}

export function parseTodoPatch(body: Record<string, unknown>): TodoPatch {
  const patch: TodoPatch = {}
  if ('title' in body) patch.title = parseTodoTitle(body.title)
  if ('notes' in body) patch.notes = parseTodoNotes(body.notes)
  if ('dueOn' in body) patch.dueOn = parseTodoDueOn(body.dueOn)
  if ('assigneeId' in body) patch.assigneeId = parseTodoAssigneeId(body.assigneeId)
  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') throw new TodoValidationError('Completed state is invalid')
    patch.completed = body.completed
  }
  if ('calendarEventId' in body) {
    patch.calendarEventId = body.calendarEventId === null || body.calendarEventId === ''
      ? null
      : parseSavedEventId(body.calendarEventId)
  }
  if (body.removeFromCalendar === true) patch.removeFromCalendar = true
  return patch
}

export function todoMatchesFilters(
  todo: Pick<HouseholdTodo, 'completed' | 'assigneeId'>,
  status: TodoStatusFilter,
  assignee: TodoAssigneeFilter,
) {
  if (status === 'open' && todo.completed) return false
  if (status === 'completed' && !todo.completed) return false
  if (assignee === 'everyone') return true
  if (assignee === 'unassigned') return todo.assigneeId === null
  return todo.assigneeId === assignee
}

export function compareTodos(left: HouseholdTodo, right: HouseholdTodo) {
  if (left.completed !== right.completed) return left.completed ? 1 : -1
  if (!left.completed) {
    if (left.dueOn && right.dueOn && left.dueOn !== right.dueOn) {
      return left.dueOn.localeCompare(right.dueOn)
    }
    if (left.dueOn && !right.dueOn) return -1
    if (!left.dueOn && right.dueOn) return 1
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.createdAt.localeCompare(right.createdAt)
  }
  return (right.completedAt ?? '').localeCompare(left.completedAt ?? '')
}

export function serializeTodo(row: TodoRow): HouseholdTodo {
  const dueOn = dateOnly(row.due_on)
  const completedAt = row.completed_at ? timestamp(row.completed_at) : null
  const calendarEvent = row.calendar_event_id && row.event_title && row.event_start_at
    ? {
        id: publicSavedEventId(row.calendar_event_id),
        title: row.event_title,
        startAt: row.event_all_day
          ? dateOnly(row.event_all_day_date) ?? dateOnly(row.event_start_at) ?? timestamp(row.event_start_at)
          : timestamp(row.event_start_at),
        endAt: row.event_all_day
          ? dateOnly(row.event_all_day_end_date)
          : row.event_end_at
            ? timestamp(row.event_end_at)
            : null,
        allDay: row.event_all_day === true,
        calendar: row.event_calendar_name ?? 'Family',
      }
    : null
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueOn,
    assigneeId: row.assignee_id,
    completed: Boolean(completedAt),
    completedAt,
    sortOrder: row.sort_order,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    calendarEvent,
  }
}
