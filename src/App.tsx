import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import DOMPurify from 'dompurify'
import {
  AlertTriangle, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, ExternalLink, ImagePlus, LayoutDashboard, Link2, ListFilter, LoaderCircle, LockKeyhole,
  LogOut, MapPin, Menu, MessageCircleMore, Plus, Search,
  Settings, Sparkles, Users, WandSparkles, X,
} from 'lucide-react'
import {
  addDays, addMonths, addYears, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek,
  subMonths, subYears,
} from 'date-fns'
import {
  loadCalendarEvents,
  saveCalendarEvent,
  saveCalendarEvents,
  type CalendarEventData,
  type EventSources,
} from './events'
import {
  disconnectGoogleCalendar,
  loadGoogleCalendars,
  updateGoogleCalendarInclusion,
  type GoogleCalendar,
} from './integrations'
import {
  deleteFamilyMember,
  loadFamilyMembers,
  saveFamilyMember,
  type FamilyMember,
  type FamilyMemberInput,
} from './family'
import {
  loadPlannerSettings,
  preparePlannerScreenshot,
  proposeEvents,
  resetPlannerSession as resetPlannerSessionRequest,
  updatePlannerSettings,
  type PlannedEvent,
  type PlannerImageAttachment,
  type PlannerProposal,
  type PlannerSettings,
} from './planner'
import { loadSession, login, logout, type SessionUser } from './auth'

type View = 'Day' | 'Week' | 'Month' | 'Year'
type Page = 'Calendar' | 'Overview' | 'Integrations' | 'Family' | 'Settings'
type EventItem = {
  id: string
  title: string
  date: Date
  endDate?: Date
  allDay: boolean
  start: string
  end?: string
  calendar: string
  location?: string
  description?: string
  externalUrl?: string
  organizer?: CalendarEventData['organizer']
  color: 'coral' | 'blue' | 'green' | 'gold'
  source: 'saved' | 'google'
  google?: CalendarEventData['google']
}

type NewEventInput = {
  title: string
  startAt: string
  calendar: string
  location?: string
}

const GOOGLE_CALENDAR_READ_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly'

function hasGoogleCalendarPermission(scopes: string[]) {
  return scopes.includes(GOOGLE_CALENDAR_READ_SCOPE)
}

function eventDate(event: CalendarEventData) {
  if (!event.allDay) return new Date(event.startAt)
  const [year, month, day] = event.startAt.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function eventEndDate(event: CalendarEventData) {
  if (!event.endAt) return null
  if (!event.allDay) return new Date(event.endAt)
  const [year, month, day] = event.endAt.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toEventItem(event: CalendarEventData): EventItem {
  const startDate = eventDate(event)
  const endDate = eventEndDate(event)
  return {
    id: event.id,
    title: event.title,
    date: startDate,
    endDate: endDate ?? undefined,
    allDay: event.allDay,
    start: event.allDay ? 'All day' : format(startDate, 'h:mm a'),
    end: endDate && !event.allDay ? format(endDate, 'h:mm a') : undefined,
    calendar: event.calendar,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    externalUrl: event.externalUrl ?? undefined,
    organizer: event.organizer,
    color: event.source === 'google' ? 'blue' : 'green',
    source: event.source,
    google: event.google,
  }
}

const TIMELINE_START_MINUTES = 7 * 60
const TIMELINE_END_MINUTES = 23 * 60
const TIMELINE_HEIGHT = 504
const TIMELINE_LABEL_HOURS = [8, 10, 12, 14, 16, 18, 20, 22]

function timelinePosition(event: EventItem) {
  if (event.allDay) return null
  const startMinutes = event.date.getHours() * 60 + event.date.getMinutes()
  const duration = event.endDate
    ? Math.max(1, (event.endDate.getTime() - event.date.getTime()) / 60_000)
    : 60
  const endMinutes = startMinutes + duration
  if (
    startMinutes >= TIMELINE_END_MINUTES
    || endMinutes <= TIMELINE_START_MINUTES
  ) {
    return null
  }
  const visibleStart = Math.max(startMinutes, TIMELINE_START_MINUTES)
  const visibleEnd = Math.min(endMinutes, TIMELINE_END_MINUTES)
  const pixelsPerMinute = TIMELINE_HEIGHT
    / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES)
  const top = (visibleStart - TIMELINE_START_MINUTES) * pixelsPerMinute
  const availableHeight = TIMELINE_HEIGHT - top
  const height = Math.min(
    Math.max(28, (visibleEnd - visibleStart) * pixelsPerMinute),
    availableHeight,
  )
  return { top, height }
}

function timelineLabel(hour: number) {
  return format(new Date(2026, 0, 1, hour), 'h a')
}

function calendarTypeLabel(type: NonNullable<EventItem['google']>['calendar']['type']) {
  return type[0].toUpperCase() + type.slice(1)
}

function eventSourceLabel(event: EventItem) {
  if (!event.google) return `${event.calendar} · Saved event`
  const accounts = [...new Set(event.google.accounts.map((account) => (
    account.email || account.displayName
  )).filter(Boolean))]
  const via = accounts.length ? ` · via ${accounts.join(', ')}` : ''
  return `${event.google.calendar.name} · ${calendarTypeLabel(event.google.calendar.type)}${via}`
}

function App() {
  const [user, setUser] = useState<SessionUser | null>()
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    loadSession()
      .then(setUser)
      .catch((error: unknown) => {
        setSessionError(error instanceof Error ? error.message : 'Authentication is unavailable')
        setUser(null)
      })
  }, [])

  if (user === undefined) {
    return <div className="auth-loading"><LoaderCircle size={24}/><span>Checking access…</span></div>
  }
  if (!user) {
    return <LoginScreen
      error={sessionError}
      onAuthenticated={(authenticatedUser) => {
        setSessionError(null)
        setUser(authenticatedUser)
      }}
    />
  }
  return <AuthenticatedApp
    user={user}
    onLogout={async () => {
      await logout()
      setUser(null)
    }}
  />
}

function LoginScreen({ error: initialError, onAuthenticated }: {
  error: string | null
  onAuthenticated: (user: SessionUser) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onAuthenticated(await login(username, password))
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in')
      setSubmitting(false)
    }
  }

  return <main className="login-page">
    <form className="login-card" onSubmit={submit}>
      <div className="brand-mark login-mark"><CalendarDays size={22}/></div>
      <p className="eyebrow">Private family calendar</p>
      <h1>Welcome back</h1>
      <p>Sign in to view calendars, integrations, and saved events.</p>
      <label className="field">
        <span>Username</span>
        <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required/>
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/>
      </label>
      {error && <div className="login-error" role="alert">{error}</div>}
      <button className="login-submit" type="submit" disabled={submitting}>
        {submitting ? <><LoaderCircle size={16}/>Signing in…</> : <><LockKeyhole size={16}/>Sign in</>}
      </button>
    </form>
  </main>
}

