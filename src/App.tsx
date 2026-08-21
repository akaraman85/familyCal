import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, LayoutDashboard, Link2, ListFilter, LoaderCircle, LockKeyhole,
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
  proposeEvents,
  updatePlannerSettings,
  type PlannedEvent,
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
  color: 'coral' | 'blue' | 'green' | 'gold'
  source: 'saved' | 'google'
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

function toEventItem(event: CalendarEventData): EventItem {
  const startDate = eventDate(event)
  const endDate = event.endAt && !event.allDay ? new Date(event.endAt) : null
  return {
    id: event.id,
    title: event.title,
    date: startDate,
    endDate: endDate ?? undefined,
    allDay: event.allDay,
    start: event.allDay ? 'All day' : format(startDate, 'h:mm a'),
    end: endDate ? format(endDate, 'h:mm a') : undefined,
    calendar: event.calendar,
    location: event.location ?? undefined,
    color: event.source === 'google' ? 'blue' : 'green',
    source: event.source,
  }
}

const TIMELINE_START_MINUTES = 8 * 60
const TIMELINE_END_MINUTES = 22 * 60
const TIMELINE_HEIGHT = 504
const TIMELINE_LABEL_HOURS = [8, 10, 12, 14, 16, 18, 20]

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

  const savePlannedEvents = async (plannedEvents: PlannedEvent[], requestId: string) => {
    await saveCalendarEvents(plannedEvents, requestId)
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
          />
        )}
        {page === 'Overview' && <OverviewPage events={events} openModal={() => setModalOpen(true)} />}
        {page === 'Integrations' && <IntegrationsPage />}
        {page === 'Family' && <FamilyPage />}
        {page === 'Settings' && <SettingsPage />}
      </main>

      <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open AI planner"><Sparkles size={20} /></button>
      {chatOpen && <AssistantPanel close={() => setChatOpen(false)} save={savePlannedEvents} />}
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

