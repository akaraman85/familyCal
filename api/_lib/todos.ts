import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { deleteSavedEvent } from './events.js'
import {
  parseSavedEventId,
  serializeTodo,
  TodoValidationError,
  type TodoPatch,
  type TodoRow,
  type TodoWrite,
} from './todo-model.js'

export {
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
  type TodoAssigneeFilter,
  type TodoCalendarEvent,
  type TodoPatch,
  type TodoStatusFilter,
  type TodoWrite,
} from './todo-model.js'

const TODO_SELECT = `t.id, t.title, t.notes, t.due_on, t.assignee_id, t.calendar_event_id,
            t.completed_at, t.sort_order, t.created_at, t.updated_at,
            e.title AS event_title, e.start_at AS event_start_at, e.end_at AS event_end_at,
            e.all_day AS event_all_day, e.all_day_date AS event_all_day_date,
            e.all_day_end_date AS event_all_day_end_date, e.calendar_name AS event_calendar_name`

function database(databaseUrl: string) {
  return neon(databaseUrl)
}

async function getTodoRow(databaseUrl: string, ownerId: string, todoId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT ${TODO_SELECT}
       FROM todos t
       LEFT JOIN saved_events e
         ON e.id = t.calendar_event_id
        AND e.owner_id = t.owner_id
      WHERE t.owner_id = $1 AND t.id = $2`,
    [ownerId, todoId],
  ) as TodoRow[]
  return rows[0] ? serializeTodo(rows[0]) : null
}

export async function listTodos(databaseUrl: string, ownerId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT ${TODO_SELECT}
       FROM todos t
       LEFT JOIN saved_events e
         ON e.id = t.calendar_event_id
        AND e.owner_id = t.owner_id
      WHERE t.owner_id = $1
      ORDER BY t.completed_at NULLS FIRST, t.due_on NULLS LAST, t.sort_order, t.created_at`,
    [ownerId],
  ) as TodoRow[]
  return rows.map(serializeTodo)
}

export async function createTodo(databaseUrl: string, ownerId: string, input: TodoWrite) {
  const sql = database(databaseUrl)
  const id = randomUUID()
  const rows = await sql.query(
    `INSERT INTO todos (
       owner_id, id, title, notes, due_on, assignee_id, sort_order
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       COALESCE((SELECT MAX(sort_order) + 1 FROM todos WHERE owner_id = $1), 1)
     )
     RETURNING id`,
    [ownerId, id, input.title, input.notes ?? null, input.dueOn ?? null, input.assigneeId ?? null],
  )
  const created = await getTodoRow(databaseUrl, ownerId, rows[0].id as string)
  if (!created) throw new Error('Todo was not created')
  return created
}

export async function updateTodo(
  databaseUrl: string,
  ownerId: string,
  todoId: string,
  patch: TodoPatch,
) {
  const current = await getTodoRow(databaseUrl, ownerId, todoId)
  if (!current) return null

  if (patch.removeFromCalendar && current.calendarEvent) {
    const eventId = parseSavedEventId(current.calendarEvent.id)
    await deleteSavedEvent(databaseUrl, ownerId, eventId)
  }

  const nextTitle = patch.title ?? current.title
  const nextNotes = 'notes' in patch ? patch.notes ?? null : current.notes
  const nextDueOn = 'dueOn' in patch ? patch.dueOn ?? null : current.dueOn
  const nextAssignee = 'assigneeId' in patch ? patch.assigneeId ?? null : current.assigneeId
  const nextCompletedAt = 'completed' in patch
    ? (patch.completed ? (current.completedAt ?? new Date().toISOString()) : null)
    : current.completedAt
  const nextCalendarEventId = patch.removeFromCalendar
    ? null
    : 'calendarEventId' in patch
      ? patch.calendarEventId ?? null
      : current.calendarEvent
        ? parseSavedEventId(current.calendarEvent.id)
        : null

  const sql = database(databaseUrl)
  try {
    const rows = await sql.query(
      `UPDATE todos
          SET title = $3,
              notes = $4,
              due_on = $5,
              assignee_id = $6,
              completed_at = $7,
              calendar_event_id = $8,
              updated_at = NOW()
        WHERE owner_id = $1 AND id = $2
      RETURNING id`,
      [
        ownerId,
        todoId,
        nextTitle,
        nextNotes,
        nextDueOn,
        nextAssignee,
        nextCompletedAt,
        nextCalendarEventId,
      ],
    )
    if (!rows[0]) return null
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('todos_calendar_event_idx')) {
      throw new TodoValidationError('That calendar event is already linked to another to-do')
    }
    if (message.includes('todos_assignee_id_fkey') || message.includes('family_members')) {
      throw new TodoValidationError('Assignee is not a family member')
    }
    if (message.includes('todos_calendar_event_id_fkey') || message.includes('saved_events')) {
      throw new TodoValidationError('Calendar event was not found')
    }
    throw error
  }
  return getTodoRow(databaseUrl, ownerId, todoId)
}

export async function deleteTodo(databaseUrl: string, ownerId: string, todoId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `DELETE FROM todos
      WHERE owner_id = $1 AND id = $2
    RETURNING id`,
    [ownerId, todoId],
  )
  return rows.length === 1
}