function AuthenticatedApp({ user, onLogout }: {
  user: SessionUser
  onLogout: () => Promise<void>
}) {
  const [page, setPage] = useState<Page>(() => (
    new URLSearchParams(window.location.search).has('integration')
      ? 'Integrations'
      : 'Calendar'
  ))
  const [view, setView] = useState<View>('Month')
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventSources, setEventSources] = useState<EventSources>({
    saved: 'ok',
    google: 'disconnected',
  })
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventRefresh, setEventRefresh] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  const eventRange = useMemo(() => {
    if (view === 'Year') {
      return {
        start: new Date(selectedDate.getFullYear(), 0, 1),
        end: new Date(selectedDate.getFullYear() + 1, 0, 1),
      }
    }
    if (view === 'Month') {
      return {
        start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 }),
        end: addDays(endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 }), 1),
      }
    }
    if (view === 'Week') {
      const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
      return { start, end: addDays(start, 7) }
    }
    const start = startOfDay(selectedDate)
    return { start, end: addDays(start, 1) }
  }, [selectedDate, view])

  useEffect(() => {
    const controller = new AbortController()
    setEventsLoading(true)
    setEventsError(null)
    loadCalendarEvents(eventRange.start, eventRange.end, controller.signal)
      .then((data) => {
        setEvents(data.events.map(toEventItem))
        setEventSources(data.sources)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setEvents([])
        setEventsError(error instanceof Error ? error.message : 'Unable to load events')
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false)
      })
    return () => controller.abort()
  }, [eventRange, eventRefresh])

  const saveEvent = async (event: NewEventInput) => {
    await saveCalendarEvent(event)
    setModalOpen(false)
    setEventRefresh((current) => current + 1)
  }

  const savePlannedEvents = async (
    plannedEvents: PlannedEvent[],
    requestId: string,
    proposalToken: string,
    sessionId: string,
    revision: number,
  ) => {
    await saveCalendarEvents(
      plannedEvents,
      requestId,
      proposalToken,
      sessionId,
      revision,
    )
    setEventRefresh((current) => current + 1)
    setChatOpen(false)
  }

  const moveDate = (direction: number) => {
    if (view === 'Year') setSelectedDate((d) => direction > 0 ? addYears(d, 1) : subYears(d, 1))
    else if (view === 'Month') setSelectedDate((d) => direction > 0 ? addMonths(d, 1) : subMonths(d, 1))
    else setSelectedDate((d) => addDays(d, direction * (view === 'Week' ? 7 : 1)))
  }

  const dateTitle = view === 'Year'
    ? format(selectedDate, 'yyyy')
    : view === 'Day'
      ? format(selectedDate, 'EEEE, MMMM d')
      : view === 'Week'
        ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} – ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
        : format(selectedDate, 'MMMM yyyy')

  const navItems: { icon: typeof CalendarDays; label: Page }[] = [
    { icon: CalendarDays, label: 'Calendar' },
    { icon: LayoutDashboard, label: 'Overview' },
    { icon: Link2, label: 'Integrations' },
    { icon: Users, label: 'Family' },
  ]

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><CalendarDays size={20} /></div>
          <div><strong>Karaman</strong><span>Family calendar</span></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X size={20} /></button>
        </div>

        <nav>
          <div className="nav-label">Workspace</div>
          {navItems.map(({ icon: Icon, label }) => (
            <button key={label} className={page === label ? 'active' : ''} onClick={() => { setPage(label); setMobileNav(false) }}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
          <div className="nav-label second">Tools</div>
          <button className={chatOpen ? 'active assistant-nav' : 'assistant-nav'} onClick={() => { setChatOpen(true); setMobileNav(false) }}>
            <WandSparkles size={18} /><span>AI planner</span><span className="new-pill">New</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button onClick={() => setPage('Settings')} className={page === 'Settings' ? 'active' : ''}><Settings size={18} />Settings</button>
          <button><CircleHelp size={18} />Help & support</button>
          <div className="profile">
            <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
            <div><strong>{user.username}</strong><span>Authenticated session</span></div>
            <button className="profile-logout" title="Sign out" aria-label="Sign out" onClick={() => void onLogout()}><LogOut size={17}/></button>
          </div>
        </div>
      </aside>
      {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}

      <main>
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
          <div className="search"><Search size={17} /><input aria-label="Search" placeholder="Search events, people..." /><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            <button className="icon-btn notification"><Bell size={19} /><i /></button>
            <button className="add-btn" onClick={() => setModalOpen(true)}><Plus size={18} />Add event</button>
          </div>
        </header>

        {page === 'Calendar' && (
          <CalendarPage
            events={events}
            view={view}
            setView={setView}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            dateTitle={dateTitle}
            moveDate={moveDate}
            openChat={() => setChatOpen(true)}
            loading={eventsLoading}
            error={eventsError}
            sources={eventSources}
            selectEvent={setSelectedEvent}
          />
        )}
        {page === 'Overview' && <OverviewPage events={events} openModal={() => setModalOpen(true)} selectEvent={setSelectedEvent} />}
        {page === 'Integrations' && <IntegrationsPage onCalendarsChanged={() => setEventRefresh((current) => current + 1)} />}
        {page === 'Family' && <FamilyPage />}
        {page === 'Settings' && <SettingsPage />}
      </main>

      <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open AI planner"><Sparkles size={20} /></button>
      <AssistantPanel open={chatOpen} close={() => setChatOpen(false)} save={savePlannedEvents} />
      {selectedEvent && <EventDetailModal event={selectedEvent} close={() => setSelectedEvent(null)} />}
      {modalOpen && (
        <EventModal
          selectedDate={selectedDate}
          close={() => setModalOpen(false)}
          save={saveEvent}
        />
      )}
    </div>
  )
}

function CalendarPage({ events, view, setView, selectedDate, setSelectedDate, dateTitle, moveDate, openChat, loading, error, sources, selectEvent }: {
  events: EventItem[]; view: View; setView: (v: View) => void; selectedDate: Date
  setSelectedDate: (d: Date) => void; dateTitle: string; moveDate: (n: number) => void; openChat: () => void
  loading: boolean; error: string | null; sources: EventSources; selectEvent: (event: EventItem) => void
}) {
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'
  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">{format(now, 'EEEE, MMMM d')}</p><h1>Good {greeting}, Alex</h1><p>Here’s what’s happening with your family.</p></div>
        <button className="ai-plan-btn" onClick={openChat}><Sparkles size={17} />Plan with AI</button>
      </div>
      {error && <div className="calendar-source-error" role="alert">{error}</div>}
      {!error && sources.google === 'error' && <div className="calendar-source-error" role="status">Saved events are shown, but Google Calendar could not be reached.</div>}
      <section className="calendar-card">
        <div className="calendar-toolbar">
          <div className="date-navigation">
            <button className="today-btn" onClick={() => setSelectedDate(new Date())}>Today</button>
            <button className="square-btn" onClick={() => moveDate(-1)}><ChevronLeft size={18} /></button>
            <button className="square-btn" onClick={() => moveDate(1)}><ChevronRight size={18} /></button>
            <h2>{dateTitle}</h2>
          </div>
          <div className="view-controls">
            <button className="filter-btn"><ListFilter size={16} />Filter</button>
            <div className="segmented">
              {(['Day', 'Week', 'Month', 'Year'] as View[]).map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item}</button>)}
            </div>
          </div>
        </div>
        {view === 'Month' && <MonthView events={events} selectedDate={selectedDate} onSelect={setSelectedDate} selectEvent={selectEvent} />}
        {view === 'Week' && <WeekView events={events} selectedDate={selectedDate} selectEvent={selectEvent} />}
        {view === 'Day' && <DayView events={events} selectedDate={selectedDate} selectEvent={selectEvent} />}
        {view === 'Year' && <YearView events={events} selectedDate={selectedDate} onSelect={(d) => { setSelectedDate(d); setView('Month') }} />}
      </section>
      <div className="calendar-footer">
        <div className="calendar-legend">
          <span><i className="dot family" />Saved events</span>
          {sources.google !== 'disconnected' && <span><i className="dot alex" />Google Calendar</span>}
        </div>
        {loading && <span className="calendar-loading"><LoaderCircle size={12}/>Loading events</span>}
      </div>
    </div>
  )
}

