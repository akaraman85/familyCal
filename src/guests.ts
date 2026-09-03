export type GuestAccess = {
  id: string
  name: string
  email: string | null
  status: 'active' | 'revoked'
  includeHousehold: boolean
  expiresAt: string
  memberIds: string[]
  calendars: Array<{ id: string; name: string }>
  createdAt: string
  revokedAt: string | null
  inviteUrl?: string
}

export type GuestAccessInput = {
  name: string
  email: string
  includeHousehold: boolean
  expiresAt: string
  memberIds: string[]
}

async function responseJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Request failed')
}

export async function loadGuests() {
  const response = await fetch('/api/guests', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{ guests: GuestAccess[] }>(response)
}

export async function createGuestAccess(input: GuestAccessInput) {
  const response = await fetch('/api/guests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  })
  return responseJson<{ guest: GuestAccess }>(response)
}

export async function updateGuestAccess(guestId: string, input: GuestAccessInput) {
  const response = await fetch('/api/guests', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, guestId }),
  })
  return responseJson<{ guest: GuestAccess }>(response)
}

export async function rotateGuestLink(guestId: string) {
  const response = await fetch('/api/guests', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ guestId, rotateLink: true }),
  })
  return responseJson<{ guest: GuestAccess }>(response)
}

export async function revokeGuestAccess(guestId: string) {
  const response = await fetch('/api/guests', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ guestId }),
  })
  if (response.ok) return
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Unable to revoke guest access')
}
