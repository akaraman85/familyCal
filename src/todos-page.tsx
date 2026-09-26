import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import {
  CalendarDays, CalendarPlus, CircleCheck, LoaderCircle, Pencil, Plus, Trash2, Users, X,
} from 'lucide-react'
import { ClickSpark, StatusMark } from './react-bits'
import { parseCalendarDate } from './calendar-range'
import {
  HOUSEHOLD_CALENDAR_NAME,
  memberHasCalendarIntegration,
  type FamilyMember,
} from './family'
import {
  createTodo,
  deleteTodo,
  loadTodos,
  updateTodo,
  visibleTodos,
  type HouseholdTodo,
  type TodoAssigneeFilter,
  type TodoCalendarEvent,
  type TodoStatusFilter,
} from './todos'

const STATUS_FILTERS: Array<{ value: TodoStatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
]

type TodoDraft = {
  title: string
  notes: string
  dueOn: string
  assigneeId: string
}

const EMPTY_DRAFT: TodoDraft = {
  title: '',
  notes: '',
  dueOn: '',
  assigneeId: '',
}

function memberInitials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function dueLabel(dueOn: string | null) {
  if (!dueOn) return null
  const date = parseCalendarDate(dueOn)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  if (diff === -1) return 'Due yesterday'
  if (diff < 0) return `Due ${format(date, 'MMM d')}`
  return `Due ${format(date, 'EEE, MMM d')}`
}

function eventDateLabel(event: TodoCalendarEvent) {
  const date = event.allDay ? parseCalendarDate(event.startAt) : new Date(event.startAt)
  return event.allDay
    ? format(date, 'EEE, MMM d')
    : `${format(date, 'EEE, MMM d')} · ${format(date, 'h:mm a')}`
}

function calendarForTodo(todo: HouseholdTodo, members: FamilyMember[]) {
  const member = members.find((item) => item.id === todo.assigneeId)
  if (member && memberHasCalendarIntegration(member)) return member.name
  return HOUSEHOLD_CALENDAR_NAME
}