function MonthView({ events, selectedDate, onSelect, selectEvent }: { events: EventItem[]; selectedDate: Date; onSelect: (d: Date) => void; selectEvent: (event: EventItem) => void }) {
  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 }),
  }), [selectedDate])
  return (
    <div className="month-view">
      <div className="weekday-row">{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="month-grid">
        {days.map((day) => {
          const dayEvents = events.filter((event) => isSameDay(event.date, day))
          return (
            <div key={day.toISOString()} className={`day-cell ${!isSameMonth(day, selectedDate) ? 'muted' : ''} ${isSameDay(day, new Date()) ? 'today' : ''}`}>
              <button type="button" className="day-cell-select" aria-label={`Select ${format(day, 'MMMM d, yyyy')}`} onClick={() => onSelect(day)}><span className="day-number">{format(day, 'd')}</span></button>
              <div className="events">
                {dayEvents.slice(0, 3).map((event) => <button type="button" className={`event-chip ${event.color}`} title={eventSourceLabel(event)} onClick={() => selectEvent(event)} key={event.id}><span>{event.start.replace(':00', '')}</span>{event.title}</button>)}
                {dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ events, selectedDate, selectEvent }: { events: EventItem[]; selectedDate: Date; selectEvent: (event: EventItem) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(selectedDate, { weekStartsOn: 1 }), end: endOfWeek(selectedDate, { weekStartsOn: 1 }) })
  const hasAllDayEvents = events.some((event) => (
    event.allDay && days.some((day) => isSameDay(event.date, day))
  ))
  return (
    <div className="week-view">
      <div className="week-head"><div />{days.map((day) => <div className={isSameDay(day, new Date()) ? 'current' : ''} key={day.toISOString()}><span>{format(day, 'EEE')}</span><b>{format(day, 'd')}</b></div>)}</div>
      {hasAllDayEvents && <div className="week-all-day"><span>All day</span>{days.map((day) => <div key={day.toISOString()}>{events.filter((event) => event.allDay && isSameDay(event.date, day)).map((event) => <button type="button" className={`all-day-event ${event.color}`} title={eventSourceLabel(event)} onClick={() => selectEvent(event)} key={event.id}>{event.title}</button>)}</div>)}</div>}
      <div className="week-body">
        <div className="times">{TIMELINE_LABEL_HOURS.map((hour) => <span key={hour} style={{ top: (hour * 60 - TIMELINE_START_MINUTES) * TIMELINE_HEIGHT / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) }}>{timelineLabel(hour)}</span>)}</div>
        {days.map((day) => <div className="week-column" key={day.toISOString()}>{events.filter((event) => !event.allDay && isSameDay(event.date, day)).map((event) => {
          const position = timelinePosition(event)
          if (!position) return null
          return <button type="button" className={`week-event ${event.color}`} style={position} title={eventSourceLabel(event)} onClick={() => selectEvent(event)} key={event.id}><b>{event.title}</b><span>{event.start}{event.google ? ` · ${calendarTypeLabel(event.google.calendar.type)}` : ''}</span></button>
        })}</div>)}
      </div>
    </div>
  )
}

function DayView({ events, selectedDate, selectEvent }: { events: EventItem[]; selectedDate: Date; selectEvent: (event: EventItem) => void }) {
  const dayEvents = events.filter((e) => isSameDay(e.date, selectedDate))
  const allDayEvents = dayEvents.filter((event) => event.allDay)
  const timedEvents = dayEvents.filter((event) => !event.allDay)
  return (
    <div className="day-view">
      {allDayEvents.length > 0 && <div className="day-all-day"><span>All day</span><div>{allDayEvents.map((event) => <button type="button" className={`all-day-event ${event.color}`} title={eventSourceLabel(event)} onClick={() => selectEvent(event)} key={event.id}>{event.title}</button>)}</div></div>}
      <div className="day-timed">
        <div className="day-timeline">
          {TIMELINE_LABEL_HOURS.map((hour) => <div className="time-row" key={hour} style={{ top: (hour * 60 - TIMELINE_START_MINUTES) * TIMELINE_HEIGHT / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) }}><span>{timelineLabel(hour)}</span><i /></div>)}
        </div>
        <div className="day-events">
          {timedEvents.map((event) => {
            const position = timelinePosition(event)
            if (!position) return null
            return <button type="button" className={`large-event ${event.color}`} key={event.id} style={position} title={eventSourceLabel(event)} onClick={() => selectEvent(event)}><span>{event.start}{event.end ? ` – ${event.end}` : ''}</span><b>{event.title}</b><small>{eventSourceLabel(event)}{event.location ? ` · ${event.location}` : ''}</small></button>
          })}
          {!dayEvents.length && <div className="empty-day"><CalendarDays size={28} /><b>No plans yet</b><span>Enjoy the open space in your day.</span></div>}
        </div>
      </div>
    </div>
  )
}

function YearView({ events, selectedDate, onSelect }: { events: EventItem[]; selectedDate: Date; onSelect: (d: Date) => void }) {
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => {
    const first = new Date(selectedDate.getFullYear(), month, 1)
    const offset = (first.getDay() + 6) % 7
    const days = new Date(selectedDate.getFullYear(), month + 1, 0).getDate()
    return <button className="mini-month" key={month} onClick={() => onSelect(first)}><h3>{format(first, 'MMMM')}</h3><div className="mini-weekdays">{['M','T','W','T','F','S','S'].map((d, i) => <span key={`${d}${i}`}>{d}</span>)}</div><div className="mini-days">{Array.from({ length: offset }, (_, i) => <i key={`x${i}`} />)}{Array.from({ length: days }, (_, i) => { const date = new Date(selectedDate.getFullYear(), month, i + 1); return <span key={i} className={`${isSameDay(date, new Date()) ? 'today' : ''} ${events.some((e) => isSameDay(e.date, date)) ? 'has-event' : ''}`}>{i + 1}</span> })}</div></button>
  })}</div>
}

