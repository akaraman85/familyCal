import { useMemo, useState } from 'react'
import {
  Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, CloudSun, LayoutDashboard, Link2, ListFilter,
  MapPin, Menu, MessageCircleMore, MoreHorizontal, Plus, Search,
  Settings, Sparkles, Users, WandSparkles, X,
} from 'lucide-react'
import {
  addDays, addMonths, addYears, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths,
  subYears,
} from 'date-fns'

type View = 'Day' | 'Week' | 'Month' | 'Year'
type Page = 'Calendar' | 'Overview' | 'Integrations' | 'Family' | 'Settings'
type EventItem = {
  id: number
  title: string
  date: Date
  start: string
  end?: string
  calendar: 'Family' | 'Alex' | 'Maya'
  location?: string
  color: 'coral' | 'blue' | 'green' | 'gold'
}

const initialEvents: EventItem[] = [
  { id: 1, title: 'School drop-off', date: new Date(2026, 7, 20), start: '8:15 AM', end: '8:45 AM', calendar: 'Family', color: 'gold' },
  { id: 2, title: 'Project review', date: new Date(2026, 7, 20), start: '10:00 AM', end: '11:00 AM', calendar: 'Alex', color: 'blue' },
  { id: 3, title: 'Lunch with Emma', date: new Date(2026, 7, 20), start: '12:30 PM', calendar: 'Maya', location: 'Little Lemon', color: 'coral' },
  { id: 4, title: 'Leo’s swimming', date: new Date(2026, 7, 21), start: '4:00 PM', end: '5:00 PM', calendar: 'Family', location: 'Community Pool', color: 'green' },
  { id: 5, title: 'Date night', date: new Date(2026, 7, 22), start: '7:30 PM', calendar: 'Family', location: 'Bistro 43', color: 'coral' },
  { id: 6, title: 'Dentist', date: new Date(2026, 7, 24), start: '9:00 AM', calendar: 'Alex', color: 'blue' },
  { id: 7, title: 'Grocery delivery', date: new Date(2026, 7, 25), start: '6:00 PM', calendar: 'Family', color: 'green' },
  { id: 8, title: 'Family brunch', date: new Date(2026, 7, 29), start: '11:00 AM', calendar: 'Family', color: 'gold' },
]

const avatars: Record<string, string> = { Alex: 'AK', Maya: 'MK', Family: 'K' }

function App() {
  const [page, setPage] = useState<Page>('Calendar')
  const [view, setView] = useState<View>('Month')
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 7, 20))
  const [events, setEvents] = useState(initialEvents)
  const [modalOpen, setModalOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

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
              <Icon size={18} /><span>{label}</span>{label === 'Integrations' && <span className="nav-count">3</span>}
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
            <div className="avatar">AK</div>
            <div><strong>Alex Karaman</strong><span>Administrator</span></div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>
      {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}

      <main>
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
          <div className="search"><Search size={17} /><input aria-label="Search" placeholder="Search events, people..." /><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            <div className="weather"><CloudSun size={20} /><div><b>74°</b><span>Sunny</span></div></div>
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
          />
        )}
        {page === 'Overview' && <OverviewPage events={events} openModal={() => setModalOpen(true)} />}
        {page === 'Integrations' && <IntegrationsPage />}
        {page === 'Family' && <FamilyPage />}
        {page === 'Settings' && <SettingsPage />}
      </main>

      <button className="chat-fab" onClick={() => setChatOpen(true)} aria-label="Open AI planner"><Sparkles size={20} /></button>
      {chatOpen && <AssistantPanel close={() => setChatOpen(false)} openModal={() => { setChatOpen(false); setModalOpen(true) }} />}
      {modalOpen && (
        <EventModal
          selectedDate={selectedDate}
          close={() => setModalOpen(false)}
          save={(event) => { setEvents((current) => [...current, { ...event, id: Date.now() }]); setModalOpen(false) }}
        />
      )}
    </div>
  )
}

