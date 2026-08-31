import { LEGAL_CONTACT_EMAIL, type LegalSection, renderLegalHtml } from './legal'
import { APP_INTERNAL_NAME, APP_PUBLIC_NAME } from './branding'

export const PRIVACY_CONTACT_EMAIL = LEGAL_CONTACT_EMAIL
export const PRIVACY_UPDATED = 'August 28, 2026'

export type PrivacySection = LegalSection

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    heading: 'Who this is for',
    paragraphs: [
      `${APP_PUBLIC_NAME} (also known as ${APP_INTERNAL_NAME}) is a private household calendar dashboard for a single family. It is not a public or multi-family product.`,
    ],
  },
  {
    heading: 'Sign-in',
    paragraphs: [
      'Calendars, family data, and Google connections require a shared household login. That session is kept in an HTTP-only cookie for 12 hours. This privacy policy is public and does not require that login.',
    ],
  },
  {
    heading: 'Google Calendar',
    paragraphs: [
      'Connecting Google Calendar requests only openid, email, profile, and read-only Calendar access (https://www.googleapis.com/auth/calendar.readonly). The app cannot create, change, or delete Google events.',
      'Google events are displayed on the household dashboard. They are not imported as family events.',
    ],
  },
  {
    heading: 'Where Google credentials are stored',
    paragraphs: [
      'Google access and refresh tokens are encrypted with AES-256-GCM and stored in Postgres. The browser never receives those provider credentials. It only receives the event details needed to draw the calendar.',
      'A short server-side cache of Google events may be kept so the calendar loads quickly. That cache is not an import into the family calendar, and it is deleted when the Google account is disconnected.',
    ],
  },
  {
    heading: 'Household data',
    paragraphs: [
      'Family events, family members, and preferences (calendar views and AI Planner settings) are stored in Postgres for this single-family deployment.',
    ],
  },
  {
    heading: 'Notifications',
    paragraphs: [
      'If Web Push reminders are enabled on an installed device, the push subscription is stored encrypted in Postgres.',
    ],
  },
  {
    heading: 'AI Planner',
    paragraphs: [
      'When an authenticated user submits a planning request, scheduling text and any attached calendar screenshots may be sent to the selected model through Vercel AI Gateway. That happens only for that request. The planner does not save events until the user confirms the proposals.',
    ],
  },
  {
    heading: 'Selling and sharing',
    paragraphs: [
      'We do not sell this data. We do not use it for advertising.',
    ],
  },
  {
    heading: 'Disconnecting Google',
    paragraphs: [
      'Disconnecting a Google account revokes the Google grant and deletes the stored encrypted credentials for that account.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      `Questions about this policy: ${PRIVACY_CONTACT_EMAIL}.`,
    ],
  },
]

export function isPublicPrivacyPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/privacy' || path === '/privacy.html'
}

export function renderPrivacyHtml() {
  return renderLegalHtml({
    title: `Privacy policy · ${APP_PUBLIC_NAME}`,
    description: `Privacy policy for ${APP_PUBLIC_NAME}, a private household calendar dashboard.`,
    heading: 'Privacy policy',
    updated: PRIVACY_UPDATED,
    sections: PRIVACY_SECTIONS,
    otherHref: '/terms',
    otherLabel: 'Terms of service',
  })
}
