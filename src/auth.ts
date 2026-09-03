export type AdminSessionUser = {
  role: 'admin'
  username: string
}

export type GuestSessionUser = {
  role: 'guest'
  name: string
  expiresAt: string
  includeHousehold: boolean
  calendars: Array<{ id: string; name: string }>
}

export type SessionUser = AdminSessionUser | GuestSessionUser

export function isAdminUser(user: SessionUser | null | undefined): user is AdminSessionUser {
  return user?.role === 'admin'
}

export function isGuestUser(user: SessionUser | null | undefined): user is GuestSessionUser {
  return user?.role === 'guest'
}

async function errorFrom(response: Response) {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as {
    error?: string
  }
  return new Error(body.error || 'Request failed')
}

function normalizeSessionUser(user: SessionUser | { username: string; role?: string }): SessionUser {
  if (user.role === 'guest') return user as GuestSessionUser
  return {
    role: 'admin',
    username: 'username' in user ? user.username : '',
  }
}

export async function loadSession() {
  const response = await fetch('/api/auth/session', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (response.status === 401) return null
  if (!response.ok) throw await errorFrom(response)
  const body = await response.json() as { user: SessionUser }
  return normalizeSessionUser(body.user)
}

export async function login(username: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) throw await errorFrom(response)
  const body = await response.json() as { user: SessionUser }
  return normalizeSessionUser(body.user)
}

export async function redeemGuestInvite(token: string) {
  const response = await fetch('/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  })
  if (!response.ok) throw await errorFrom(response)
  const body = await response.json() as { user: SessionUser }
  return normalizeSessionUser(body.user)
}

export async function logout() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (!response.ok) throw await errorFrom(response)
}
