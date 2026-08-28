import { decryptJson, encryptJson } from '../crypto.js'
import {
  updateEncryptedCredentials,
  type IntegrationAccountRow,
  type StoredCredentials,
} from '../db.js'
import type { CalendarEvent } from '../events.js'

const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USER_INFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'

export const GOOGLE_CALENDAR_PROVIDER_ID = 'google-calendar'
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
]
export const GOOGLE_CALENDAR_READ_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly'

export function hasGoogleCalendarReadScope(scopes: string[]) {
  return scopes.includes(GOOGLE_CALENDAR_READ_SCOPE)
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

export class GoogleAuthRevokedError extends Error {
  readonly code = 'google_auth_revoked' as const

  constructor() {
    super('Google Calendar access was revoked. Reconnect the account.')
    this.name = 'GoogleAuthRevokedError'
  }
}

export function isRevokedGoogleGrant(
  error?: string | null,
  description?: string | null,
) {
  const code = (error ?? '').toLowerCase()
  const text = (description ?? '').toLowerCase()
  return (
    code === 'invalid_grant'
    || text.includes('invalid_grant')
    || text.includes('expired or revoked')
    || text.includes('token has been expired')
    || /\brevoked\b/.test(text)
  )
}

export function isGoogleAuthRevokedError(error: unknown): error is GoogleAuthRevokedError {
  if (error instanceof GoogleAuthRevokedError) return true
  if (!(error instanceof Error)) return false
  if (error.name === 'GoogleAuthRevokedError') return true
  return isRevokedGoogleGrant(undefined, error.message)
}

export function parseGoogleTokenResponse(token: GoogleTokenResponse, responseOk: boolean) {
  if (
    responseOk
    && !token.error
    && token.access_token
    && token.expires_in
  ) {
    return token
  }
  if (isRevokedGoogleGrant(token.error, token.error_description)) {
    throw new GoogleAuthRevokedError()
  }
  throw new Error(token.error_description || token.error || 'Google token exchange failed')
}

export type GoogleUserInfo = {
  sub: string
  email?: string
  name?: string
}

export type GoogleCalendarListItem = {
  id: string
  summary: string
  primary?: boolean
  accessRole: string
  backgroundColor?: string
}

type GoogleCalendarList = {
  items?: GoogleCalendarListItem[]
  nextPageToken?: string
}

type GoogleEventList = {
  items?: Array<{
    id: string
    status?: string
    summary?: string
    description?: string
    htmlLink?: string
    location?: string
    organizer?: {
      email?: string
      displayName?: string
      self?: boolean
    }
    start?: { date?: string; dateTime?: string }
    end?: { date?: string; dateTime?: string }
  }>
  nextPageToken?: string
}

type GoogleProviderConfig = {
  appUrl: string
  clientId: string
  clientSecret: string
}

export function googleRedirectUri(appUrl: string) {
  return `${appUrl}/api/integrations/google/callback`
}

export function buildGoogleAuthorizationUrl(config: GoogleProviderConfig, state: string) {
  const url = new URL(AUTHORIZATION_URL)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: googleRedirectUri(config.appUrl),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'select_account consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    state,
  }).toString()
  return url.toString()
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const token = await response.json() as GoogleTokenResponse
  return parseGoogleTokenResponse(token, response.ok)
}

export async function exchangeGoogleCode(config: GoogleProviderConfig, code: string) {
  return tokenRequest(new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: googleRedirectUri(config.appUrl),
    grant_type: 'authorization_code',
  }))
}

export function credentialsFromGoogleToken(
  token: GoogleTokenResponse,
  existingRefreshToken?: string,
): StoredCredentials {
  const refreshToken = token.refresh_token || existingRefreshToken
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token; reconnect and grant offline access')
  }
  return {
    accessToken: token.access_token!,
    refreshToken,
    expiresAt: Date.now() + token.expires_in! * 1000,
    tokenType: token.token_type || 'Bearer',
  }
}

export async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch(USER_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('Unable to read the connected Google account')
  return response.json() as Promise<GoogleUserInfo>
}

