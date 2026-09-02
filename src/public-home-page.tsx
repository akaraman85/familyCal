import { useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import {
  APP_DESCRIPTION,
  APP_PUBLIC_NAME,
  APP_SUPPORT_EMAIL,
} from './branding'

export function PublicHomePage() {
  useEffect(() => {
    const previous = document.title
    document.title = APP_PUBLIC_NAME
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <main className="public-home-page">
      <article className="public-home-card">
        <div className="brand-mark public-home-mark" aria-hidden="true">
          <CalendarDays size={22} />
        </div>
        <p className="eyebrow">Private household calendar</p>
        <h1>{APP_PUBLIC_NAME}</h1>
        <p>{APP_DESCRIPTION}</p>
        <p>
          Family Calendar lets a single household view shared events, connect Google Calendars
          read-only, and plan with AI. Sign in to access calendars, integrations, and saved events.
        </p>
        <p className="public-home-actions">
          <a className="public-home-signin" href="/login">Sign in</a>
        </p>
        <p className="public-home-links">
          <a href="/privacy">Privacy policy</a>
          <span aria-hidden="true"> · </span>
          <a href="/terms">Terms of service</a>
        </p>
        <p className="public-home-contact">
          Support: <a href={`mailto:${APP_SUPPORT_EMAIL}`}>{APP_SUPPORT_EMAIL}</a>
        </p>
      </article>
    </main>
  )
}
