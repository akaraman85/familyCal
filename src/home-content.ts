import {
  APP_DESCRIPTION,
  APP_PUBLIC_NAME,
  APP_SUPPORT_EMAIL,
} from './branding'

export function renderPublicHomeFallback() {
  return `<main class="public-home-fallback" aria-label="${APP_PUBLIC_NAME}">
    <div class="public-home-card">
      <div class="public-home-mark" aria-hidden="true">FC</div>
      <p class="public-home-eyebrow">Private household calendar</p>
      <h1>${APP_PUBLIC_NAME}</h1>
      <p>${APP_DESCRIPTION}</p>
      <p>Family Calendar lets a single household view shared events, connect Google Calendars read-only, and plan with AI. Sign in to access calendars, integrations, and saved events.</p>
      <p class="public-home-links">
        <a href="/privacy">Privacy policy</a>
        <span aria-hidden="true"> · </span>
        <a href="/terms">Terms of service</a>
      </p>
      <p class="public-home-contact">Support: <a href="mailto:${APP_SUPPORT_EMAIL}">${APP_SUPPORT_EMAIL}</a></p>
    </div>
  </main>`
}

export const PUBLIC_HOME_FALLBACK_MARKERS = {
  appName: APP_PUBLIC_NAME,
  description: APP_DESCRIPTION,
  privacyHref: '/privacy',
  termsHref: '/terms',
  supportEmail: APP_SUPPORT_EMAIL,
} as const