function CalendarPage({ events, view, setView, selectedDate, setSelectedDate, dateTitle, moveDate, openChat }: {
  events: EventItem[]; view: View; setView: (v: View) => void; selectedDate: Date
  setSelectedDate: (d: Date) => void; dateTitle: string; moveDate: (n: number) => void; openChat: () => void
}) {
  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Thursday, August 20</p><h1>Good afternoon, Alex</h1><p>Here’s what’s happening with your family.</p></div>
        <button className="ai-plan-btn" onClick={openChat}><Sparkles size={17} />Plan with AI</button>
      </div>
      <section className="calendar-card">
        <div className="calendar-toolbar">
          <div className="date-navigation">
            <button className="today-btn" onClick={() => setSelectedDate(new Date(2026, 7, 20))}>Today</button>
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
          <span><i className="dot family" />Family</span><span><i className="dot alex" />Alex</span><span><i className="dot maya" />Maya</span>
        </div>
        <span>Synced 2 minutes ago</span>
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
            <button key={day.toISOString()} className={`day-cell ${!isSameMonth(day, selectedDate) ? 'muted' : ''} ${isSameDay(day, new Date(2026, 7, 20)) ? 'today' : ''}`} onClick={() => onSelect(day)}>
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
  return (
    <div className="week-view">
      <div className="week-head"><div />{days.map((day) => <div className={isSameDay(day, new Date(2026, 7, 20)) ? 'current' : ''} key={day.toISOString()}><span>{format(day, 'EEE')}</span><b>{format(day, 'd')}</b></div>)}</div>
      <div className="week-body">
        <div className="times">{['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'].map((t) => <span key={t}>{t}</span>)}</div>
        {days.map((day) => <div className="week-column" key={day.toISOString()}>{events.filter((e) => isSameDay(e.date, day)).map((e, i) => <div className={`week-event ${e.color}`} style={{ top: `${18 + i * 26}%` }} key={e.id}><b>{e.title}</b><span>{e.start}</span></div>)}</div>)}
      </div>
    </div>
  )
}

function DayView({ events, selectedDate }: { events: EventItem[]; selectedDate: Date }) {
  const dayEvents = events.filter((e) => isSameDay(e.date, selectedDate))
  return (
    <div className="day-view">
      <div className="day-timeline">
        {['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM', '8:00 PM'].map((time) => <div className="time-row" key={time}><span>{time}</span><i /></div>)}
      </div>
      <div className="day-events">
        {dayEvents.map((event, i) => <div className={`large-event ${event.color}`} key={event.id} style={{ top: `${24 + i * 115}px` }}><span>{event.start}{event.end ? ` – ${event.end}` : ''}</span><b>{event.title}</b><small>{event.calendar}{event.location ? ` · ${event.location}` : ''}</small></div>)}
        {!dayEvents.length && <div className="empty-day"><CalendarDays size={28} /><b>No plans yet</b><span>Enjoy the open space in your day.</span></div>}
      </div>
    </div>
  )
}

function YearView({ events, selectedDate, onSelect }: { events: EventItem[]; selectedDate: Date; onSelect: (d: Date) => void }) {
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => {
    const first = new Date(selectedDate.getFullYear(), month, 1)
    const offset = (first.getDay() + 6) % 7
    const days = new Date(selectedDate.getFullYear(), month + 1, 0).getDate()
    return <button className="mini-month" key={month} onClick={() => onSelect(first)}><h3>{format(first, 'MMMM')}</h3><div className="mini-weekdays">{['M','T','W','T','F','S','S'].map((d, i) => <span key={`${d}${i}`}>{d}</span>)}</div><div className="mini-days">{Array.from({ length: offset }, (_, i) => <i key={`x${i}`} />)}{Array.from({ length: days }, (_, i) => { const date = new Date(selectedDate.getFullYear(), month, i + 1); return <span key={i} className={`${isSameDay(date, new Date(2026,7,20)) ? 'today' : ''} ${events.some((e) => isSameDay(e.date, date)) ? 'has-event' : ''}`}>{i + 1}</span> })}</div></button>
  })}</div>
}