function OverviewPage({ events, openModal, selectEvent }: { events: EventItem[]; openModal: () => void; selectEvent: (event: EventItem) => void }) {
  const savedCount = events.filter((event) => event.source === 'saved').length
  const googleCount = events.filter((event) => event.source === 'google').length
  return <div className="page overview-page">
    <div className="page-heading"><div><p className="eyebrow">Family command center</p><h1>Overview</h1><p>Everything important, all in one place.</p></div><button className="add-btn" onClick={openModal}><Plus size={18} />Add event</button></div>
    <div className="stat-grid">
      <div className="stat-card coral-stat"><div><span>Current view</span><b>{events.length}</b><small>events scheduled</small></div><CalendarDays /></div>
      <div className="stat-card blue-stat"><div><span>Google Calendar</span><b>{googleCount}</b><small>integrated events</small></div><Link2 /></div>
      <div className="stat-card green-stat"><div><span>Saved here</span><b>{savedCount}</b><small>family events</small></div><Check /></div>
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-title"><div><h2>Coming up</h2><p>Your next family moments</p></div><button>View calendar <ChevronRight size={15} /></button></div>
        <div className="agenda-list">{events.slice(0,5).map((e) => <button type="button" className="agenda-item" onClick={() => selectEvent(e)} key={e.id}><div className="agenda-date"><b>{format(e.date, 'd')}</b><span>{format(e.date, 'MMM')}</span></div><i className={e.color}/><div className="agenda-info"><b>{e.title}</b><span><Clock3 size={13} />{e.start}{e.location && <><MapPin size={13} />{e.location}</>}</span></div><div className={`tiny-avatar ${e.source === 'google' ? 'alex' : 'family'}`}>{e.calendar.slice(0, 1).toUpperCase()}</div></button>)}
          {!events.length && <div className="agenda-empty">No events in the current calendar view.</div>}
        </div>
      </section>
      <section className="panel insight-panel"><div className="sparkle-orb"><Sparkles /></div><p className="eyebrow">Calendar snapshot</p><h2>{events.length ? `${events.length} event${events.length === 1 ? '' : 's'} in view` : 'Your calendar is open'}</h2><p>{googleCount ? `${googleCount} come from Google Calendar and ${savedCount} are saved directly in Karaman.` : savedCount ? 'These plans are saved directly in Karaman.' : 'Connect Google Calendar or add an event to get started.'}</p><div className="insight-bars"><i/><i/><i/><i/><i/><i/><i/></div></section>
    </div>
  </div>
}

function IntegrationsPage({ onCalendarsChanged }: { onCalendarsChanged: () => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [workingAccountId, setWorkingAccountId] = useState<string | null>(null)
  const [workingCalendar, setWorkingCalendar] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(() => (
    new URLSearchParams(window.location.search).get('status') === 'error'
      ? 'Google Calendar could not be connected. Please try again.'
      : null
  ))

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await loadFamilyMembers()
      setMembers(data.members)
      const hasReadableGoogleAccount = data.members.some((member) => (
        member.integrations.some((account) => (
          account.provider === 'google-calendar'
          && hasGoogleCalendarPermission(account.scopes)
        ))
      ))
      if (hasReadableGoogleAccount) {
        const calendarData = await loadGoogleCalendars()
        setCalendars(calendarData.calendars)
      } else {
        setCalendars([])
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load integrations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const disconnect = async (accountId: string, accountName: string) => {
    if (!window.confirm(`Disconnect ${accountName} and revoke its Google Calendar access?`)) return
    setWorkingAccountId(accountId)
    setError(null)
    try {
      await disconnectGoogleCalendar(accountId)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to disconnect')
    } finally {
      setWorkingAccountId(null)
    }
  }

  const setCalendarIncluded = async (calendar: GoogleCalendar, included: boolean) => {
    const key = `${calendar.accountId}:${calendar.id}`
    setWorkingCalendar(key)
    setError(null)
    setCalendars((current) => current.map((item) => (
      item.accountId === calendar.accountId && item.id === calendar.id
        ? { ...item, included }
        : item
    )))
    try {
      await updateGoogleCalendarInclusion(calendar.accountId, calendar.id, included)
      onCalendarsChanged()
    } catch (requestError) {
      setCalendars((current) => current.map((item) => (
        item.accountId === calendar.accountId && item.id === calendar.id
          ? { ...item, included: !included }
          : item
      )))
      setError(requestError instanceof Error ? requestError.message : 'Unable to update calendar')
    } finally {
      setWorkingCalendar(null)
    }
  }

  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Admin dashboard</p><h1>Integrations</h1><p>Manage calendar accounts under each family member.</p></div></div>
    <div className="integration-notice"><div><Sparkles size={19}/><span><b>Secure by design</b> Provider credentials and OAuth tokens stay on the server and are never sent to this browser.</span></div></div>
    {error && <div className="integration-error" role="alert">{error}<button onClick={() => { setError(null); void refresh() }}>Retry</button></div>}
    {loading && !members.length
      ? <div className="integration-loading"><LoaderCircle size={16}/>Loading family calendars</div>
      : <div className="member-integration-list">
      {!members.length && <div className="integration-empty"><Users size={24}/><b>Add a family member first</b><span>Open Family in the sidebar to create the people who will own calendar integrations.</span></div>}
      {members.map((member) => {
        const accounts = member.integrations.filter((item) => item.provider === 'google-calendar')
        const initials = member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
        return <section className="member-integration-card" key={member.id}>
          <div className={`member-avatar ${member.color}`}>{initials}</div>
          <div className="member-integration-heading">
            <h2>{member.name}</h2>
            <p>{member.email || member.role}</p>
          </div>
          <a className="connect-btn" href={`/api/integrations/google/authorize?memberId=${encodeURIComponent(member.id)}`}><Plus size={13}/>Add Google account</a>
          <div className="member-integration-accounts">
            {!accounts.length && <div className="member-integration-empty">No calendar integrations connected.</div>}
            {accounts.map((account) => {
              const accountName = account.email || account.displayName || 'Google account'
              const accountCalendars = calendars
                .filter((calendar) => calendar.accountId === account.id)
                .sort((left, right) => (
                  Number(right.primary) - Number(left.primary)
                  || left.name.localeCompare(right.name)
                ))
              const includedCount = accountCalendars.filter((calendar) => calendar.included).length
              const hasCalendarPermission = hasGoogleCalendarPermission(account.scopes)
              return <div className="member-integration-account-group" key={account.id}>
                <div className="member-integration-account">
                  <div className="integration-icon google">G</div>
                  <div>
                    <b>{accountName}</b>
                    {hasCalendarPermission
                      ? <span>{loading ? 'Checking calendars…' : `${includedCount} of ${accountCalendars.length} calendars included`}</span>
                      : <span className="permission-help">Your Google profile is connected, but Calendar permission is missing. Reconnect and approve “See all your calendars.” A work account may require approval from its Google Workspace administrator.</span>}
                  </div>
                  {hasCalendarPermission
                    ? <span className="connected"><Check size={13}/>Connected</span>
                    : <span className="permission-missing"><AlertTriangle size={13}/>Permission missing</span>}
                  <div className="integration-account-actions">
                    {!hasCalendarPermission && <a
                      className="reconnect-btn"
                      href={`/api/integrations/google/authorize?memberId=${encodeURIComponent(member.id)}`}
                    >Grant access</a>}
                    <button
                      className="disconnect-btn"
                      disabled={workingAccountId !== null}
                      onClick={() => void disconnect(account.id, accountName)}
                    >{workingAccountId === account.id ? 'Disconnecting…' : 'Disconnect'}</button>
                  </div>
                </div>
                {hasCalendarPermission && accountCalendars.length > 0 && <div className="account-calendar-list">
                  {accountCalendars.map((calendar) => {
                    const key = `${calendar.accountId}:${calendar.id}`
                    return <div className="account-calendar-row" key={calendar.id}>
                      <i style={{ backgroundColor: calendar.color ?? undefined }}/>
                      <div><b>{calendar.name}</b><span className={`calendar-type ${calendar.type}`}>{calendar.type}</span></div>
                      <span>{calendar.accessRole}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={calendar.included}
                        aria-label={`Include ${calendar.name} events`}
                        className={`toggle ${calendar.included ? 'on' : ''}`}
                        disabled={workingCalendar !== null}
                        onClick={() => void setCalendarIncluded(calendar, !calendar.included)}
                      ><i/></button>
                    </div>
                  })}
                </div>}
              </div>
            })}
          </div>
        </section>
      })}
    </div>}
    <p className="integration-footnote">Google access is read-only. Disconnecting revokes that account’s grant and deletes its stored token.</p>
  </div>
}

function FamilyPage() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<FamilyMember | null | undefined>(undefined)

  const refresh = async () => {
    const data = await loadFamilyMembers()
    setMembers(data.members)
  }

  useEffect(() => {
    refresh()
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load family members')
      })
      .finally(() => setLoading(false))
  }, [])

  const remove = async (member: FamilyMember) => {
    const detail = member.integrations.length
      ? ' Their calendar accounts will become unassigned but will not be disconnected.'
      : ''
    if (!window.confirm(`Delete ${member.name}?${detail}`)) return
    setError(null)
    try {
      await deleteFamilyMember(member.id)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete family member')
    }
  }

  return <div className="page"><div className="page-heading"><div><p className="eyebrow">Your household</p><h1>Family members</h1><p>Each family member owns their calendar integrations and access.</p></div><button className="add-btn" onClick={() => setEditingMember(null)}><Plus size={18}/>Add member</button></div>
    {error && <div className="integration-error" role="alert">{error}</div>}
    {loading
      ? <div className="integration-loading"><LoaderCircle size={16}/>Loading family members</div>
      : <div className="family-grid">
      {!members.length && <div className="family-empty"><Users size={25}/><b>No family members yet</b><span>Add the first person in your household, then connect their calendars.</span></div>}
      {members.map((member) => {
        const initials = member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
        return <div className="member-card" key={member.id}>
          <div className={`member-avatar ${member.color}`}>{initials}</div>
          <h3>{member.name}</h3>
          <p>{member.email || 'Child profile'}</p>
          <span>{member.role}</span>
          <div className="member-calendar-integrations">
            {member.integrations.map((integration) => <div key={integration.id}><i className="integration-icon google">G</i><span>{integration.email || integration.displayName || integration.providerName}</span></div>)}
            <a href={`/api/integrations/google/authorize?memberId=${encodeURIComponent(member.id)}`}><Plus size={12}/>Add calendar account</a>
          </div>
          <div className="member-divider"/>
          <div className="member-meta"><span><i className={`dot ${member.color}`}/>{member.integrations.length} calendar integration{member.integrations.length === 1 ? '' : 's'}</span><div><button aria-label={`Edit ${member.name}`} onClick={() => setEditingMember(member)}>Edit</button><button aria-label={`Delete ${member.name}`} onClick={() => void remove(member)}>Delete</button></div></div>
        </div>
      })}
      <button className="invite-card" onClick={() => setEditingMember(null)}><div><Plus size={23}/></div><b>Add family member</b><span>Create a person, then connect their calendar accounts</span></button>
    </div>}
    {editingMember !== undefined && <FamilyMemberModal
      member={editingMember}
      close={() => setEditingMember(undefined)}
      save={async (input) => {
        await saveFamilyMember(input, editingMember?.id)
        await refresh()
        setEditingMember(undefined)
      }}
    />}
  </div>
}

