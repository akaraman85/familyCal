import { createHmac, timingSafeEqual } from 'node:crypto'
import { appEnv } from './env.js'
import { getActiveGuest, type GuestRecord } from './guests.js'
import {
  getCookie,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from './http.js'

const SESSION_COOKIE = 'familycal_session'
const SESSION_DURATION_SECONDS = 12 * 60 * 60

type AuthConfig = {
  appUrl: string
  password: string
  secret: Buffer
  username: string
}

export type AdminUser = {
  role: 'admin'
  username: string
}

export type GuestUser = {
  role: 'guest'
  guestId: string
  name: string
  expiresAt: string
  includeHousehold: boolean
  calendars: Array<{ id: string; name: string }>
}

export type AuthenticatedUser = AdminUser | GuestUser

type AdminSessionPayload = {
  role?: 'admin'
  username: string
  exp: number
}

type GuestSessionPayload = {
  role: 'guest'
  guestId: string
  exp: number
}

type SessionPayload = AdminSessionPayload | GuestSessionPayload

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function authConfig(): AuthConfig {
  const secret = Buffer.from(required('AUTH_SESSION_SECRET'), 'base64')
  if (secret.length !== 32) {
    throw new Error('AUTH_SESSION_SECRET must be a base64-encoded 32-byte key')
  }
  return {
    appUrl: required('PUBLIC_APP_URL').replace(/\/$/, ''),
    username: required('APP_USERNAME'),
    password: required('APP_PASSWORD'),
    secret,
  }
}

function signature(value: string, secret: Buffer) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
}

export function validCredentials(
  username: string,
  password: string,
  config: AuthConfig,
) {
  const submittedUsername = signature(username, config.secret)
  const expectedUsername = signature(config.username, config.secret)
  const submittedPassword = signature(password, config.secret)
  const expectedPassword = signature(config.password, config.secret)
  return safeEqual(submittedUsername, expectedUsername)
    && safeEqual(submittedPassword, expectedPassword)
}

function sessionExpiry(expiresAt?: Date) {
  const maxExp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  if (!expiresAt) return maxExp
  return Math.min(maxExp, Math.floor(expiresAt.getTime() / 1000))
}

export function createSession(username: string, config: AuthConfig) {
  const payload: AdminSessionPayload = {
    role: 'admin',
    username,
    exp: sessionExpiry(),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, config.secret)}`
}

export function createGuestSession(guest: GuestRecord, config: AuthConfig) {
  const payload: GuestSessionPayload = {
    role: 'guest',
    guestId: guest.id,
    exp: sessionExpiry(new Date(guest.expires_at)),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, config.secret)}`
}

function parseSessionPayload(token: string, config: AuthConfig): SessionPayload | null {
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return null
  if (!safeEqual(suppliedSignature, signature(encoded, config.secret))) return null

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as SessionPayload
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function readAdminSession(
  request: ApiRequest,
  config: AuthConfig,
): AdminUser | null {
  const token = getCookie(request, SESSION_COOKIE)
  if (!token) return null
  const payload = parseSessionPayload(token, config)
  if (!payload) return null
  if ('guestId' in payload && payload.role === 'guest') return null
  if (!('username' in payload) || payload.username !== config.username) return null
  return { role: 'admin', username: payload.username }
}

export function publicGuestUser(guest: GuestRecord): GuestUser {
  return {
    role: 'guest',
    guestId: guest.id,
    name: guest.display_name,
    expiresAt: guest.expires_at,
    includeHousehold: guest.include_household,
    calendars: guest.members,
  }
}

export function publicSessionUser(user: AuthenticatedUser) {
  if (user.role === 'admin') return { role: 'admin' as const, username: user.username }
  return {
    role: 'guest' as const,
    name: user.name,
    expiresAt: user.expiresAt,
    includeHousehold: user.includeHousehold,
    calendars: user.calendars,
  }
}

function secureCookie(config: AuthConfig) {
  return new URL(config.appUrl).protocol === 'https:' ? '; Secure' : ''
}

export function setSessionCookie(
  response: ApiResponse,
  token: string,
  config: AuthConfig,
) {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secureCookie(config)}`,
  )
}

export function clearSessionCookie(response: ApiResponse, config: AuthConfig) {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(config)}`,
  )
}

export async function requireAuthentication(
  request: ApiRequest,
  response: ApiResponse,
): Promise<AuthenticatedUser | null> {
  try {
    const config = authConfig()
    const token = getCookie(request, SESSION_COOKIE)
    if (!token) {
      sendJson(response, 401, { error: 'Authentication required' })
      return null
    }
    const payload = parseSessionPayload(token, config)
    if (!payload) {
      sendJson(response, 401, { error: 'Authentication required' })
      return null
    }
    if (payload.role === 'guest') {
      const env = appEnv()
      const guest = await getActiveGuest(env.databaseUrl, env.ownerId, payload.guestId)
      if (!guest || guest.owner_id !== env.ownerId) {
        sendJson(response, 401, { error: 'Guest access expired or revoked' })
        return null
      }
      return publicGuestUser(guest)
    }
    if (!('username' in payload) || payload.username !== config.username) {
      sendJson(response, 401, { error: 'Authentication required' })
      return null
    }
    return { role: 'admin', username: payload.username }
  } catch (error) {
    console.error('Authentication configuration error', error)
    sendJson(response, 500, { error: 'Authentication is unavailable' })
    return null
  }
}

export async function requireAdmin(
  request: ApiRequest,
  response: ApiResponse,
): Promise<AdminUser | null> {
  const user = await requireAuthentication(request, response)
  if (!user) return null
  if (user.role !== 'admin') {
    sendJson(response, 403, { error: 'Administrator access required' })
    return null
  }
  return user
}