function OverviewPage({ events, openModal }: { events: EventItem[]; openModal: () => void }) {
  return <div className="page overview-page">
    <div className="page-heading"><div><p className="eyebrow">Family command center</p><h1>Overview</h1><p>Everything important, all in one place.</p></div><button className="add-btn" onClick={openModal}><Plus size={18} />Add event</button></div>
    <div className="stat-grid">
      <div className="stat-card coral-stat"><div><span>This week</span><b>12</b><small>events scheduled</small></div><CalendarDays /></div>
      <div className="stat-card blue-stat"><div><span>Time together</span><b>8.5h</b><small>family time planned</small></div><Users /></div>
      <div className="stat-card green-stat"><div><span>All synced</span><b>3</b><small>connected calendars</small></div><Check /></div>
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-title"><div><h2>Coming up</h2><p>Your next family moments</p></div><button>View calendar <ChevronRight size={15} /></button></div>
        <div className="agenda-list">{events.slice(0,5).map((e) => <div className="agenda-item" key={e.id}><div className="agenda-date"><b>{format(e.date, 'd')}</b><span>{format(e.date, 'MMM')}</span></div><i className={e.color}/><div className="agenda-info"><b>{e.title}</b><span><Clock3 size={13} />{e.start}{e.location && <><MapPin size={13} />{e.location}</>}</span></div><div className={`tiny-avatar ${e.calendar.toLowerCase()}`}>{avatars[e.calendar]}</div></div>)}</div>
      </section>
      <section className="panel insight-panel"><div className="sparkle-orb"><Sparkles /></div><p className="eyebrow">Weekly insight</p><h2>Your weekend is filling up</h2><p>You have three family activities on Saturday. Sunday afternoon is still free — a good spot for some downtime.</p><button>Find open time <ChevronRight size={15} /></button><div className="insight-bars"><i/><i/><i/><i/><i/><i/><i/></div></section>
    </div>
  </div>
}

function IntegrationsPage() {
  const [connected, setConnected] = useState(['Google Calendar', 'Weather'])
  const integrations = [
    { name: 'Google Calendar', copy: 'Sync personal and shared calendars in real time.', icon: 'G', className: 'google' },
    { name: 'Apple Calendar', copy: 'Bring your iCloud calendars into one view.', icon: '●', className: 'apple' },
    { name: 'Weather', copy: 'See the forecast alongside outdoor plans.', icon: '☀', className: 'weather-icon' },
    { name: 'School Calendar', copy: 'Import term dates, holidays, and school events.', icon: 'S', className: 'school' },
  ]
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Admin dashboard</p><h1>Integrations</h1><p>Connect the services your family already uses.</p></div></div>
    <div className="integration-notice"><div><Sparkles size={19}/><span><b>Everything in one place</b> Connected calendars update automatically every few minutes.</span></div><button>Learn more</button></div>
    <div className="integration-grid">{integrations.map((item) => {
      const isConnected = connected.includes(item.name)
      return <div className="integration-card" key={item.name}><div className={`integration-icon ${item.className}`}>{item.icon}</div><div className="integration-copy"><h3>{item.name}</h3><p>{item.copy}</p></div><div className="integration-action">{isConnected ? <><span className="connected"><Check size={13}/>Connected</span><button className="square-btn"><Settings size={16}/></button></> : <button className="connect-btn" onClick={() => setConnected([...connected, item.name])}>Connect</button>}</div></div>
    })}</div>
    <section className="panel sync-panel"><div className="panel-title"><div><h2>Sync activity</h2><p>Recent updates from connected services</p></div><button className="filter-btn">Manage sync</button></div>
      <div className="sync-row"><div className="integration-icon google">G</div><div><b>Google Calendar</b><span>6 events updated</span></div><small>2 minutes ago</small><span className="connected"><Check size={13}/>Successful</span></div>
      <div className="sync-row"><div className="integration-icon weather-icon">☀</div><div><b>Weather</b><span>7-day forecast refreshed</span></div><small>18 minutes ago</small><span className="connected"><Check size={13}/>Successful</span></div>
    </section>
  </div>
}

function FamilyPage() {
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">Your household</p><h1>Family members</h1><p>Manage people, calendars, and access.</p></div><button className="add-btn"><Plus size={18}/>Invite member</button></div>
    <div className="family-grid">
      {[['AK','Alex Karaman','alex@karaman.family','Administrator','blue'],['MK','Maya Karaman','maya@karaman.family','Parent','coral'],['LK','Leo Karaman','Child profile','View only','green']].map(([initials,name,email,role,color]) => <div className="member-card" key={name}><div className={`member-avatar ${color}`}>{initials}</div><h3>{name}</h3><p>{email}</p><span>{role}</span><div className="member-divider"/><div className="member-meta"><span><i className={`dot ${color}`}/>Calendar visible</span><button><MoreHorizontal size={18}/></button></div></div>)}
      <button className="invite-card"><div><Plus size={23}/></div><b>Add family member</b><span>Invite someone to your shared calendar</span></button>
    </div>
  </div>
}