function FamilyMemberModal({ member, close, save }: {
  member: FamilyMember | null
  close: () => void
  save: (input: FamilyMemberInput) => Promise<void>
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [role, setRole] = useState(member?.role ?? 'Member')
  const [color, setColor] = useState(member?.color ?? 'blue')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <form className="family-member-modal" onSubmit={async (event) => {
      event.preventDefault()
      setSaving(true)
      setError(null)
      try {
        await save({ name: name.trim(), email: email.trim(), role: role.trim(), color })
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save family member')
        setSaving(false)
      }
    }}>
      <div className="modal-heading"><div><p className="eyebrow">{member ? 'Edit household' : 'New household member'}</p><h2>{member ? `Update ${member.name}` : 'Add family member'}</h2></div><button type="button" onClick={close}><X size={20}/></button></div>
      <label className="field"><span>Name</span><input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name"/></label>
      <label className="field"><span>Email <small>optional</small></span><input type="email" maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com"/></label>
      <div className="field-row">
        <label className="field"><span>Role</span><input required maxLength={50} value={role} onChange={(event) => setRole(event.target.value)} placeholder="Parent, child, administrator…"/></label>
        <label className="field"><span>Color</span><select value={color} onChange={(event) => setColor(event.target.value)}><option value="blue">Blue</option><option value="coral">Coral</option><option value="green">Green</option><option value="gold">Gold</option></select></label>
      </div>
      {error && <div className="modal-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" onClick={close} disabled={saving}>Cancel</button><button className="save-event" type="submit" disabled={saving}>{saving ? 'Saving…' : member ? 'Save changes' : 'Add member'}</button></div>
    </form>
  </div>
}

function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'planner'>('general')
  const [weekends, setWeekends] = useState(true)
  const [emails, setEmails] = useState(false)
  const [planner, setPlanner] = useState<PlannerSettings | null>(null)
  const [plannerError, setPlannerError] = useState<string | null>(null)
  const [savingPlanner, setSavingPlanner] = useState(false)
  const [plannerSaved, setPlannerSaved] = useState(false)

  useEffect(() => {
    loadPlannerSettings()
      .then(({ settings }) => setPlanner(settings))
      .catch((error: unknown) => {
        setPlannerError(error instanceof Error ? error.message : 'Unable to load AI settings')
      })
  }, [])

  const savePlanner = async () => {
    if (!planner) return
    setSavingPlanner(true)
    setPlannerError(null)
    setPlannerSaved(false)
    try {
      const result = await updatePlannerSettings(planner)
      setPlanner(result.settings)
      setPlannerSaved(true)
    } catch (error) {
      setPlannerError(error instanceof Error ? error.message : 'Unable to save AI settings')
    } finally {
      setSavingPlanner(false)
    }
  }

  return <div className="page settings-page"><div className="page-heading"><div><p className="eyebrow">Preferences</p><h1>Settings</h1><p>Make the calendar work the way your family does.</p></div></div>
    <section className="settings-panel"><div className="settings-nav">
      <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>General</button>
      <button className={tab === 'planner' ? 'active' : ''} onClick={() => setTab('planner')}>AI Planner</button>
      <button disabled>Notifications</button><button disabled>Privacy</button><button disabled>Account</button>
    </div>
    {tab === 'general'
      ? <div className="settings-content"><h2>Calendar preferences</h2><p>Choose how dates and events appear for everyone.</p>
        <label><span><b>Default calendar view</b><small>The view you see when opening the app</small></span><select defaultValue="Month"><option>Day</option><option>Week</option><option>Month</option><option>Year</option></select></label>
        <label><span><b>Week starts on</b><small>Used across all calendar views</small></span><select defaultValue="Monday"><option>Monday</option><option>Sunday</option></select></label>
        <label><span><b>Show weekends</b><small>Include Saturday and Sunday in week view</small></span><button type="button" className={`toggle ${weekends ? 'on' : ''}`} onClick={() => setWeekends(!weekends)}><i/></button></label>
        <label><span><b>Daily agenda email</b><small>Receive a summary each morning at 7:00 AM</small></span><button type="button" className={`toggle ${emails ? 'on' : ''}`} onClick={() => setEmails(!emails)}><i/></button></label>
      </div>
      : <div className="settings-content planner-settings"><h2>AI Planner</h2><p>Vercel AI Gateway prepares structured event proposals from text or screenshots. Attachments are resized and stripped of file metadata first. Nothing is added until you confirm it.</p>
        <div className="gateway-status"><LockKeyhole size={17}/><span><b>Deployment-managed security</b><small>Vercel uses a short-lived OIDC token. No model credential is stored in this browser or database.</small></span></div>
        {!planner && !plannerError && <div className="integration-loading"><LoaderCircle size={16}/>Loading planner settings</div>}
        {planner && <>
          <label><span><b>Enable AI Planner</b><small>Allow authenticated users to request event proposals</small></span><button type="button" className={`toggle ${planner.enabled ? 'on' : ''}`} onClick={() => setPlanner({ ...planner, enabled: !planner.enabled })}><i/></button></label>
          <label><span><b>Model profile</b><small>Choose the balance of speed, cost, and reasoning quality</small></span><select value={planner.modelProfile} onChange={(event) => setPlanner({ ...planner, modelProfile: event.target.value as PlannerSettings['modelProfile'] })}><option value="fast">Fast · GPT-5.6 Luna</option><option value="balanced">Balanced · GPT-5.6 Terra</option><option value="quality">Quality · GPT-5.6 Sol</option></select></label>
          <label><span><b>Household timezone</b><small>IANA timezone used to resolve phrases like “tomorrow at 7”</small></span><input value={planner.timezone} onChange={(event) => setPlanner({ ...planner, timezone: event.target.value })} placeholder="America/New_York"/></label>
          <label><span><b>Default calendar</b><small>Used when a request does not name a calendar</small></span><input maxLength={100} value={planner.defaultCalendar} onChange={(event) => setPlanner({ ...planner, defaultCalendar: event.target.value })}/></label>
          <div className="planner-settings-actions"><button className="save-event" disabled={savingPlanner || !planner.timezone.trim() || !planner.defaultCalendar.trim()} onClick={() => void savePlanner()}>{savingPlanner ? 'Saving…' : 'Save AI settings'}</button>{plannerSaved && <span><Check size={14}/>Saved</span>}</div>
        </>}
        {plannerError && <div className="modal-error" role="alert">{plannerError}</div>}
      </div>}
    </section>
  </div>
}

function formatProposalDate(
  value: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone,
  }).format(new Date(value))
}

