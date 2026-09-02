import { useEffect } from 'react'
import {
  CalendarDays,
  CalendarRange,
  Sparkles,
  Users,
} from 'lucide-react'
import {
  APP_DESCRIPTION,
  APP_PUBLIC_NAME,
  APP_SHORT_NAME,
  APP_SUPPORT_EMAIL,
} from './branding'

const FEATURE_STATS = [
  { icon: CalendarRange, value: 'Google sync', label: 'Read-only calendar import' },
  { icon: Users, value: 'Family sharing', label: 'One household dashboard' },
  { icon: Sparkles, value: 'AI planning', label: 'Smart event suggestions' },
] as const

export function PublicHomePage() {
  useEffect(() => {
    const previous = document.title
    document.title = APP_PUBLIC_NAME
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="public-home-shell">
      <header className="public-home-header">
        <a className="public-home-logo" href="/" aria-label={APP_PUBLIC_NAME}>
          <span className="public-home-logo-mark" aria-hidden="true">
            <CalendarDays size={18} />
          </span>
          <span className="public-home-logo-text">
            <strong>{APP_SHORT_NAME}</strong>
            <span>Calendar</span>
          </span>
        </a>
        <nav className="public-home-nav" aria-label="Site">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href={`mailto:${APP_SUPPORT_EMAIL}`}>Contact</a>
        </nav>
        <a className="public-home-header-login" href="/login">Sign in</a>
      </header>

      <main className="public-home-hero">
        <section className="public-home-copy">
          <p className="public-home-eyebrow">Private household calendar</p>
          <h1>
            Family calendar
            <span> dashboard</span>
          </h1>
          <p className="public-home-lead">{APP_DESCRIPTION}</p>
          <p className="public-home-body">
            View shared events, connect Google Calendars read-only, and plan together with AI.
            Sign in to access calendars, integrations, and saved events.
          </p>
          <div className="public-home-cta-row">
            <a className="public-home-signin" href="/login">Sign in</a>
            <a className="public-home-secondary-link" href="/login">I have an account</a>
          </div>
        </section>

        <aside className="public-home-visual">
          <div className="public-home-visual-frame">
            <div className="public-home-calendar-preview" aria-hidden="true">
              <div className="public-home-calendar-toolbar">
                <span>March 2026</span>
                <span className="public-home-calendar-pill">Week view</span>
              </div>
              <div className="public-home-calendar-grid">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <span key={day} className="public-home-calendar-day-label">{day}</span>
                ))}
                {Array.from({ length: 28 }, (_, index) => (
                  <span
                    key={index}
                    className={[
                      'public-home-calendar-day',
                      index === 10 ? 'is-today' : '',
                      index === 4 || index === 11 || index === 18 ? 'has-event' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
            </div>
            <div className="public-home-stats">
              {FEATURE_STATS.map((stat, index) => {
                const Icon = stat.icon
                return (
                  <div key={stat.value} className="public-home-stat">
                    <Icon size={18} />
                    <div>
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                    {index < FEATURE_STATS.length - 1 && (
                      <span className="public-home-stat-divider" />
                    )}
                  </div>
                )
              })}
            </div>
            <p className="public-home-visual-caption">
              Need help getting started?
              {' '}
              <a href={`mailto:${APP_SUPPORT_EMAIL}`}>Contact support</a>
            </p>
          </div>
        </aside>
      </main>

      <footer className="public-home-footer">
        <p>
          This page is public. Sign in is only required to view calendars and saved household data.
        </p>
        <nav aria-label="Legal">
          <a href="/privacy">Privacy policy</a>
          <span aria-hidden="true"> · </span>
          <a href="/terms">Terms of service</a>
          <span aria-hidden="true"> · </span>
          <a href={`mailto:${APP_SUPPORT_EMAIL}`}>Contact</a>
        </nav>
      </footer>
    </div>
  )
}
