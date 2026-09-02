import {
  APP_DESCRIPTION,
  APP_PUBLIC_NAME,
  APP_SHORT_NAME,
  APP_SUPPORT_EMAIL,
} from './branding'

export function renderPublicHomeFallback() {
  return `<div class="public-home-shell">
    <header class="public-home-header">
      <a class="public-home-logo" href="/" aria-label="${APP_PUBLIC_NAME}">
        <span class="public-home-logo-mark" aria-hidden="true">FC</span>
        <span class="public-home-logo-text"><strong>${APP_SHORT_NAME}</strong><span>Calendar</span></span>
      </a>
      <nav class="public-home-nav" aria-label="Site">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="mailto:${APP_SUPPORT_EMAIL}">Contact</a>
      </nav>
      <a class="public-home-header-login" href="/login">Sign in</a>
    </header>
    <main class="public-home-hero">
      <section class="public-home-copy">
        <p class="public-home-eyebrow">Private household calendar</p>
        <h1>Family calendar <span>dashboard</span></h1>
        <p class="public-home-lead">${APP_DESCRIPTION}</p>
        <p class="public-home-body">View shared events, connect Google Calendars read-only, and plan together with AI. Sign in to access calendars, integrations, and saved events.</p>
        <div class="public-home-cta-row">
          <a class="public-home-signin" href="/login">Sign in</a>
          <a class="public-home-secondary-link" href="/login">I have an account</a>
        </div>
      </section>
    </main>
    <footer class="public-home-footer">
      <p>This page is public. Sign in is only required to view calendars and saved household data.</p>
      <nav aria-label="Legal">
        <a href="/privacy">Privacy policy</a>
        <span aria-hidden="true"> · </span>
        <a href="/terms">Terms of service</a>
        <span aria-hidden="true"> · </span>
        <a href="mailto:${APP_SUPPORT_EMAIL}">Contact</a>
      </nav>
    </footer>
  </div>`
}

export const PUBLIC_HOME_FALLBACK_MARKERS = {
  appName: APP_PUBLIC_NAME,
  description: APP_DESCRIPTION,
  privacyHref: '/privacy',
  termsHref: '/terms',
  supportEmail: APP_SUPPORT_EMAIL,
} as const