function proposalTime(event: PlannedEvent, timezone: string) {
  const start = new Date(event.startAt)
  if (event.allDay && event.allDayDate) {
    const date = formatProposalDate(`${event.allDayDate}T12:00:00Z`, 'UTC', {
      month: 'short',
      day: 'numeric',
    })
    if (!event.allDayEndDate) return `${date} · All day`
    const inclusiveEnd = new Date(`${event.allDayEndDate}T12:00:00Z`)
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1)
    const endDate = formatProposalDate(inclusiveEnd.toISOString(), 'UTC', {
      month: 'short',
      day: 'numeric',
    })
    return `${date}–${endDate} · All day`
  }
  const date = formatProposalDate(start.toISOString(), timezone, {
    month: 'short',
    day: 'numeric',
  })
  const startTime = formatProposalDate(start.toISOString(), timezone, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const end = event.endAt
    ? `–${formatProposalDate(event.endAt, timezone, {
      hour: 'numeric',
      minute: '2-digit',
    })}`
    : ''
  return `${date} · ${startTime}${end}`
}

function proposalDatePart(
  event: PlannedEvent,
  timezone: string,
  part: 'day' | 'month',
) {
  const value = event.allDay && event.allDayDate
    ? `${event.allDayDate}T12:00:00Z`
    : event.startAt
  return formatProposalDate(value, event.allDay ? 'UTC' : timezone, (
    part === 'day' ? { day: 'numeric' } : { month: 'short' }
  ))
}

function useDialogAccessibility(
  dialogRef: { current: HTMLElement | null },
  close: () => void,
  active = true,
) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!active) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const background = [...document.querySelectorAll<HTMLElement>(
      '.app-shell > .sidebar, .app-shell > main, .app-shell > .chat-fab',
    )]
    const previousOverflow = document.body.style.overflow
    background.forEach((element) => { element.inert = true })
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.preventDefault()
        closeRef.current()
        return
      }
      if (keyboardEvent.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (keyboardEvent.shiftKey && document.activeElement === first) {
        keyboardEvent.preventDefault()
        last.focus()
      } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
        keyboardEvent.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      )?.focus()
    })
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      background.forEach((element) => { element.inert = false })
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [active, dialogRef])
}

type PlannerChatTurn = {
  id: string
  userText: string
  hadImage: boolean
  proposal: PlannerProposal
  model: string
  timezone: string
}

