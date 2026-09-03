import { LEGAL_CONTACT_EMAIL, type LegalSection, renderLegalHtml } from './legal'
import { APP_INTERNAL_NAME, APP_PUBLIC_NAME } from './branding'

export const PRIVACY_CONTACT_EMAIL = LEGAL_CONTACT_EMAIL
export const PRIVACY_UPDATED = 'September 3, 2026'

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
      'Calendars, family data, and Google connections require a household administrator login or a time-limited guest invite link. Those sessions are kept in an HTTP-only cookie for up to 12 hours, or until a guest invite expires or is revoked. This privacy policy is public and does not require that login.',
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
      'Family events, family members, guest invite records, and preferences (calendar views and AI Planner settings) are stored in Postgres for this single-family deployment.',
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
    heading: 'Sharing, transfer, and disclosure of Google user data',
    paragraphs: [
      'Google user data is shared only with the service providers and parties listed below, and only as needed to operate this household calendar. We do not sell Google user data. We do not share it with advertisers, data brokers, or unrelated third parties.',
      'Google: OAuth sign-in and read-only Calendar API calls to fetch events for display.',
      'Neon (Postgres hosting): encrypted Google OAuth tokens, a short-lived server-side cache of Google events, and other household calendar data are stored in a managed Postgres database.',
      'Vercel (application hosting): the app and its API routes run on Vercel infrastructure. Google user data passes through these servers only to provide calendar features.',
      'Vercel AI Gateway (optional AI Planner): when an authenticated user submits a planning request, scheduling text and any attached calendar screenshots may be sent to the selected model through Vercel AI Gateway for that request only.',
      'Household members: anyone who signs in with the household administrator login can view Google events displayed on the dashboard.',
      'Invited guests: a household administrator can create a time-limited, revocable link for a friend. Guests see only busy times for the family-member calendars the administrator selected. Event titles, descriptions, locations, attendees, and conference links are removed on the server before the calendar is shown. Guests cannot create, change, or delete events, and they cannot open integrations, family settings, or the AI Planner.',
    ],
  },
  {
    heading: 'Data protection for sensitive data',
    paragraphs: [
      'All traffic between your browser and this app uses HTTPS (TLS) in transit.',
      'Google OAuth access and refresh tokens are encrypted at rest with AES-256-GCM before storage in Postgres. The browser never receives those provider credentials.',
      'Web Push subscription keys, when enabled, are also encrypted at rest with AES-256-GCM.',
      'Household and guest sessions use an HTTP-only, signed cookie with a 12-hour lifetime. Guest access is also checked against the stored invite on each request so it can be revoked immediately. Calendar and integration APIs require a valid session.',
      'Google Calendar access is read-only. Disconnecting a Google account revokes the grant and deletes stored encrypted credentials and cached events for that account.',
    ],
  },
  {
    heading: 'Limited use of Google user data',
    paragraphs: [
      'The use of raw or derived user data received from Google APIs will adhere to the Google User Data Policy, including the Limited Use requirements.',
      'Google user data is used only to provide or improve user-facing calendar and planning features in this app. It is not used to create, train, or improve generalized or foundational AI or machine learning models.',
    ],
  },
  {
    heading: 'Selling and advertising',
    paragraphs: [
      'We do not sell Google user data or other household data. We do not use it for advertising.',
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
