import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'familycal_session'
export const SESSION_DURATION_SECONDS = 12 * 60 * 60

export type AdminSessionPayload = {
  role?: 'admin'
  username: string
  exp: number
}

export type GuestSessionPayload = {
  role: 'guest'
  guestId: string
  exp: number
}

export type SessionPayload = AdminSessionPayload | GuestSessionPayload

export function signature(value: string, secret: Buffer) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
}

export function trySessionSecret() {
  const value = process.env.AUTH_SESSION_SECRET?.trim()
  if (!value) return null
  try {
    const secret = Buffer.from(value, 'base64')
    return secret.length === 32 ? secret : null
  } catch {
    return null
  }
}

export function parseSessionPayload(token: string, secret: Buffer): SessionPayload | null {
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return null
  if (!safeEqual(suppliedSignature, signature(encoded, secret))) return null

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

function cookieValue(cookieHeader: string | null | undefined, name: string) {
  const cookies = cookieHeader?.split(';') ?? []
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

export function sessionPayloadFromCookieHeader(
  cookieHeader: string | null | undefined,
  secret: Buffer,
) {
  const token = cookieValue(cookieHeader, SESSION_COOKIE)
  if (!token) return null
  return parseSessionPayload(token, secret)
}
