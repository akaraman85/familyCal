import {
  useEffect, useMemo, useRef, useState,
  type CSSProperties, type DragEvent as ReactDragEvent, type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import DOMPurify from 'dompurify'
import {
  AlertTriangle, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Columns2, ExternalLink, Globe, ImagePlus, LayoutDashboard, LayoutGrid,
  Link2, ListFilter, LoaderCircle, LockKeyhole, LogOut, MapPin, Menu, MessageCircleMore,
  Pencil, Plus, Repeat, Search, Settings, Sparkles, Users, Video, WandSparkles, X,
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
  updateCalendarEvent,
  type CalendarEventData,
  type CalendarEventWrite,
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
import {
  CALENDAR_VIEWS,
  DEFAULT_CALENDAR_SETTINGS,
  MINI_WEEKDAY_LABELS,
  WEEKDAY_LABELS,
  isWeekendDate,
  loadCalendarSettings,
  updateCalendarSettings,
  weekStartDay,
  yearGridOffset,
  type CalendarSettings,
  type CalendarView,
  type WeekStart,
} from './calendar-settings'

type View = CalendarView
type Page = 'Calendar' | 'Overview' | 'Integrations' | 'Family' | 'Settings'
type EventColor = 'coral' | 'blue' | 'green' | 'gold'
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
  color: EventColor
  source: 'saved' | 'google'
  google?: CalendarEventData['google']
}

type NewEventInput = CalendarEventWrite

const HOUSEHOLD_CALENDAR = 'Family'
const HOUSEHOLD_EVENT_COLOR: EventColor = 'green'
const EVENT_COLORS = new Set<EventColor>(['coral', 'blue', 'green', 'gold'])
const GOOGLE_CALENDAR_TYPE_RANK = {
  'read-only': 0,
  editable: 1,
  owner: 2,
  primary: 3,
} as const

function familyCalendarNames(members: FamilyMember[], extra?: string) {
  const names = [HOUSEHOLD_CALENDAR]
  for (const member of members) {
    if (member.name && !names.includes(member.name)) names.push(member.name)
  }
  if (extra && !names.includes(extra)) names.push(extra)
  return names
}

function useFamilyMembers() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    loadFamilyMembers()
      .then((data) => {
        if (!cancelled) setMembers(data.members)
      })
      .catch(() => {
        if (!cancelled) setMembers([])
      })
    return () => { cancelled = true }
  }, [refreshKey])
  return {
    members,
    refreshMembers: () => setRefreshKey((current) => current + 1),
  }
}

function useFamilyCalendars(extra?: string) {
  const { members } = useFamilyMembers()
  return familyCalendarNames(members, extra)
}

function asEventColor(color: string | undefined): EventColor {
  return color && EVENT_COLORS.has(color as EventColor)
    ? color as EventColor
    : HOUSEHOLD_EVENT_COLOR
}

function eventColor(
  event: Pick<CalendarEventData, 'calendar' | 'source' | 'google'>,
  members: FamilyMember[],
): EventColor {
  if (event.google?.accounts.length) {
    const ranked = [...event.google.accounts].sort(
      (a, b) => (
        GOOGLE_CALENDAR_TYPE_RANK[b.calendarType]
        - GOOGLE_CALENDAR_TYPE_RANK[a.calendarType]
      ),
    )
    for (const account of ranked) {
      const member = members.find((item) => item.id === account.memberId)
      if (member) return asEventColor(member.color)
    }
  }
  if (event.source === 'saved') {
    const member = members.find((item) => item.name === event.calendar)
    if (member) return asEventColor(member.color)
  }
  return HOUSEHOLD_EVENT_COLOR
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

function toEventItem(event: CalendarEventData, members: FamilyMember[]): EventItem {
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
    color: eventColor(event, members),
    source: event.source,
    google: event.google,
  }
}

const TIMELINE_START_MINUTES = 7 * 60
const TIMELINE_END_MINUTES = 23 * 60
const TIMELINE_RANGE_MINUTES = TIMELINE_END_MINUTES - TIMELINE_START_MINUTES
const TIMELINE_LABEL_HOURS = [8, 10, 12, 14, 16, 18, 20, 22]

function timelinePercent(minutes: number) {
  return `${((minutes - TIMELINE_START_MINUTES) / TIMELINE_RANGE_MINUTES) * 100}%`
}

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
  const top = (visibleStart - TIMELINE_START_MINUTES) / TIMELINE_RANGE_MINUTES * 100
  const height = Math.min(
    (visibleEnd - visibleStart) / TIMELINE_RANGE_MINUTES * 100,
    100 - top,
  )
  return {
    top: `${top}%`,
    height: `${height}%`,
  }
}

function timelineLabel(hour: number) {
  return format(new Date(2026, 0, 1, hour), 'h a')
}

function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const update = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [breakpoint])
  return isMobile
}

const VIEW_OPTIONS: { value: View; label: string; icon: typeof CalendarDays }[] = [
  { value: 'Day', label: 'Day', icon: CalendarDays },
  { value: 'Week', label: 'Week', icon: Columns2 },
  { value: 'Month', label: 'Month', icon: LayoutGrid },
  { value: 'Year', label: 'Year', icon: CalendarDays },
]

function WeekDatePicker({ selectedDate, weekStartsOn, onSelect }: {
  selectedDate: Date
  weekStartsOn: WeekStart
  onSelect: (date: Date) => void
}) {
  const weekStart = weekStartDay(weekStartsOn)
  const days = eachDayOfInterval({
    start: startOfWeek(selectedDate, { weekStartsOn: weekStart }),
    end: endOfWeek(selectedDate, { weekStartsOn: weekStart }),
  })
  return (
    <div className="week-date-picker">
      {days.map((day) => (
        <button
          key={day.toISOString()}
          type="button"
          className={`week-date-pill ${isSameDay(day, selectedDate) ? 'selected' : ''} ${isSameDay(day, new Date()) && !isSameDay(day, selectedDate) ? 'today' : ''}`}
          onClick={() => onSelect(day)}
        >
          <span>{format(day, 'EEE')}</span>
          <b>{format(day, 'd')}</b>
        </button>
      ))}
    </div>
  )
}