export function TodosPage({
  members,
  calendarEpoch,
  onAddToCalendar,
  onOpenEvent,
  onCalendarChanged,
}: {
  members: FamilyMember[]
  calendarEpoch: number
  onAddToCalendar: (todo: HouseholdTodo, calendar: string) => void
  onOpenEvent: (event: TodoCalendarEvent) => void
  onCalendarChanged: () => void
}) {
  const [todos, setTodos] = useState<HouseholdTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<TodoStatusFilter>('open')
  const [assignee, setAssignee] = useState<TodoAssigneeFilter>('everyone')
  const [editing, setEditing] = useState<HouseholdTodo | null | undefined>(undefined)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const refresh = async () => {
    const data = await loadTodos()
    setTodos(data.todos)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load to-dos')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [calendarEpoch])

  const visible = useMemo(() => visibleTodos(todos, status, assignee), [todos, status, assignee])
  const openCount = todos.filter((todo) => !todo.completed).length

  const toggleComplete = async (todo: HouseholdTodo) => {
    setWorkingId(todo.id)
    setError(null)
    const next = { ...todo, completed: !todo.completed, completedAt: todo.completed ? null : new Date().toISOString() }
    setTodos((current) => current.map((item) => (item.id === todo.id ? next : item)))
    try {
      const result = await updateTodo(todo.id, { completed: !todo.completed })
      setTodos((current) => current.map((item) => (item.id === todo.id ? result.todo : item)))
    } catch (requestError) {
      setTodos((current) => current.map((item) => (item.id === todo.id ? todo : item)))
      setError(requestError instanceof Error ? requestError.message : 'Unable to update to-do')
    } finally {
      setWorkingId(null)
    }
  }

  const remove = async (todo: HouseholdTodo) => {
    if (!window.confirm(`Delete “${todo.title}”? The calendar event stays if one was added.`)) return
    setWorkingId(todo.id)
    setError(null)
    try {
      await deleteTodo(todo.id)
      setTodos((current) => current.filter((item) => item.id !== todo.id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete to-do')
    } finally {
      setWorkingId(null)
    }
  }

  const removeFromCalendar = async (todo: HouseholdTodo) => {
    if (!todo.calendarEvent) return
    if (!window.confirm('Remove this from the calendar? The event will be deleted. The to-do stays.')) return
    setWorkingId(todo.id)
    setError(null)
    try {
      const result = await updateTodo(todo.id, { removeFromCalendar: true })
      setTodos((current) => current.map((item) => (item.id === todo.id ? result.todo : item)))
      onCalendarChanged()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to remove calendar event')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="page todos-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Household list</p>
          <h1>To-dos</h1>
          <p>
            {openCount === 1 ? '1 open task' : `${openCount} open tasks`}
            . Assign people, set a due date, and add a task to the family calendar when you want it there.
          </p>
        </div>
        <ClickSpark sparkColor="var(--orange)" sparkCount={10} sparkRadius={22} sparkSize={9} className="add-btn-spark">
          <button className="add-btn" type="button" onClick={() => setEditing(null)}>
            <Plus size={18} />Add task
          </button>
        </ClickSpark>
      </div>

      <div className="todo-toolbar">
        <div className="segmented" role="tablist" aria-label="To-do status">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={status === item.value ? 'active' : ''}
              onClick={() => setStatus(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="todo-assignee-filters" role="group" aria-label="Filter by family member">
          <button
            type="button"
            className={assignee === 'everyone' ? 'active' : ''}
            onClick={() => setAssignee('everyone')}
          >
            Everyone
          </button>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              className={assignee === member.id ? 'active' : ''}
              onClick={() => setAssignee(member.id)}
            >
              <i className={`dot ${member.color}`} />
              {member.name}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="calendar-source-error" role="alert">{error}</div>}

      {loading && !todos.length
        ? <div className="integration-loading"><LoaderCircle size={16} />Loading household to-dos</div>
        : (
          <div className="panel todo-list">
            {!visible.length && (
              <div className="todo-empty">
                <CircleCheck size={24} />
                <b>{todos.length ? 'Nothing matches these filters' : 'Add the first household task'}</b>
                <span>
                  {todos.length
                    ? 'Try another status or family member.'
                    : 'Keep chores and errands here. Add one to the calendar only when you want it on the grid.'}
                </span>
              </div>
            )}
            {visible.map((todo) => {
              const member = members.find((item) => item.id === todo.assigneeId)
              const due = dueLabel(todo.dueOn)
              const overdue = Boolean(todo.dueOn && !todo.completed && parseCalendarDate(todo.dueOn) < startOfToday())
              return (
                <article key={todo.id} className={`todo-item${todo.completed ? ' is-done' : ''}`}>
                  <button
                    type="button"
                    className="todo-check"
                    aria-pressed={todo.completed}
                    aria-label={todo.completed ? `Mark ${todo.title} as open` : `Complete ${todo.title}`}
                    disabled={workingId === todo.id}
                    onClick={() => void toggleComplete(todo)}
                  >
                    <StatusMark
                      status={todo.completed ? 'done' : 'pending'}
                      size={22}
                      strike={false}
                      doneColor="var(--green)"
                      color="var(--text-faint)"
                    />
                  </button>
                  <div className="todo-body">
                    <b>{todo.title}</b>
                    {todo.notes && <p>{todo.notes}</p>}
                    <div className="todo-meta">
                      {due && <span className={overdue ? 'is-overdue' : ''}>{due}</span>}
                      {member && (
                        <span>
                          <span className={`tiny-avatar ${member.color}`}>{memberInitials(member.name)}</span>
                          {member.name}
                        </span>
                      )}
                      {todo.calendarEvent && (
                        <span className="todo-on-calendar">
                          <CalendarDays size={12} />
                          On calendar · {eventDateLabel(todo.calendarEvent)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="todo-actions">
                    {todo.calendarEvent
                      ? (
                        <>
                          <button type="button" onClick={() => onOpenEvent(todo.calendarEvent!)}>
                            Open event
                          </button>
                          <button type="button" onClick={() => void removeFromCalendar(todo)} disabled={workingId === todo.id}>
                            Remove from calendar
                          </button>
                        </>
                      )
                      : (
                        <button
                          type="button"
                          className="todo-add-calendar"
                          onClick={() => onAddToCalendar(todo, calendarForTodo(todo, members))}
                        >
                          <CalendarPlus size={14} />Add to calendar
                        </button>
                      )}
                    <button type="button" aria-label={`Edit ${todo.title}`} onClick={() => setEditing(todo)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" aria-label={`Delete ${todo.title}`} onClick={() => void remove(todo)} disabled={workingId === todo.id}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

      {editing !== undefined && (
        <TodoEditor
          todo={editing}
          members={members}
          close={() => setEditing(undefined)}
          save={async (draft) => {
            const input = {
              title: draft.title,
              notes: draft.notes || null,
              dueOn: draft.dueOn || null,
              assigneeId: draft.assigneeId || null,
            }
            const result = editing
              ? await updateTodo(editing.id, input)
              : await createTodo(input)
            setTodos((current) => {
              if (!editing) return [...current, result.todo]
              return current.map((item) => (item.id === editing.id ? result.todo : item))
            })
            setEditing(undefined)
          }}
        />
      )}
    </div>
  )
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function TodoEditor({
  todo,
  members,
  close,
  save,
}: {
  todo: HouseholdTodo | null
  members: FamilyMember[]
  close: () => void
  save: (draft: TodoDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<TodoDraft>({
    title: todo?.title ?? '',
    notes: todo?.notes ?? '',
    dueOn: todo?.dueOn ?? '',
    assigneeId: todo?.assigneeId ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await save(draft)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save to-do')
      setSaving(false)
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={(mouse) => { if (mouse.target === mouse.currentTarget && !saving) close() }}>
      <form className="family-member-modal todo-editor" onSubmit={(event) => void submit(event)}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{todo ? 'Edit task' : 'New household task'}</p>
            <h2>{todo ? `Update ${todo.title}` : 'Add a to-do'}</h2>
          </div>
          <button type="button" onClick={close} disabled={saving}><X size={20} /></button>
        </div>
        <label className="field">
          <span>Title</span>
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.title}
            onChange={(change) => setDraft({ ...draft, title: change.target.value })}
            placeholder="What needs to get done?"
          />
        </label>
        <label className="field">
          <span>Notes <small>optional</small></span>
          <textarea
            rows={3}
            maxLength={2000}
            value={draft.notes}
            onChange={(change) => setDraft({ ...draft, notes: change.target.value })}
            placeholder="Details the household should know"
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Due date <small>optional</small></span>
            <input
              type="date"
              value={draft.dueOn}
              onChange={(change) => setDraft({ ...draft, dueOn: change.target.value })}
            />
          </label>
          <label className="field">
            <span>Assignee <small>optional</small></span>
            <select
              value={draft.assigneeId}
              onChange={(change) => setDraft({ ...draft, assigneeId: change.target.value })}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
        </div>
        {!members.length && (
          <p className="todo-editor-hint">
            <Users size={14} />
            Add family members if you want to assign this task.
          </p>
        )}
        {error && <div className="modal-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={saving}>Cancel</button>
          <button className="save-event" type="submit" disabled={saving}>
            {saving ? 'Saving…' : todo ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  )
}