function AssistantPanel({ open, close, save }: {
  open: boolean
  close: () => void
  save: (
    events: PlannedEvent[],
    requestId: string,
    proposalToken: string,
    sessionId: string,
    revision: number,
  ) => Promise<void>
}) {
  const panelRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const imageProcessingIdRef = useRef(0)
  useDialogAccessibility(panelRef, close, open)
  const [text, setText] = useState('')
  const [image, setImage] = useState<PlannerImageAttachment | null>(null)
  const [turns, setTurns] = useState<PlannerChatTurn[]>([])
  const [pendingText, setPendingText] = useState('')
  const [pendingHadImage, setPendingHadImage] = useState(false)
  const [contextToken, setContextToken] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [revision, setRevision] = useState<number | null>(null)
  const [pendingTurnId, setPendingTurnId] = useState<string | null>(null)
  const [turnsRemaining, setTurnsRemaining] = useState(8)
  const [proposal, setProposal] = useState<PlannerProposal | null>(null)
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [proposalToken, setProposalToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [processingImage, setProcessingImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canRetryInitialScreenshot = Boolean(
    pendingTurnId && sessionId && !contextToken && !text.trim() && !image,
  )

  useEffect(() => {
    if (!open) return
    conversationEndRef.current?.scrollIntoView({
      behavior: turns.length ? 'smooth' : 'auto',
      block: 'end',
    })
  }, [loading, open, turns.length])

  useEffect(() => {
    if (!open) {
      imageProcessingIdRef.current += 1
      setImage(null)
      setProcessingImage(false)
    }
  }, [open])

  const clearSession = () => {
    setText('')
    setImage(null)
    setTurns([])
    setPendingText('')
    setPendingHadImage(false)
    setContextToken(null)
    setSessionId(null)
    setRevision(null)
    setPendingTurnId(null)
    setTurnsRemaining(8)
    setProposal(null)
    setProposalId(null)
    setProposalToken(null)
    setSaving(false)
    setError(null)
  }

  const resetSession = async () => {
    if (!sessionId || resetting) {
      clearSession()
      return
    }
    setResetting(true)
    setError(null)
    try {
      await resetPlannerSessionRequest(sessionId)
      clearSession()
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset planner session')
    } finally {
      setResetting(false)
    }
  }

  const submit = async () => {
    const message = text.trim()
    if (
      (!message && !image && !canRetryInitialScreenshot)
      || loading
      || processingImage
      || saving
    ) return
    const userText = message || (
      canRetryInitialScreenshot
        ? 'Recover screenshot extraction'
        : 'Extract events from this screenshot'
    )
    const hadImage = Boolean(image) || canRetryInitialScreenshot
    const requestSessionId = sessionId ?? crypto.randomUUID()
    const requestTurnId = pendingTurnId ?? crypto.randomUUID()
    setSessionId(requestSessionId)
    setPendingTurnId(requestTurnId)
    setPendingText(userText)
    setPendingHadImage(hadImage)
    setError(null)
    setLoading(true)
    try {
      const result = await proposeEvents(
        message,
        image ?? undefined,
        contextToken ?? undefined,
        requestSessionId,
        requestTurnId,
      )
      setProposal(result.proposal)
      setProposalId(result.proposalId)
      setProposalToken(result.proposalToken)
      setContextToken(result.contextToken)
      setSessionId(result.sessionId)
      setRevision(result.revision)
      setPendingTurnId(null)
      setTurnsRemaining(result.turnsRemaining)
      setTurns((current) => [...current, {
        id: crypto.randomUUID(),
        userText,
        hadImage,
        proposal: result.proposal,
        model: result.model,
        timezone: result.timezone,
      }].slice(-8))
      setImage(null)
      setText('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to prepare this event')
    } finally {
      setLoading(false)
      setPendingText('')
      setPendingHadImage(false)
    }
  }

  const attachScreenshot = async (file: File | undefined) => {
    if (!file) return
    const processingId = imageProcessingIdRef.current + 1
    imageProcessingIdRef.current = processingId
    setPendingTurnId(null)
    if (!contextToken) setSessionId(null)
    setProcessingImage(true)
    setError(null)
    try {
      const prepared = await preparePlannerScreenshot(file)
      if (imageProcessingIdRef.current === processingId) setImage(prepared)
    } catch (imageError) {
      if (imageProcessingIdRef.current === processingId) {
        setImage(null)
        setError(imageError instanceof Error ? imageError.message : 'Unable to attach screenshot')
      }
    } finally {
      if (imageProcessingIdRef.current === processingId) {
        setProcessingImage(false)
      }
    }
  }

  const confirm = async () => {
    if (
      !proposal?.events.length
      || !proposalId
      || !proposalToken
      || !sessionId
      || revision === null
      || saving
    ) return
    setSaving(true)
    setError(null)
    try {
      await save(
        proposal.events,
        proposalId,
        proposalToken,
        sessionId,
        revision,
      )
      clearSession()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save proposed events')
      setSaving(false)
    }
  }

  if (!open) return null

  return <div className="assistant-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><aside ref={panelRef} className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
    <div className="assistant-header"><div className="assistant-symbol"><Sparkles size={19}/></div><div><b id="assistant-title">Family planner</b><span>{contextToken ? `${turnsRemaining} turns remaining` : 'Powered by Vercel AI Gateway'}</span></div><div className="assistant-header-actions">{contextToken && <button type="button" className="new-plan-button" disabled={loading || saving || processingImage || resetting} onClick={() => void resetSession()}>{resetting ? 'Resetting…' : 'New plan'}</button>}<button type="button" onClick={close} aria-label="Close AI planner"><X size={20}/></button></div></div>
    <div className="sr-only" role="status" aria-live="polite">{processingImage ? 'Processing screenshot' : loading ? 'Preparing calendar proposal' : proposal?.result === 'needs_clarification' ? `Clarification needed: ${proposal.message}` : proposal ? `${proposal.events.length} proposed events ready for review` : ''}</div>
    <div className="assistant-body">
      {!turns.length && !pendingText && <div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div><p>Tell me what you’d like to add. I’ll prepare the dates and details for your review.</p><span>Try something like:</span><button onClick={() => setText('Swimming lessons every Tuesday at 4pm for the next 6 weeks')}>“Swimming lessons every Tuesday at 4pm for the next 6 weeks”</button></div></div>}
      {turns.map((turn, index) => <div className="planner-turn" key={turn.id}>
        <div className="user-message">{turn.hadImage && <span className="processed-screenshot"><ImagePlus size={14}/>Screenshot processed</span>}<span>{turn.userText}</span></div>
        <div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div>
          <p>{turn.proposal.message}</p>
          {turn.proposal.events.length > 0 && <div className="proposal-events">{turn.proposal.events.map((event, eventIndex) => <div className="parsed-event" key={`${event.startAt}-${event.title}-${eventIndex}`}><div className="parsed-date"><b>{proposalDatePart(event, turn.timezone, 'day')}</b><span>{proposalDatePart(event, turn.timezone, 'month')}</span></div><div><b>{event.title}</b><span><Clock3 size={13}/>{proposalTime(event, turn.timezone)} · {event.calendar}</span>{event.location && <span><MapPin size={13}/>{event.location}</span>}</div></div>)}</div>}
          {turn.proposal.warnings.length > 0 && <ul className="proposal-warnings">{turn.proposal.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          {turn.proposal.result === 'proposal' && <div className="chat-actions"><span>{index === turns.length - 1 && !loading ? turn.model.replace('openai/', '') : 'Superseded'}</span>{index === turns.length - 1 && !loading && <button className="confirm-chat" disabled={saving} onClick={() => void confirm()}><Check size={15}/>{saving ? 'Adding…' : `Add ${turn.proposal.events.length} event${turn.proposal.events.length === 1 ? '' : 's'}`}</button>}</div>}
        </div></div>
      </div>)}
      {pendingText && <div className="user-message">{pendingHadImage && <span className="processed-screenshot"><ImagePlus size={14}/>Processing screenshot</span>}<span>{pendingText}</span></div>}
      {loading && <div className="ai-message planner-thinking"><div className="assistant-symbol small"><LoaderCircle size={14}/></div><div><p>Preparing a structured calendar proposal…</p></div></div>}
      {error && <div className="assistant-error" role="alert">{error}</div>}
      <div ref={conversationEndRef}/>
    </div>
    <div className="assistant-input">
      {image && <div className="screenshot-attachment"><img src={image.previewUrl} alt="Screenshot ready for extraction"/><span><b>{image.name}</b><small>Ready to extract events</small></span><button type="button" onClick={() => { setImage(null); setPendingTurnId(null); if (!contextToken) setSessionId(null) }} aria-label="Remove screenshot"><X size={14}/></button></div>}
      <textarea aria-label="AI planner request" disabled={saving} maxLength={contextToken ? 4000 : 12000} value={text} onChange={(event) => { setText(event.target.value); setPendingTurnId(null); if (!contextToken) setSessionId(null) }} placeholder={contextToken ? 'Refine this plan or answer the clarification…' : image ? 'Optional: add context about this screenshot…' : 'Describe an event, paste a schedule, or attach a screenshot…'} />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => {
        void attachScreenshot(event.target.files?.[0])
        event.target.value = ''
      }}/>
      <div className="assistant-input-actions">
        <button type="button" className="attach-screenshot" disabled={Boolean(contextToken) || loading || processingImage || saving} onClick={() => fileInputRef.current?.click()} aria-label={contextToken ? 'Start a new plan to attach another screenshot' : 'Attach calendar screenshot'} title={contextToken ? 'Start a new plan to attach another screenshot' : undefined}>{processingImage ? <LoaderCircle size={17}/> : <ImagePlus size={17}/>}</button>
        <span>{contextToken ? 'Follow-ups use the latest event state, not the original image.' : canRetryInitialScreenshot ? 'Retry can recover the processed result without resending the image.' : 'Attachments are sent only on this turn and never added to follow-up context.'}</span>
        <button type="button" className="send-planner-request" disabled={(!text.trim() && !image && !canRetryInitialScreenshot) || loading || processingImage || saving} onClick={() => void submit()} aria-label={canRetryInitialScreenshot ? 'Recover previous screenshot proposal' : 'Prepare calendar proposal'}><ChevronRight size={19}/></button>
      </div>
    </div>
  </aside></div>
}

function eventTimeSummary(event: EventItem) {
  if (event.allDay) {
    if (!event.endDate) return `${format(event.date, 'EEEE, MMMM d, yyyy')} · All day`
    const inclusiveEnd = new Date(event.endDate)
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)
    if (isSameDay(event.date, inclusiveEnd)) {
      return `${format(event.date, 'EEEE, MMMM d, yyyy')} · All day`
    }
    return `${format(event.date, 'MMM d')} – ${format(inclusiveEnd, 'MMM d, yyyy')} · All day`
  }
  const date = format(event.date, 'EEEE, MMMM d, yyyy')
  if (!event.endDate) return `${date} · ${event.start}`
  if (isSameDay(event.date, event.endDate)) {
    return `${date} · ${event.start} – ${event.end}`
  }
  return `${format(event.date, 'MMM d, h:mm a')} – ${format(event.endDate, 'MMM d, yyyy, h:mm a')}`
}

function EventDetailModal({ event, close }: { event: EventItem; close: () => void }) {
  const modalRef = useRef<HTMLElement>(null)
  useDialogAccessibility(modalRef, close)
  const accounts = event.google?.accounts ?? []
  const organizer = event.organizer?.displayName || event.organizer?.email
  const safeDescription = useMemo(() => DOMPurify.sanitize(event.description ?? '', {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href'],
  }), [event.description])

  return <div className="modal-scrim" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) close() }}>
    <article ref={modalRef} className="event-detail-modal" role="dialog" aria-modal="true" aria-labelledby="event-detail-title" aria-describedby="event-detail-summary">
      <div className="modal-heading"><div><p className="eyebrow">{event.source === 'google' ? 'Google Calendar event' : 'Saved family event'}</p><h2 id="event-detail-title">{event.title}</h2></div><button type="button" autoFocus onClick={close} aria-label="Close event details"><X size={20}/></button></div>
      <div className="event-detail-summary" id="event-detail-summary">
        <div className={`event-detail-date ${event.color}`}><b>{format(event.date, 'd')}</b><span>{format(event.date, 'MMM')}</span></div>
        <div><b>{eventTimeSummary(event)}</b><span>{eventSourceLabel(event)}</span></div>
      </div>
      <dl className="event-detail-list">
        <div><dt><CalendarDays size={16}/>Calendar</dt><dd>{event.calendar}{event.google && <span className={`calendar-type ${event.google.calendar.type}`}>{calendarTypeLabel(event.google.calendar.type)}</span>}</dd></div>
        {event.location && <div><dt><MapPin size={16}/>Location</dt><dd>{event.location}</dd></div>}
        {organizer && <div><dt><Users size={16}/>Organizer</dt><dd>{organizer}{event.organizer?.self ? ' (this account)' : ''}</dd></div>}
        {accounts.length > 0 && <div><dt><Link2 size={16}/>Connected through</dt><dd className="event-account-list">{accounts.map((account) => <span key={account.id}>{account.email || account.displayName || 'Google account'} · {calendarTypeLabel(account.calendarType)}</span>)}</dd></div>}
      </dl>
      {safeDescription && <section className="event-description"><b>Description</b><div
        onClick={(mouseEvent) => {
          const target = mouseEvent.target instanceof Element
            ? mouseEvent.target.closest<HTMLAnchorElement>('a[href]')
            : null
          if (!target) return
          mouseEvent.preventDefault()
          window.open(target.href, '_blank', 'noopener,noreferrer')
        }}
        dangerouslySetInnerHTML={{ __html: safeDescription }}
      /></section>}
      <div className="event-detail-actions">
        <button type="button" onClick={close}>Close</button>
        {event.externalUrl && <a href={event.externalUrl} target="_blank" rel="noreferrer">Open in Google Calendar <ExternalLink size={14}/></a>}
      </div>
    </article>
  </div>
}