function ViewDropdown({ view, setView }: { view: View; setView: (view: View) => void }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = VIEW_OPTIONS.find((option) => option.value === view) ?? VIEW_OPTIONS[0]
  const CurrentIcon = current.icon

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="view-dropdown" ref={menuRef}>
      <button
        type="button"
        className="view-dropdown-trigger"
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <CurrentIcon size={16} />
        {current.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="glass-menu view-dropdown-menu" role="menu">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              className={view === value ? 'active' : ''}
              onClick={() => {
                setView(value)
                setOpen(false)
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
              {view === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
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
  const [view, setView] = useState<View>(() => (
    window.matchMedia('(max-width: 760px)').matches
      ? 'Day'
      : DEFAULT_CALENDAR_SETTINGS.defaultView
  ))
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(
    DEFAULT_CALENDAR_SETTINGS,
  )
  const userChangedView = useRef(false)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const isMobile = useIsMobile()
  const { members: familyMembers, refreshMembers } = useFamilyMembers()
  const [rawEvents, setRawEvents] = useState<CalendarEventData[]>([])
  const [eventSources, setEventSources] = useState<EventSources>({
    saved: 'ok',
    google: 'disconnected',
  })
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventRefresh, setEventRefresh] = useState(0)
  const eventCacheRef = useRef(new Map<string, { events: CalendarEventData[]; sources: EventSources }>())
  const events = useMemo(
    () => rawEvents.map((event) => toEventItem(event, familyMembers)),
    [rawEvents, familyMembers],
  )
  const revalidateGoogleRef = useRef(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const weekStartsOn = weekStartDay(calendarSettings.weekStartsOn)

  useEffect(() => {
    loadCalendarSettings()
      .then(({ settings }) => {
        setCalendarSettings(settings)
        if (!userChangedView.current) {
          setView(isMobile ? 'Day' : settings.defaultView)
        }
      })
      .catch(() => undefined)
  }, [isMobile])

  const changeView = (next: View) => {
    userChangedView.current = true
    setView(next)
  }

  const eventRange = useMemo(() => {
    if (view === 'Year') {
      return {
        start: new Date(selectedDate.getFullYear(), 0, 1),
        end: new Date(selectedDate.getFullYear() + 1, 0, 1),
      }
    }
    if (view === 'Month') {
      return {
        start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn }),
        end: addDays(endOfWeek(endOfMonth(selectedDate), { weekStartsOn }), 1),
      }
    }
    if (view === 'Week') {
      const start = startOfWeek(selectedDate, { weekStartsOn })
      return { start, end: addDays(start, 7) }
    }
    const start = startOfDay(selectedDate)
    return { start, end: addDays(start, 1) }
  }, [selectedDate, view, weekStartsOn])
  const rangeKey = `${eventRange.start.toISOString()}|${eventRange.end.toISOString()}`

  const refreshEvents = (revalidateGoogle = false) => {
    revalidateGoogleRef.current = revalidateGoogle
    setEventRefresh((current) => current + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    const cached = eventCacheRef.current.get(rangeKey)
    const revalidateGoogle = revalidateGoogleRef.current
    revalidateGoogleRef.current = false
    if (cached) {
      setRawEvents(cached.events)
      setEventSources(cached.sources)
      setEventsLoading(revalidateGoogle)
    } else {
      setEventsLoading(true)
    }
    setEventsError(null)

    const apply = (data: Awaited<ReturnType<typeof loadCalendarEvents>>) => {
      eventCacheRef.current.set(rangeKey, { events: data.events, sources: data.sources })
      setRawEvents(data.events)
      setEventSources(data.sources)
    }

    void (async () => {
      try {
        const first = await loadCalendarEvents(
          eventRange.start,
          eventRange.end,
          controller.signal,
          { revalidate: revalidateGoogle },
        )
        if (controller.signal.aborted) return
        apply(first)
        if (first.stale && !revalidateGoogle) {
          setEventsLoading(true)
          const next = await loadCalendarEvents(
            eventRange.start,
            eventRange.end,
            controller.signal,
            { revalidate: true },
          )
          if (controller.signal.aborted) return
          apply(next)
        }
        if (!controller.signal.aborted) setEventsLoading(false)
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!eventCacheRef.current.has(rangeKey)) setRawEvents([])
        setEventsError(error instanceof Error ? error.message : 'Unable to load events')
        if (!controller.signal.aborted) setEventsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [eventRange, eventRefresh, rangeKey])

  useEffect(() => {
    setSelectedEvent((current) => {
      if (!current) return current
      const color = eventColor(current, familyMembers)
      return color === current.color ? current : { ...current, color }
    })
  }, [familyMembers])

  const saveEvent = async (event: NewEventInput) => {
    await saveCalendarEvent(event)
    setModalOpen(false)
    refreshEvents()
  }

  const updateEvent = async (id: string, event: NewEventInput) => {
    const result = await updateCalendarEvent(id, event)
    setSelectedEvent(toEventItem(result.event, familyMembers))
    refreshEvents()
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
    refreshEvents()
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
        ? `${format(startOfWeek(selectedDate, { weekStartsOn }), 'MMM d')} – ${format(endOfWeek(selectedDate, { weekStartsOn }), 'MMM d, yyyy')}`
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
            setView={changeView}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            dateTitle={dateTitle}
            moveDate={moveDate}
            openChat={() => setChatOpen(true)}
            loading={eventsLoading}
            error={eventsError}
            sources={eventSources}
            members={familyMembers}
            weekStartsOn={calendarSettings.weekStartsOn}
            showWeekends={calendarSettings.showWeekends}
            selectEvent={setSelectedEvent}
            isMobile={isMobile}
          />
        )}
        {page === 'Overview' && <OverviewPage events={events} openModal={() => setModalOpen(true)} selectEvent={setSelectedEvent} />}
        {page === 'Integrations' && <IntegrationsPage onCalendarsChanged={() => refreshEvents(true)} />}
        {page === 'Family' && <FamilyPage onMembersChanged={refreshMembers} />}
        {page === 'Settings' && (
          <SettingsPage onCalendarSettingsSaved={setCalendarSettings} />
        )}
      </main>

      <div className={`fab-stack ${fabOpen ? 'open' : ''} ${page === 'Calendar' && isMobile ? 'visible' : ''}`}>
        {fabOpen && (
          <>
            <button
              type="button"
              className="fab fab-ai"
              aria-label="Open AI planner"
              onClick={() => {
                setChatOpen(true)
                setFabOpen(false)
              }}
            >
              <Sparkles size={20} />
            </button>
            <button
              type="button"
              className="fab fab-event"
              aria-label="Add event"
              onClick={() => {
                setModalOpen(true)
                setFabOpen(false)
              }}
            >
              <CalendarDays size={20} />
            </button>
          </>
        )}
        <button
          type="button"
          className="fab fab-main"
          aria-label={fabOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={fabOpen}
          onClick={() => setFabOpen((open) => !open)}
        >
          {fabOpen ? <X size={22} /> : <Plus size={22} />}
        </button>
      </div>
      <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open AI planner"><Sparkles size={20} /></button>
      <AssistantPanel open={chatOpen} close={() => setChatOpen(false)} save={savePlannedEvents} />
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          close={() => setSelectedEvent(null)}
          save={selectedEvent.source === 'saved' ? updateEvent : undefined}
        />
      )}
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

function CalendarPage({ events, view, setView, selectedDate, setSelectedDate, dateTitle, moveDate, openChat, loading, error, sources, members, weekStartsOn, showWeekends, selectEvent, isMobile }: {
  events: EventItem[]; view: View; setView: (v: View) => void; selectedDate: Date
  setSelectedDate: (d: Date) => void; dateTitle: string; moveDate: (n: number) => void; openChat: () => void
  loading: boolean; error: string | null; sources: EventSources; members: FamilyMember[]; weekStartsOn: WeekStart; showWeekends: boolean; selectEvent: (event: EventItem) => void
  isMobile: boolean
}) {
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'
  const selectDay = (day: Date) => {
    setSelectedDate(day)
    if (isMobile && view !== 'Day') setView('Day')
  }
  return (
    <div className="page calendar-page">
      <div className="page-heading desktop-only">
        <div><p className="eyebrow">{format(now, 'EEEE, MMMM d')}</p><h1>Good {greeting}, Alex</h1><p>Here’s what’s happening with your family.</p></div>
        <button className="ai-plan-btn" onClick={openChat}><Sparkles size={17} />Plan with AI</button>
      </div>
      {error && <div className="calendar-source-error" role="alert">{error}</div>}
      {!error && sources.google === 'error' && <div className="calendar-source-error" role="status">{events.some((event) => event.source === 'google') ? 'Google Calendar could not be refreshed. Showing the last loaded events.' : 'Saved events are shown, but Google Calendar could not be reached.'}</div>}
      <section className="calendar-card">
        <div className="mobile-calendar-header mobile-only">
          <div className="mobile-calendar-top">
            <h2>{format(selectedDate, 'MMMM yyyy')}</h2>
            <ViewDropdown view={view} setView={setView} />
          </div>
          <WeekDatePicker selectedDate={selectedDate} weekStartsOn={weekStartsOn} onSelect={selectDay} />
        </div>
        <div className="calendar-toolbar">
          <div className="date-navigation desktop-toolbar">
            <button className="today-btn" onClick={() => setSelectedDate(new Date())}>Today</button>
            <button className="square-btn" onClick={() => moveDate(-1)}><ChevronLeft size={18} /></button>
            <button className="square-btn" onClick={() => moveDate(1)}><ChevronRight size={18} /></button>
            <h2>{dateTitle}</h2>
          </div>
          <div className="view-controls">
            <button className="filter-btn desktop-toolbar"><ListFilter size={16} />Filter</button>
            <div className="segmented desktop-toolbar">
              {CALENDAR_VIEWS.map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item}</button>)}
            </div>
          </div>
        </div>
        {view === 'Month' && <MonthView events={events} selectedDate={selectedDate} weekStartsOn={weekStartsOn} onSelect={setSelectedDate} selectEvent={selectEvent} />}
        {view === 'Week' && <WeekView events={events} selectedDate={selectedDate} weekStartsOn={weekStartsOn} showWeekends={showWeekends} selectEvent={selectEvent} />}
        {view === 'Day' && <DayView events={events} selectedDate={selectedDate} selectEvent={selectEvent} />}
        {view === 'Year' && <YearView events={events} selectedDate={selectedDate} weekStartsOn={weekStartsOn} onSelect={(d) => { setSelectedDate(d); setView('Month') }} />}
      </section>
      <div className="calendar-footer">
        <div className="calendar-legend">
          {members.map((member) => (
            <span key={member.id}><i className={`dot ${member.color}`} />{member.name}</span>
          ))}
          <span><i className={`dot ${HOUSEHOLD_EVENT_COLOR}`} />{HOUSEHOLD_CALENDAR}</span>
        </div>
        {loading && <span className="calendar-loading"><LoaderCircle size={12}/>{events.length ? 'Updating events' : 'Loading events'}</span>}
      </div>
    </div>
  )
}

function MonthView({ events, selectedDate, weekStartsOn, onSelect, selectEvent }: { events: EventItem[]; selectedDate: Date; weekStartsOn: WeekStart; onSelect: (d: Date) => void; selectEvent: (event: EventItem) => void }) {
  const weekStart = weekStartDay(weekStartsOn)
  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: weekStart }),
    end: endOfWeek(endOfMonth(selectedDate), { weekStartsOn: weekStart }),
  }), [selectedDate, weekStart])
  return (
    <div className="month-view">
      <div className="weekday-row">{WEEKDAY_LABELS[weekStartsOn].map((d) => <div key={d}>{d}</div>)}</div>
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

function WeekView({ events, selectedDate, weekStartsOn, showWeekends, selectEvent }: { events: EventItem[]; selectedDate: Date; weekStartsOn: WeekStart; showWeekends: boolean; selectEvent: (event: EventItem) => void }) {
  const weekStart = weekStartDay(weekStartsOn)
  const days = eachDayOfInterval({
    start: startOfWeek(selectedDate, { weekStartsOn: weekStart }),
    end: endOfWeek(selectedDate, { weekStartsOn: weekStart }),
  }).filter((day) => showWeekends || !isWeekendDate(day))
  const hasAllDayEvents = events.some((event) => (
    event.allDay && days.some((day) => isSameDay(event.date, day))
  ))
  return (
    <div className="week-view" style={{ '--week-days': String(days.length) } as CSSProperties}>
      <div className="week-head"><div />{days.map((day) => <div className={isSameDay(day, new Date()) ? 'current' : ''} key={day.toISOString()}><span>{format(day, 'EEE')}</span><b>{format(day, 'd')}</b></div>)}</div>
      {hasAllDayEvents && <div className="week-all-day"><span>All day</span>{days.map((day) => <div key={day.toISOString()}>{events.filter((event) => event.allDay && isSameDay(event.date, day)).map((event) => <button type="button" className={`all-day-event ${event.color}`} title={eventSourceLabel(event)} onClick={() => selectEvent(event)} key={event.id}>{event.title}</button>)}</div>)}</div>}
      <div className="week-body">
        <div className="times">{TIMELINE_LABEL_HOURS.map((hour) => <span key={hour} style={{ top: timelinePercent(hour * 60) }}>{timelineLabel(hour)}</span>)}</div>
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
  const now = new Date()
  const isToday = isSameDay(selectedDate, now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNowLine = isToday
    && nowMinutes >= TIMELINE_START_MINUTES
    && nowMinutes <= TIMELINE_END_MINUTES
  const nowTop = showNowLine ? timelinePercent(nowMinutes) : null
  return (
    <div className="day-view">
      {allDayEvents.length > 0 && <div className="day-all-day"><span>All day</span><div>{allDayEvents.map((event) => <button type="button" className={`all-day-event ${event.color}`} title={eventSourceLabel(event)} onClick={() => selectEvent(event)} key={event.id}>{event.title}</button>)}</div></div>}
      <div className="day-timed">
        <div className="day-timeline">
          {TIMELINE_LABEL_HOURS.map((hour) => <div className="time-row" key={hour} style={{ top: timelinePercent(hour * 60) }}><span>{timelineLabel(hour)}</span><i /></div>)}
        </div>
        <div className="day-events">
          {showNowLine && nowTop && (
            <div className="now-indicator" style={{ top: nowTop }}>
              <span>{format(now, 'h:mm a')}</span>
              <i />
            </div>
          )}
          {timedEvents.map((event) => {
            const position = timelinePosition(event)
            if (!position) return null
            return (
              <button
                type="button"
                className={`day-event-card ${event.color}`}
                key={event.id}
                style={position}
                title={eventSourceLabel(event)}
                onClick={() => selectEvent(event)}
              >
                <div className="day-event-content">
                  <b>{event.title}</b>
                  <span>{event.start}{event.end ? ` – ${event.end}` : ''}</span>
                </div>
                <span className="day-event-check" aria-hidden="true" />
              </button>
            )
          })}
          {!dayEvents.length && <div className="empty-day"><CalendarDays size={28} /><b>No plans yet</b><span>Enjoy the open space in your day.</span></div>}
        </div>
      </div>
    </div>
  )
}

function YearView({ events, selectedDate, weekStartsOn, onSelect }: { events: EventItem[]; selectedDate: Date; weekStartsOn: WeekStart; onSelect: (d: Date) => void }) {
  const weekdayLabels = MINI_WEEKDAY_LABELS[weekStartsOn]
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => {
    const first = new Date(selectedDate.getFullYear(), month, 1)
    const offset = yearGridOffset(first, weekStartsOn)
    const days = new Date(selectedDate.getFullYear(), month + 1, 0).getDate()
    return <button className="mini-month" key={month} onClick={() => onSelect(first)}><h3>{format(first, 'MMMM')}</h3><div className="mini-weekdays">{weekdayLabels.map((d, i) => <span key={`${d}${i}`}>{d}</span>)}</div><div className="mini-days">{Array.from({ length: offset }, (_, i) => <i key={`x${i}`} />)}{Array.from({ length: days }, (_, i) => { const date = new Date(selectedDate.getFullYear(), month, i + 1); return <span key={i} className={`${isSameDay(date, new Date()) ? 'today' : ''} ${events.some((e) => isSameDay(e.date, date)) ? 'has-event' : ''}`}>{i + 1}</span> })}</div></button>
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
        <div className="agenda-list">{events.slice(0,5).map((e) => <button type="button" className="agenda-item" onClick={() => selectEvent(e)} key={e.id}><div className="agenda-date"><b>{format(e.date, 'd')}</b><span>{format(e.date, 'MMM')}</span></div><i className={e.color}/><div className="agenda-info"><b>{e.title}</b><span><Clock3 size={13} />{e.start}{e.location && <><MapPin size={13} />{e.location}</>}</span></div><div className={`tiny-avatar ${e.color}`}>{e.calendar.slice(0, 1).toUpperCase()}</div></button>)}
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

function FamilyPage({ onMembersChanged }: { onMembersChanged?: () => void }) {
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
      onMembersChanged?.()
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
        onMembersChanged?.()
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

function SettingsPage({ onCalendarSettingsSaved }: {
  onCalendarSettingsSaved: (settings: CalendarSettings) => void
}) {
  const [tab, setTab] = useState<'general' | 'planner'>('general')
  const [calendar, setCalendar] = useState<CalendarSettings | null>(null)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [savingCalendar, setSavingCalendar] = useState(false)
  const [calendarSaved, setCalendarSaved] = useState(false)
  const [planner, setPlanner] = useState<PlannerSettings | null>(null)
  const [plannerError, setPlannerError] = useState<string | null>(null)
  const [savingPlanner, setSavingPlanner] = useState(false)
  const [plannerSaved, setPlannerSaved] = useState(false)

  useEffect(() => {
    loadCalendarSettings()
      .then(({ settings }) => setCalendar(settings))
      .catch((error: unknown) => {
        setCalendar(DEFAULT_CALENDAR_SETTINGS)
        setCalendarError(error instanceof Error ? error.message : 'Unable to load calendar preferences')
      })
    loadPlannerSettings()
      .then(({ settings }) => setPlanner(settings))
      .catch((error: unknown) => {
        setPlannerError(error instanceof Error ? error.message : 'Unable to load AI settings')
      })
  }, [])

  const saveCalendar = async () => {
    if (!calendar) return
    setSavingCalendar(true)
    setCalendarError(null)
    setCalendarSaved(false)
    try {
      const result = await updateCalendarSettings(calendar)
      setCalendar(result.settings)
      onCalendarSettingsSaved(result.settings)
      setCalendarSaved(true)
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : 'Unable to save calendar preferences')
    } finally {
      setSavingCalendar(false)
    }
  }

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
        {!calendar && !calendarError && <div className="integration-loading"><LoaderCircle size={16}/>Loading calendar preferences</div>}
        {calendar && <>
          <label><span><b>Default calendar view</b><small>The view you see when opening the app</small></span><select value={calendar.defaultView} onChange={(event) => { setCalendar({ ...calendar, defaultView: event.target.value as CalendarView }); setCalendarSaved(false) }}>{CALENDAR_VIEWS.map((view) => <option key={view} value={view}>{view}</option>)}</select></label>
          <label><span><b>Week starts on</b><small>Used across all calendar views</small></span><select value={calendar.weekStartsOn} onChange={(event) => { setCalendar({ ...calendar, weekStartsOn: event.target.value as WeekStart }); setCalendarSaved(false) }}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label>
          <label><span><b>Show weekends</b><small>Include Saturday and Sunday in week view</small></span><button type="button" role="switch" aria-checked={calendar.showWeekends} className={`toggle ${calendar.showWeekends ? 'on' : ''}`} onClick={() => { setCalendar({ ...calendar, showWeekends: !calendar.showWeekends }); setCalendarSaved(false) }}><i/></button></label>
          <label><span><b>Daily agenda email</b><small>Receive a summary each morning at 7:00 AM</small></span><button type="button" role="switch" aria-checked={calendar.dailyAgendaEmail} className={`toggle ${calendar.dailyAgendaEmail ? 'on' : ''}`} onClick={() => { setCalendar({ ...calendar, dailyAgendaEmail: !calendar.dailyAgendaEmail }); setCalendarSaved(false) }}><i/></button></label>
          <div className="settings-actions"><button type="button" className="save-event" disabled={savingCalendar} onClick={() => void saveCalendar()}>{savingCalendar ? 'Saving…' : 'Save calendar preferences'}</button>{calendarSaved && <span><Check size={14}/>Saved</span>}</div>
        </>}
        {calendarError && <div className="modal-error" role="alert">{calendarError}</div>}
      </div>
      : <div className="settings-content planner-settings"><h2>AI Planner</h2><p>Vercel AI Gateway prepares structured event proposals from text or screenshots. Attachments are resized and stripped of file metadata first. Nothing is added until you confirm it.</p>
        <div className="gateway-status"><LockKeyhole size={17}/><span><b>Deployment-managed security</b><small>Vercel uses a short-lived OIDC token. No model credential is stored in this browser or database.</small></span></div>
        {!planner && !plannerError && <div className="integration-loading"><LoaderCircle size={16}/>Loading planner settings</div>}
        {planner && <>
          <label><span><b>Enable AI Planner</b><small>Allow authenticated users to request event proposals</small></span><button type="button" className={`toggle ${planner.enabled ? 'on' : ''}`} onClick={() => setPlanner({ ...planner, enabled: !planner.enabled })}><i/></button></label>
          <label><span><b>Model profile</b><small>Choose the balance of speed, cost, and reasoning quality</small></span><select value={planner.modelProfile} onChange={(event) => setPlanner({ ...planner, modelProfile: event.target.value as PlannerSettings['modelProfile'] })}><option value="fast">Fast · GPT-5.6 Luna</option><option value="balanced">Balanced · GPT-5.6 Terra</option><option value="quality">Quality · GPT-5.6 Sol</option></select></label>
          <label><span><b>Household timezone</b><small>IANA timezone used to resolve phrases like “tomorrow at 7”</small></span><input value={planner.timezone} onChange={(event) => setPlanner({ ...planner, timezone: event.target.value })} placeholder="America/New_York"/></label>
          <label><span><b>Default calendar</b><small>Used when a request does not name a calendar</small></span><input maxLength={100} value={planner.defaultCalendar} onChange={(event) => setPlanner({ ...planner, defaultCalendar: event.target.value })}/></label>
          <div className="settings-actions"><button className="save-event" disabled={savingPlanner || !planner.timezone.trim() || !planner.defaultCalendar.trim()} onClick={() => void savePlanner()}>{savingPlanner ? 'Saving…' : 'Save AI settings'}</button>{plannerSaved && <span><Check size={14}/>Saved</span>}</div>
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

const PLANNER_SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png'])

function firstPlannerScreenshotFile(files: FileList | null | undefined) {
  if (!files) return undefined
  return [...files].find((file) => PLANNER_SCREENSHOT_TYPES.has(file.type))
}

const ASSISTANT_PANEL_WIDTH_KEY = 'karaman-assistant-panel-width'
const DEFAULT_ASSISTANT_PANEL_WIDTH = 390
const MIN_ASSISTANT_PANEL_WIDTH = 320
const MAX_ASSISTANT_PANEL_WIDTH = 1100

function clampAssistantPanelWidth(width: number, viewportWidth = window.innerWidth) {
  const min = Math.min(MIN_ASSISTANT_PANEL_WIDTH, viewportWidth)
  const max = Math.min(MAX_ASSISTANT_PANEL_WIDTH, viewportWidth)
  return Math.min(max, Math.max(min, Math.round(width)))
}

function readStoredAssistantPanelWidth() {
  try {
    const stored = Number(window.localStorage.getItem(ASSISTANT_PANEL_WIDTH_KEY))
    if (!Number.isFinite(stored) || stored <= 0) return DEFAULT_ASSISTANT_PANEL_WIDTH
    return stored
  } catch {
    return DEFAULT_ASSISTANT_PANEL_WIDTH
  }
}

function persistAssistantPanelWidth(width: number) {
  try {
    window.localStorage.setItem(ASSISTANT_PANEL_WIDTH_KEY, String(width))
  } catch {
    // Private mode or quota errors should not block resizing.
  }
}

function useAssistantPanelWidth(active: boolean) {
  const [width, setWidth] = useState(() => (
    typeof window === 'undefined'
      ? DEFAULT_ASSISTANT_PANEL_WIDTH
      : clampAssistantPanelWidth(readStoredAssistantPanelWidth())
  ))
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  const applyWidth = (next: number, persist: boolean) => {
    const clamped = clampAssistantPanelWidth(next)
    widthRef.current = clamped
    setWidth(clamped)
    if (persist) persistAssistantPanelWidth(clamped)
    return clamped
  }

  useEffect(() => {
    if (!active) return
    setWidth((current) => clampAssistantPanelWidth(current))
    const onWindowResize = () => {
      setWidth((current) => clampAssistantPanelWidth(current))
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [active])

  useEffect(() => {
    document.body.classList.toggle('assistant-resizing', resizing)
    return () => document.body.classList.remove('assistant-resizing')
  }, [resizing])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.currentTarget.focus({ preventScroll: true })
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
    }
    setResizing(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    applyWidth(drag.startWidth + (drag.startX - event.clientX), false)
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setResizing(false)
    persistAssistantPanelWidth(widthRef.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      applyWidth(width + step, true)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      applyWidth(width - step, true)
    } else if (event.key === 'Home') {
      event.preventDefault()
      applyWidth(MIN_ASSISTANT_PANEL_WIDTH, true)
    } else if (event.key === 'End') {
      event.preventDefault()
      applyWidth(MAX_ASSISTANT_PANEL_WIDTH, true)
    }
  }

  const onDoubleClick = () => {
    applyWidth(DEFAULT_ASSISTANT_PANEL_WIDTH, true)
  }

  return {
    width,
    resizing,
    resizeHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick,
    },
  }
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
  const screenshotDragDepthRef = useRef(0)
  const { width: panelWidth, resizing, resizeHandleProps } = useAssistantPanelWidth(open)
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
  const [screenshotDropActive, setScreenshotDropActive] = useState(false)
  const canRetryInitialScreenshot = Boolean(
    pendingTurnId && sessionId && !contextToken && !text.trim() && !image,
  )
  const screenshotEasyActionOpen = !turns.length && !pendingText
  const canAttachScreenshot = !contextToken && !loading && !processingImage && !saving

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
      screenshotDragDepthRef.current = 0
      setImage(null)
      setProcessingImage(false)
      setScreenshotDropActive(false)
    }
  }, [open])

  const clearSession = () => {
    screenshotDragDepthRef.current = 0
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
    setScreenshotDropActive(false)
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

  const removeScreenshot = () => {
    setImage(null)
    setPendingTurnId(null)
    if (!contextToken) setSessionId(null)
  }

  const onScreenshotDragEnter = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!canAttachScreenshot) return
    screenshotDragDepthRef.current += 1
    setScreenshotDropActive(true)
  }

  const onScreenshotDragOver = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!canAttachScreenshot) {
      event.dataTransfer.dropEffect = 'none'
      return
    }
    event.dataTransfer.dropEffect = 'copy'
  }

  const onScreenshotDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    screenshotDragDepthRef.current = Math.max(0, screenshotDragDepthRef.current - 1)
    if (screenshotDragDepthRef.current === 0) setScreenshotDropActive(false)
  }

  const onScreenshotDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    screenshotDragDepthRef.current = 0
    setScreenshotDropActive(false)
    if (!canAttachScreenshot) return
    const file = firstPlannerScreenshotFile(event.dataTransfer.files)
    if (!file) {
      setError('Choose a JPEG or PNG screenshot')
      return
    }
    void attachScreenshot(file)
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

  return <div className="assistant-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><aside ref={panelRef} id="assistant-panel" className={`assistant-panel${resizing ? ' resizing' : ''}`} style={{ '--assistant-panel-width': `${panelWidth}px` } as CSSProperties} role="dialog" aria-modal="true" aria-labelledby="assistant-title">
    <div className="assistant-header"><div className="assistant-symbol"><Sparkles size={19}/></div><div><b id="assistant-title">Family planner</b><span>{contextToken ? `${turnsRemaining} turns remaining` : 'Powered by Vercel AI Gateway'}</span></div><div className="assistant-header-actions">{contextToken && <button type="button" className="new-plan-button" disabled={loading || saving || processingImage || resetting} onClick={() => void resetSession()}>{resetting ? 'Resetting…' : 'New plan'}</button>}<button type="button" onClick={close} aria-label="Close AI planner"><X size={20}/></button></div></div>
    <div className="assistant-resize" role="separator" aria-orientation="vertical" aria-controls="assistant-panel" aria-label="Resize AI planner" aria-valuemin={MIN_ASSISTANT_PANEL_WIDTH} aria-valuemax={MAX_ASSISTANT_PANEL_WIDTH} aria-valuenow={panelWidth} aria-valuetext={`${panelWidth} pixels`} title="Drag to resize, or use arrow keys" tabIndex={0} {...resizeHandleProps} />
    <div className="sr-only" role="status" aria-live="polite">{processingImage ? 'Processing screenshot' : loading ? 'Preparing calendar proposal' : proposal?.result === 'needs_clarification' ? `Clarification needed: ${proposal.message}` : proposal ? `${proposal.events.length} proposed events ready for review` : ''}</div>
    <div className="assistant-body">
      {screenshotEasyActionOpen && <div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div>
        <p>Tell me what you’d like to add. I’ll prepare the dates and details for your review.</p>
        <span>Easy actions</span>
        <div className="planner-easy-actions">
          <button type="button" className="planner-easy-action" onClick={() => setText('Swimming lessons every Tuesday at 4pm for the next 6 weeks')}>“Swimming lessons every Tuesday at 4pm for the next 6 weeks”</button>
          <div
            className={`planner-screenshot-action${screenshotDropActive ? ' dropping' : ''}`}
            onDragEnter={onScreenshotDragEnter}
            onDragOver={onScreenshotDragOver}
            onDragLeave={onScreenshotDragLeave}
            onDrop={onScreenshotDrop}
          >
            {image
              ? <div className="screenshot-attachment"><img src={image.previewUrl} alt="Screenshot ready for extraction"/><span><b>{image.name}</b><small>Ready to extract events</small></span><button type="button" onClick={removeScreenshot} aria-label="Remove screenshot"><X size={14}/></button></div>
              : <button type="button" className="planner-screenshot-drop" disabled={!canAttachScreenshot} onClick={() => fileInputRef.current?.click()}>
                  {processingImage ? <LoaderCircle size={18}/> : <ImagePlus size={18}/>}
                  <b>Extract events from a screenshot</b>
                  <small>{processingImage ? 'Processing screenshot…' : 'Add a JPEG or PNG here, then continue — no extra prompt needed.'}</small>
                </button>}
            <button type="button" className="planner-screenshot-continue" disabled={!image || loading || processingImage || saving} onClick={() => void submit()}>Continue</button>
          </div>
        </div>
      </div></div>}
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
      {image && !screenshotEasyActionOpen && <div className="screenshot-attachment"><img src={image.previewUrl} alt="Screenshot ready for extraction"/><span><b>{image.name}</b><small>Ready to extract events</small></span><button type="button" onClick={removeScreenshot} aria-label="Remove screenshot"><X size={14}/></button></div>}
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

function exclusiveAllDayEnd(inclusiveEnd: string) {
  const date = new Date(`${inclusiveEnd}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function eventEditValues(event: EventItem) {
  let endDate = ''
  if (event.allDay && event.endDate) {
    const inclusive = new Date(event.endDate)
    inclusive.setDate(inclusive.getDate() - 1)
    if (!isSameDay(event.date, inclusive)) endDate = format(inclusive, 'yyyy-MM-dd')
  }
  return {
    title: event.title,
    calendar: event.calendar,
    date: format(event.date, 'yyyy-MM-dd'),
    time: event.allDay ? '09:00' : format(event.date, 'HH:mm'),
    endTime: event.allDay || !event.endDate ? '' : format(event.endDate, 'HH:mm'),
    endDate,
    allDay: event.allDay,
    location: event.location ?? '',
  }
}

function eventWriteFromForm(form: ReturnType<typeof eventEditValues>): NewEventInput {
  const title = form.title.trim() || 'Untitled event'
  const location = form.location.trim() || undefined
  if (form.allDay) {
    if (form.endDate && form.endDate < form.date) {
      throw new Error('End date must be on or after the start date')
    }
    const allDayEndDate = form.endDate && form.endDate !== form.date
      ? exclusiveAllDayEnd(form.endDate)
      : null
    return {
      title,
      calendar: form.calendar,
      location,
      startAt: new Date(`${form.date}T00:00:00`).toISOString(),
      endAt: allDayEndDate ? new Date(`${allDayEndDate}T00:00:00`).toISOString() : null,
      allDay: true,
      allDayDate: form.date,
      allDayEndDate,
    }
  }
  const startAt = new Date(`${form.date}T${form.time || '09:00'}:00`)
  const endAt = form.endTime
    ? new Date(`${form.endDate || form.date}T${form.endTime}:00`)
    : null
  if (Number.isNaN(startAt.getTime())) throw new Error('Event dates are invalid')
  if (endAt && (Number.isNaN(endAt.getTime()) || endAt <= startAt)) {
    throw new Error('End time must be after the start time')
  }
  return {
    title,
    calendar: form.calendar,
    location,
    startAt: startAt.toISOString(),
    endAt: endAt?.toISOString() ?? null,
    allDay: false,
    allDayDate: null,
    allDayEndDate: null,
  }
}

function EventDetailModal({ event, close, save }: {
  event: EventItem
  close: () => void
  save?: (id: string, input: NewEventInput) => Promise<void>
}) {
  const modalRef = useRef<HTMLElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  useDialogAccessibility(modalRef, close)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => eventEditValues(event))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accounts = event.google?.accounts ?? []
  const organizer = event.organizer?.displayName || event.organizer?.email
  const safeDescription = useMemo(() => DOMPurify.sanitize(event.description ?? '', {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href'],
  }), [event.description])
  const calendars = useFamilyCalendars(event.calendar)
  const canEdit = Boolean(save)

  useEffect(() => {
    setForm(eventEditValues(event))
    setEditing(false)
    setError(null)
  }, [event])

  useEffect(() => {
    if (editing) titleInputRef.current?.focus()
  }, [editing])

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    if (!save || saving) return
    setSaving(true)
    setError(null)
    try {
      await save(event.id, eventWriteFromForm(form))
      setEditing(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save event')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-scrim" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget && !saving) close() }}>
    <article ref={modalRef} className="event-detail-modal" role="dialog" aria-modal="true" aria-labelledby="event-detail-title" aria-describedby={editing ? undefined : 'event-detail-summary'}>
      <div className="modal-heading"><div><p className="eyebrow">{editing ? 'Edit event' : event.source === 'google' ? 'Google Calendar event' : 'Saved family event'}</p><h2 id="event-detail-title">{editing ? form.title.trim() || event.title : event.title}</h2></div><button type="button" autoFocus={!editing} onClick={close} aria-label="Close event details" disabled={saving}><X size={20}/></button></div>
      {editing
        ? <form onSubmit={(submitEvent) => void submit(submitEvent)}>
          <label className="field"><span>Event title</span><input ref={titleInputRef} required maxLength={200} value={form.title} onChange={(change) => setForm({ ...form, title: change.target.value })} placeholder="What’s happening?" /></label>
          <label className="event-edit-toggle"><span>All-day event</span><button type="button" role="switch" aria-checked={form.allDay} className={`toggle ${form.allDay ? 'on' : ''}`} onClick={() => setForm({ ...form, allDay: !form.allDay })}><i/></button></label>
          <div className="field-row">
            <label className="field"><span>Date</span><input type="date" required value={form.date} onChange={(change) => setForm({ ...form, date: change.target.value })}/></label>
            {form.allDay
              ? <label className="field"><span>End date <small>optional</small></span><input type="date" value={form.endDate} onChange={(change) => setForm({ ...form, endDate: change.target.value })}/></label>
              : <label className="field"><span>Start time</span><input type="time" required value={form.time} onChange={(change) => setForm({ ...form, time: change.target.value })}/></label>}
          </div>
          {!form.allDay && <label className="field"><span>End time <small>optional</small></span><input type="time" value={form.endTime} onChange={(change) => setForm({ ...form, endTime: change.target.value })}/></label>}
          <label className="field"><span>Calendar</span><select value={form.calendar} onChange={(change) => setForm({ ...form, calendar: change.target.value })}>{calendars.map((calendar) => <option key={calendar}>{calendar}</option>)}</select></label>
          <label className="field"><span>Location <small>optional</small></span><input value={form.location} onChange={(change) => setForm({ ...form, location: change.target.value })} placeholder="Add a place" maxLength={500} /></label>
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="event-detail-actions">
            <button type="button" onClick={() => { setForm(eventEditValues(event)); setEditing(false); setError(null) }} disabled={saving}>Cancel</button>
            <button className="save-event" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
        : <>
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
          {!canEdit && event.source === 'google' && <p className="event-readonly-note">Google Calendar events are read-only here. Open the event in Google Calendar to change it.</p>}
          <div className="event-detail-actions">
            <button type="button" onClick={close}>Close</button>
            {canEdit && <button type="button" className="edit-event" onClick={() => setEditing(true)}><Pencil size={14}/>Edit</button>}
            {event.externalUrl && <a href={event.externalUrl} target="_blank" rel="noreferrer">Open in Google Calendar <ExternalLink size={14}/></a>}
          </div>
        </>}
    </article>
  </div>
}

function EventModal({ selectedDate, close, save }: { selectedDate: Date; close: () => void; save: (event: NewEventInput) => Promise<void> }) {
  const isMobile = useIsMobile()
  const [title, setTitle] = useState('')
  const calendars = useFamilyCalendars()
  const [calendar, setCalendar] = useState(HOUSEHOLD_CALENDAR)
  const [date, setDate] = useState(format(selectedDate, 'yyyy-MM-dd'))
  const [time, setTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (allDay) {
        await save({
          title: title.trim() || 'Untitled event',
          startAt: new Date(`${date}T00:00:00`).toISOString(),
          endAt: null,
          allDay: true,
          allDayDate: date,
          allDayEndDate: null,
          calendar,
          location: location.trim() || undefined,
        })
        return
      }
      const startAt = new Date(`${date}T${time}:00`)
      const endAt = endTime ? new Date(`${date}T${endTime}:00`) : null
      if (endAt && endAt <= startAt) throw new Error('End time must be after the start time')
      await save({
        title: title.trim() || 'Untitled event',
        startAt: startAt.toISOString(),
        endAt: endAt?.toISOString() ?? null,
        calendar,
        location: location.trim() || undefined,
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save event')
      setSaving(false)
    }
  }

  if (isMobile) {
    return (
      <div className="modal-scrim sheet-scrim" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget && !saving) close() }}>
        <form className="event-sheet" onSubmit={(submitEvent) => void submit(submitEvent)}>
          <header className="sheet-header">
            <button type="button" className="sheet-cancel" onClick={close} disabled={saving}>Cancel</button>
            <h2>New Event</h2>
            <button type="submit" className="sheet-save" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </header>
          <div className="sheet-body">
            <label className="sheet-title-field">
              <input
                autoFocus
                value={title}
                onChange={(change) => setTitle(change.target.value)}
                placeholder="Event title"
                maxLength={200}
              />
            </label>
            <div className="sheet-card">
              <div className="sheet-row">
                <Clock3 size={18} />
                <div className="sheet-row-content">
                  {!allDay && (
                    <div className="sheet-time-range">
                      <input type="time" value={time} onChange={(change) => setTime(change.target.value)} aria-label="Start time" />
                      <ChevronRight size={14} />
                      <input type="time" value={endTime} onChange={(change) => setEndTime(change.target.value)} aria-label="End time" />
                    </div>
                  )}
                  <label className="sheet-value-row sheet-date-label">
                    <span>{format(new Date(`${date}T12:00:00`), 'EEEE, MMMM d')}</span>
                    <ChevronDown size={16} />
                    <input type="date" className="sheet-date-input" value={date} onChange={(change) => setDate(change.target.value)} aria-label="Event date" />
                  </label>
                  <div className="sheet-toggle-row">
                    <span>All day</span>
                    <button type="button" role="switch" aria-checked={allDay} className={`toggle mobile-toggle ${allDay ? 'on' : ''}`} onClick={() => setAllDay((current) => !current)}><i /></button>
                  </div>
                  <button type="button" className="sheet-value-row muted">
                    <Globe size={16} />
                    <span>Time zone</span>
                    <span className="sheet-value">Local</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="sheet-card">
              <div className="sheet-row">
                <Repeat size={18} />
                <button type="button" className="sheet-value-row">
                  <span>Repeat</span>
                  <span className="sheet-value">Never</span>
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
            <div className="sheet-card">
              <div className="sheet-row">
                <Users size={18} />
                <button type="button" className="sheet-value-row">
                  <span>Participant</span>
                  <span className="sheet-value">{calendar}</span>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="sheet-row">
                <Video size={18} />
                <button type="button" className="sheet-value-row">
                  <span>Conferencing</span>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="sheet-row">
                <MapPin size={18} />
                <div className="sheet-row-content">
                  <input
                    className="sheet-inline-input"
                    value={location}
                    onChange={(change) => setLocation(change.target.value)}
                    placeholder="Location"
                    maxLength={500}
                  />
                </div>
              </div>
            </div>
            <div className="sheet-card sheet-description">
              <textarea placeholder="Add description" rows={4} />
              <button type="button" className="use-ai-btn"><Sparkles size={14} />Use AI</button>
            </div>
            <label className="sheet-calendar-select">
              <span>Calendar</span>
              <select value={calendar} onChange={(change) => setCalendar(change.target.value)}>
                {calendars.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            {error && <div className="modal-error" role="alert">{error}</div>}
          </div>
        </form>
      </div>
    )
  }

  return <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}><form className="event-modal" onSubmit={(e) => void submit(e)}>
    <div className="modal-heading"><div><p className="eyebrow">New event</p><h2>Add to your calendar</h2></div><button type="button" onClick={close}><X size={20}/></button></div>
    <label className="field"><span>Event title</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What’s happening?" /></label>
    <div className="field-row"><label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)}/></label><label className="field"><span>Start time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)}/></label></div>
    <label className="field"><span>Calendar</span><select value={calendar} onChange={(e) => setCalendar(e.target.value)}>{calendars.map((name) => <option key={name}>{name}</option>)}</select></label>
    <label className="field"><span>Location <small>optional</small></span><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" /></label>
    {error && <div className="modal-error" role="alert">{error}</div>}
    <div className="modal-tip"><Sparkles size={16}/><span>Tip: you can also ask the AI planner to create repeating or multi-part events.</span></div>
    <div className="modal-actions"><button type="button" onClick={close} disabled={saving}>Cancel</button><button className="save-event" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add event'}</button></div>
  </form></div>
}

export default App