function SettingsPage() {
  const [weekends, setWeekends] = useState(true)
  const [emails, setEmails] = useState(false)
  return <div className="page settings-page"><div className="page-heading"><div><p className="eyebrow">Preferences</p><h1>Settings</h1><p>Make the calendar work the way your family does.</p></div></div>
    <section className="settings-panel"><div className="settings-nav"><button className="active">General</button><button>Notifications</button><button>Privacy</button><button>Account</button></div><div className="settings-content"><h2>Calendar preferences</h2><p>Choose how dates and events appear for everyone.</p>
      <label><span><b>Default calendar view</b><small>The view you see when opening the app</small></span><select defaultValue="Month"><option>Day</option><option>Week</option><option>Month</option><option>Year</option></select></label>
      <label><span><b>Week starts on</b><small>Used across all calendar views</small></span><select defaultValue="Monday"><option>Monday</option><option>Sunday</option></select></label>
      <label><span><b>Show weekends</b><small>Include Saturday and Sunday in week view</small></span><button className={`toggle ${weekends ? 'on' : ''}`} onClick={() => setWeekends(!weekends)}><i/></button></label>
      <label><span><b>Daily agenda email</b><small>Receive a summary each morning at 7:00 AM</small></span><button className={`toggle ${emails ? 'on' : ''}`} onClick={() => setEmails(!emails)}><i/></button></label>
    </div></section>
  </div>
}

function AssistantPanel({ close, openModal }: { close: () => void; openModal: () => void }) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  return <div className="assistant-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}><aside className="assistant-panel">
    <div className="assistant-header"><div className="assistant-symbol"><Sparkles size={19}/></div><div><b>Family planner</b><span>Powered by AI</span></div><button onClick={close}><X size={20}/></button></div>
    <div className="assistant-body">
      <div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div><p>Hi Alex! Tell me what you’d like to add. You can write naturally — I’ll organize the details for you.</p><span>Try something like:</span><button onClick={() => setText('Swimming lessons every Tuesday at 4pm for the next 6 weeks')}>“Swimming lessons every Tuesday at 4pm for the next 6 weeks”</button></div></div>
      {submitted && <><div className="user-message">{text || 'Dinner with Maya tomorrow at 7:30pm'}</div><div className="ai-message"><div className="assistant-symbol small"><Sparkles size={14}/></div><div><p>I found everything I need. Here’s the event I’ll create:</p><div className="parsed-event"><div className="parsed-date"><b>21</b><span>AUG</span></div><div><b>Dinner with Maya</b><span><Clock3 size={13}/>7:30 PM · Family calendar</span></div></div><div className="chat-actions"><button onClick={openModal}>Review details</button><button className="confirm-chat"><Check size={15}/>Add event</button></div></div></div></>}
    </div>
    <div className="assistant-input"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe an event or ask about your schedule..." /><div><span>AI can make mistakes. Review details before saving.</span><button disabled={!text.trim()} onClick={() => setSubmitted(true)}><ChevronRight size={19}/></button></div></div>
  </aside></div>
}

function EventModal({ selectedDate, close, save }: { selectedDate: Date; close: () => void; save: (e: Omit<EventItem, 'id'>) => void }) {
  const [title, setTitle] = useState('')
  const [calendar, setCalendar] = useState<EventItem['calendar']>('Family')
  const [date, setDate] = useState(format(selectedDate, 'yyyy-MM-dd'))
  const [time, setTime] = useState('09:00')
  const [location, setLocation] = useState('')
  return <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}><form className="event-modal" onSubmit={(e) => { e.preventDefault(); save({ title: title || 'Untitled event', date: new Date(`${date}T12:00:00`), start: format(new Date(`2026-01-01T${time}`), 'h:mm a'), calendar, location, color: calendar === 'Alex' ? 'blue' : calendar === 'Maya' ? 'coral' : 'green' }) }}>
    <div className="modal-heading"><div><p className="eyebrow">New event</p><h2>Add to your calendar</h2></div><button type="button" onClick={close}><X size={20}/></button></div>
    <label className="field"><span>Event title</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What’s happening?" /></label>
    <div className="field-row"><label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)}/></label><label className="field"><span>Start time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)}/></label></div>
    <label className="field"><span>Calendar</span><select value={calendar} onChange={(e) => setCalendar(e.target.value as EventItem['calendar'])}><option>Family</option><option>Alex</option><option>Maya</option></select></label>
    <label className="field"><span>Location <small>optional</small></span><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" /></label>
    <div className="modal-tip"><Sparkles size={16}/><span>Tip: you can also ask the AI planner to create repeating or multi-part events.</span></div>
    <div className="modal-actions"><button type="button" onClick={close}>Cancel</button><button className="save-event" type="submit">Add event</button></div>
  </form></div>
}

export default App