export async function getGoogleAccessToken(config: {
  databaseUrl: string
  encryptionKey: string
  clientId: string
  clientSecret: string
}, account: IntegrationAccountRow) {
  const credentials = decryptJson<StoredCredentials>(
    account.encrypted_credentials,
    config.encryptionKey,
  )
  if (credentials.expiresAt > Date.now() + 60_000) return credentials.accessToken
  if (!credentials.refreshToken) throw new GoogleAuthRevokedError()

  const token = await tokenRequest(new URLSearchParams({
    refresh_token: credentials.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  }))
  const refreshed = credentialsFromGoogleToken(token, credentials.refreshToken)
  await updateEncryptedCredentials(
    config.databaseUrl,
    account.owner_id,
    GOOGLE_CALENDAR_PROVIDER_ID,
    account.external_account_id,
    encryptJson(refreshed, config.encryptionKey),
  )
  return refreshed.accessToken
}

export async function listGoogleCalendars(accessToken: string) {
  const calendars: GoogleCalendarList['items'] = []
  let pageToken: string | undefined

  do {
    const url = new URL(CALENDAR_LIST_URL)
    url.searchParams.set('maxResults', '250')
    url.searchParams.set('minAccessRole', 'reader')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 401) throw new GoogleAuthRevokedError()
    if (!response.ok) throw new Error('Unable to read Google calendars')
    const page = await response.json() as GoogleCalendarList
    calendars.push(...(page.items ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)

  return calendars
}

export function googleCalendarType(calendar: GoogleCalendarListItem) {
  if (calendar.primary) return 'primary' as const
  if (calendar.accessRole === 'owner') return 'owner' as const
  if (
    calendar.accessRole === 'writer'
    || calendar.accessRole === 'writerWithoutPrivateAccess'
  ) {
    return 'editable' as const
  }
  return 'read-only' as const
}

function safeGoogleCalendarUrl(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.google.com')
      ? url.toString()
      : null
  } catch {
    return null
  }
}

async function listGoogleCalendarEvents(
  accessToken: string,
  calendar: GoogleCalendarListItem,
  timeMin: Date,
  timeMax: Date,
  account: IntegrationAccountRow,
) {
  const events: CalendarEvent[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
    )
    url.searchParams.set('timeMin', timeMin.toISOString())
    url.searchParams.set('timeMax', timeMax.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '2500')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 401) throw new GoogleAuthRevokedError()
    if (!response.ok) {
      throw new Error(`Unable to read events from ${calendar.summary}`)
    }
    const page = await response.json() as GoogleEventList
    for (const event of page.items ?? []) {
      const startAt = event.start?.dateTime ?? event.start?.date
      if (!startAt || event.status === 'cancelled') continue
      events.push({
        id: `google:${calendar.id}:${event.id}`,
        title: event.summary || 'Untitled event',
        startAt,
        endAt: event.end?.dateTime ?? event.end?.date ?? null,
        allDay: Boolean(event.start?.date && !event.start?.dateTime),
        calendar: calendar.summary,
        location: event.location ?? null,
        description: event.description?.slice(0, 10_000) ?? null,
        externalUrl: safeGoogleCalendarUrl(event.htmlLink),
        organizer: event.organizer ? {
          email: event.organizer.email ?? null,
          displayName: event.organizer.displayName ?? null,
          self: event.organizer.self ?? false,
        } : null,
        source: 'google',
        google: {
          calendar: {
            id: calendar.id,
            name: calendar.summary,
            primary: calendar.primary ?? false,
            type: googleCalendarType(calendar),
            accessRole: calendar.accessRole,
            color: calendar.backgroundColor ?? null,
          },
          accounts: [{
            id: account.external_account_id,
            memberId: account.member_id,
            email: account.account_email,
            displayName: account.display_name,
            calendarType: googleCalendarType(calendar),
            accessRole: calendar.accessRole,
          }],
        },
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  return events
}

export async function listAllGoogleEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  options: {
    account: IntegrationAccountRow
    excludedCalendarIds: Set<string>
  },
) {
  const calendars = await listGoogleCalendars(accessToken)
  const events: CalendarEvent[] = []

  // Keep requests sequential to avoid quota bursts for accounts with many calendars.
  for (const calendar of calendars) {
    if (options.excludedCalendarIds.has(calendar.id)) continue
    events.push(...await listGoogleCalendarEvents(
      accessToken,
      calendar,
      timeMin,
      timeMax,
      options.account,
    ))
  }
  return events.sort((a, b) => a.startAt.localeCompare(b.startAt))
}

export async function revokeGoogleToken(token: string) {
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  })
  if (!response.ok && response.status !== 400) {
    throw new Error('Google token revocation failed')
  }
}
