import { LEGAL_CONTACT_EMAIL, type LegalSection, renderLegalHtml } from './legal'
import { APP_INTERNAL_NAME, APP_PUBLIC_NAME } from './branding'

export const TERMS_CONTACT_EMAIL = LEGAL_CONTACT_EMAIL
export const TERMS_UPDATED = 'September 3, 2026'

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'Who this is for',
    paragraphs: [
      `${APP_PUBLIC_NAME} (also known as ${APP_INTERNAL_NAME}) is a private household calendar dashboard for a single family. It is not a multi-tenant public product.`,
    ],
  },
  {
    heading: 'Access',
    paragraphs: [
      'The household administrator signs in with the shared household login. Friends may be given a separate, time-limited guest link that can be revoked at any time. Signing in means you accept these terms.',
      'The household is responsible for who they invite, which family-member calendars a guest can see as busy time, and which Google accounts they connect.',
    ],
  },
  {
    heading: 'Google Calendar',
    paragraphs: [
      'Google Calendar is connected read-only. The app displays Google events on the household dashboard. It does not create, change, or delete events on Google.',
    ],
  },
  {
    heading: 'What is stored',
    paragraphs: [
      'Family events, family members, guest invite records, preferences, encrypted Google tokens, and optional encrypted web-push subscriptions are stored in Postgres for this deployment.',
    ],
  },
  {
    heading: 'AI Planner',
    paragraphs: [
      'When someone who is signed in submits a planning request, scheduling text and calendar screenshots may be sent to a model through Vercel AI Gateway. That happens only for that request.',
    ],
  },
  {
    heading: 'Cost and data',
    paragraphs: [
      'There is no paid subscription in the current product. We do not sell household data.',
    ],
  },
  {
    heading: 'Disconnecting Google',
    paragraphs: [
      'Disconnecting a Google account revokes the Google grant and deletes the stored Google credentials for that account.',
    ],
  },
  {
    heading: 'No warranty',
    paragraphs: [
      'The app is provided as-is for personal family use. There is no warranty that it will always be available, accurate, or free of defects.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      `Questions about these terms: ${TERMS_CONTACT_EMAIL}.`,
    ],
  },
]

export function isPublicTermsPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/terms' || path === '/terms.html'
}

export function renderTermsHtml() {
  return renderLegalHtml({
    title: `Terms of service · ${APP_PUBLIC_NAME}`,
    description: `Terms of service for ${APP_PUBLIC_NAME}, a private household calendar dashboard.`,
    heading: 'Terms of service',
    updated: TERMS_UPDATED,
    sections: TERMS_SECTIONS,
    otherHref: '/privacy',
    otherLabel: 'Privacy policy',
  })
}
