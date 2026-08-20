import { createHmac, timingSafeEqual } from 'node:crypto'
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

export type AuthenticatedUser = {
  username: string
}

type SessionPayload = {
  exp: number
  username: string
}

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

export function createSession(username: string, config: AuthConfig) {
  const payload: SessionPayload = {
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, config.secret)}`
}

export function readSession(
  request: ApiRequest,
  config: AuthConfig,
): AuthenticatedUser | null {
  const token = getCookie(request, SESSION_COOKIE)
  if (!token) return null
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return null
  if (!safeEqual(suppliedSignature, signature(encoded, config.secret))) return null

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as SessionPayload
    if (
      payload.username !== config.username
      || !Number.isFinite(payload.exp)
      || payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return { username: payload.username }
  } catch {
    return null
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

export function requireAuthentication(
  request: ApiRequest,
  response: ApiResponse,
) {
  try {
    const config = authConfig()
    const user = readSession(request, config)
    if (user) return user
  } catch (error) {
    console.error('Authentication configuration error', error)
    sendJson(response, 500, { error: 'Authentication is unavailable' })
    return null
  }

  sendJson(response, 401, { error: 'Authentication required' })
  return null
}
