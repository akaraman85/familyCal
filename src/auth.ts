export type SessionUser = {
  username: string
}

async function errorFrom(response: Response) {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as {
    error?: string
  }
  return new Error(body.error || 'Request failed')
}

export async function loadSession() {
  const response = await fetch('/api/auth/session', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (response.status === 401) return null
  if (!response.ok) throw await errorFrom(response)
  const body = await response.json() as { user: SessionUser }
  return body.user
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
  return body.user
}

export async function logout() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (!response.ok) throw await errorFrom(response)
}