function CalendarPage({ events, view, setView, selectedDate, setSelectedDate, dateTitle, moveDate, openChat, loading, error, sources }: {
  events: EventItem[]; view: View; setView: (v: View) => void; selectedDate: Date
  setSelectedDate: (d: Date) => void; dateTitle: string; moveDate: (n: number) => void; openChat: () => void
  loading: boolean; error: string | null; sources: EventSources
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
        {view === 'Month' && <MonthView events={events} selectedDate={selectedDate} onSelect={setSelectedDate} />}
        {view === 'Week' && <WeekView events={events} selectedDate={selectedDate} />}
        {view === 'Day' && <DayView events={events} selectedDate={selectedDate} />}
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

function MonthView({ events, selectedDate, onSelect }: { events: EventItem[]; selectedDate: Date; onSelect: (d: Date) => void }) {
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
            <button key={day.toISOString()} className={`day-cell ${!isSameMonth(day, selectedDate) ? 'muted' : ''} ${isSameDay(day, new Date()) ? 'today' : ''}`} onClick={() => onSelect(day)}>
              <span className="day-number">{format(day, 'd')}</span>
              <div className="events">
                {dayEvents.slice(0, 3).map((event) => <div className={`event-chip ${event.color}`} key={event.id}><span>{event.start.replace(':00', '')}</span>{event.title}</div>)}
                {dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ events, selectedDate }: { events: EventItem[]; selectedDate: Date }) {
  const days = eachDayOfInterval({ start: startOfWeek(selectedDate, { weekStartsOn: 1 }), end: endOfWeek(selectedDate, { weekStartsOn: 1 }) })
  const hasAllDayEvents = events.some((event) => (
    event.allDay && days.some((day) => isSameDay(event.date, day))
  ))
  return (
    <div className="week-view">
      <div className="week-head"><div />{days.map((day) => <div className={isSameDay(day, new Date()) ? 'current' : ''} key={day.toISOString()}><span>{format(day, 'EEE')}</span><b>{format(day, 'd')}</b></div>)}</div>
      {hasAllDayEvents && <div className="week-all-day"><span>All day</span>{days.map((day) => <div key={day.toISOString()}>{events.filter((event) => event.allDay && isSameDay(event.date, day)).map((event) => <div className={`all-day-event ${event.color}`} key={event.id}>{event.title}</div>)}</div>)}</div>}
      <div className="week-body">
        <div className="times">{TIMELINE_LABEL_HOURS.map((hour) => <span key={hour} style={{ top: (hour * 60 - TIMELINE_START_MINUTES) * TIMELINE_HEIGHT / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) }}>{timelineLabel(hour)}</span>)}</div>
        {days.map((day) => <div className="week-column" key={day.toISOString()}>{events.filter((event) => !event.allDay && isSameDay(event.date, day)).map((event) => {
          const position = timelinePosition(event)
          if (!position) return null
          return <div className={`week-event ${event.color}`} style={position} key={event.id}><b>{event.title}</b><span>{event.start}</span></div>
        })}</div>)}
      </div>
    </div>
  )
}

function DayView({ events, selectedDate }: { events: EventItem[]; selectedDate: Date }) {
  const dayEvents = events.filter((e) => isSameDay(e.date, selectedDate))
  const allDayEvents = dayEvents.filter((event) => event.allDay)
  const timedEvents = dayEvents.filter((event) => !event.allDay)
  return (
    <div className="day-view">
      {allDayEvents.length > 0 && <div className="day-all-day"><span>All day</span><div>{allDayEvents.map((event) => <div className={`all-day-event ${event.color}`} key={event.id}>{event.title}</div>)}</div></div>}
      <div className="day-timed">
        <div className="day-timeline">
          {TIMELINE_LABEL_HOURS.map((hour) => <div className="time-row" key={hour} style={{ top: (hour * 60 - TIMELINE_START_MINUTES) * TIMELINE_HEIGHT / (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) }}><span>{timelineLabel(hour)}</span><i /></div>)}
        </div>
        <div className="day-events">
          {timedEvents.map((event) => {
            const position = timelinePosition(event)
            if (!position) return null
            return <div className={`large-event ${event.color}`} key={event.id} style={position}><span>{event.start}{event.end ? ` – ${event.end}` : ''}</span><b>{event.title}</b><small>{event.calendar}{event.location ? ` · ${event.location}` : ''}</small></div>
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

function OverviewPage({ events, openModal }: { events: EventItem[]; openModal: () => void }) {
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
        <div className="agenda-list">{events.slice(0,5).map((e) => <div className="agenda-item" key={e.id}><div className="agenda-date"><b>{format(e.date, 'd')}</b><span>{format(e.date, 'MMM')}</span></div><i className={e.color}/><div className="agenda-info"><b>{e.title}</b><span><Clock3 size={13} />{e.start}{e.location && <><MapPin size={13} />{e.location}</>}</span></div><div className={`tiny-avatar ${e.source === 'google' ? 'alex' : 'family'}`}>{e.calendar.slice(0, 1).toUpperCase()}</div></div>)}
          {!events.length && <div className="agenda-empty">No events in the current calendar view.</div>}
        </div>
      </section>
      <section className="panel insight-panel"><div className="sparkle-orb"><Sparkles /></div><p className="eyebrow">Calendar snapshot</p><h2>{events.length ? `${events.length} event${events.length === 1 ? '' : 's'} in view` : 'Your calendar is open'}</h2><p>{googleCount ? `${googleCount} come from Google Calendar and ${savedCount} are saved directly in Karaman.` : savedCount ? 'These plans are saved directly in Karaman.' : 'Connect Google Calendar or add an event to get started.'}</p><div className="insight-bars"><i/><i/><i/><i/><i/><i/><i/></div></section>
    </div>
  </div>
}

function IntegrationsPage() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [calendarCounts, setCalendarCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [workingAccountId, setWorkingAccountId] = useState<string | null>(null)
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
        setCalendarCounts(calendarData.calendars.reduce<Record<string, number>>((counts, calendar) => {
          counts[calendar.accountId] = (counts[calendar.accountId] ?? 0) + 1
          return counts
        }, {}))
      } else {
        setCalendarCounts({})
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
              const calendarCount = calendarCounts[account.id]
              const hasCalendarPermission = hasGoogleCalendarPermission(account.scopes)
              return <div className="member-integration-account" key={account.id}>
                <div className="integration-icon google">G</div>
                <div>
                  <b>{accountName}</b>
                  {hasCalendarPermission
                    ? <span>{calendarCount === undefined ? 'Checking calendars…' : `${calendarCount} calendar${calendarCount === 1 ? '' : 's'} available`}</span>
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
      : <div className="settings-content planner-settings"><h2>AI Planner</h2><p>Vercel AI Gateway prepares structured event proposals. Nothing is added until you confirm it.</p>
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

function AssistantPanel({ close, save }: {
  close: () => void
  save: (events: PlannedEvent[], requestId: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [submittedText, setSubmittedText] = useState('')
  const [proposal, setProposal] = useState<PlannerProposal | null>(null)
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [timezone, setTimezone] = useState('UTC')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const message = text.trim()
    if (!message || loading) return
    setSubmittedText(message)
    setProposal(null)
    setProposalId(null)
    setError(null)
    setLoading(true)
    try {
      const result = await proposeEvents(message)
      setProposal(result.proposal)
      setProposalId(result.proposalId)
      setModel(result.model)
      setTimezone(result.timezone)
      if (result.proposal.result === 'needs_clarification') setText('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to prepare this event')
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!proposal?.events.length || !proposalId || saving) return
    setSaving(true)
    setError(null)
    try {
      await save(proposal.events, proposalId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save proposed events')
      setSaving(false)
    }
  }

  return <div className="assistant-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><aside className="assistant-panel">
    <div className="assistant-header"><div className="assistant-symbol"><Sparkles size={19}/></div><div><b>Family planner</b><span>Powered by Vercel AI Gateway</span></div><button onClick={close}><X size={20}/></button></div>
    <div className="assistant-body">
      <div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div><p>Tell me what you’d like to add. I’ll prepare the dates and details for your review.</p><span>Try something like:</span><button onClick={() => setText('Swimming lessons every Tuesday at 4pm for the next 6 weeks')}>“Swimming lessons every Tuesday at 4pm for the next 6 weeks”</button></div></div>
      {submittedText && <div className="user-message">{submittedText}</div>}
      {loading && <div className="ai-message planner-thinking"><div className="assistant-symbol small"><LoaderCircle size={14}/></div><div><p>Preparing a structured calendar proposal…</p></div></div>}
      {proposal && <div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div>
        <p>{proposal.message}</p>
        {proposal.events.length > 0 && <div className="proposal-events">{proposal.events.map((event, index) => <div className="parsed-event" key={`${event.startAt}-${event.title}-${index}`}><div className="parsed-date"><b>{proposalDatePart(event, timezone, 'day')}</b><span>{proposalDatePart(event, timezone, 'month')}</span></div><div><b>{event.title}</b><span><Clock3 size={13}/>{proposalTime(event, timezone)} · {event.calendar}</span>{event.location && <span><MapPin size={13}/>{event.location}</span>}</div></div>)}</div>}
        {proposal.warnings.length > 0 && <ul className="proposal-warnings">{proposal.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        {proposal.result === 'proposal' && <div className="chat-actions"><span>{model?.replace('openai/', '')}</span><button className="confirm-chat" disabled={saving} onClick={() => void confirm()}><Check size={15}/>{saving ? 'Adding…' : `Add ${proposal.events.length} event${proposal.events.length === 1 ? '' : 's'}`}</button></div>}
      </div></div>}
      {error && <div className="assistant-error" role="alert">{error}</div>}
    </div>
    <div className="assistant-input"><textarea maxLength={12000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Describe one event, a recurring plan, or paste a schedule..." /><div><span>AI can make mistakes. Review every detail before saving.</span><button disabled={!text.trim() || loading} onClick={() => void submit()}><ChevronRight size={19}/></button></div></div>
  </aside></div>
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