function EventModal({ selectedDate, close, save }: { selectedDate: Date; close: () => void; save: (event: NewEventInput) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [calendar, setCalendar] = useState('Family')
  const [date, setDate] = useState(format(selectedDate, 'yyyy-MM-dd'))
  const [time, setTime] = useState('09:00')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}><form className="event-modal" onSubmit={async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await save({
        title: title.trim() || 'Untitled event',
        startAt: new Date(`${date}T${time}:00`).toISOString(),
        calendar,
        location: location.trim() || undefined,
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save event')
      setSaving(false)
    }
  }}>
    <div className="modal-heading"><div><p className="eyebrow">New event</p><h2>Add to your calendar</h2></div><button type="button" onClick={close}><X size={20}/></button></div>
    <label className="field"><span>Event title</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What’s happening?" /></label>
    <div className="field-row"><label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)}/></label><label className="field"><span>Start time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)}/></label></div>
    <label className="field"><span>Calendar</span><select value={calendar} onChange={(e) => setCalendar(e.target.value)}><option>Family</option><option>Alex</option><option>Maya</option></select></label>
    <label className="field"><span>Location <small>optional</small></span><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" /></label>
    {error && <div className="modal-error" role="alert">{error}</div>}
    <div className="modal-tip"><Sparkles size={16}/><span>Tip: you can also ask the AI planner to create repeating or multi-part events.</span></div>
    <div className="modal-actions"><button type="button" onClick={close} disabled={saving}>Cancel</button><button className="save-event" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add event'}</button></div>
  </form></div>
}

export default App
