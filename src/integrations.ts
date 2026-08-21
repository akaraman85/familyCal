export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

export type Integration = {
  id: 'google-calendar'
  name: string
  description: string
  capabilities: string[]
  status: IntegrationStatus
  accounts: Array<{
    id: string
    memberId: string
    displayName: string | null
    email: string | null
    scopes: string[]
    connectedAt: string
    updatedAt: string
  }>
}

async function responseJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Request failed')
}

export async function loadIntegrations() {
  const response = await fetch('/api/integrations', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{ integrations: Integration[] }>(response)
}

export async function loadGoogleCalendars() {
  const response = await fetch('/api/integrations/google/calendars', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{
    calendars: Array<{
      accountId: string
      id: string
      name: string
      primary: boolean
      accessRole: string
      color: string | null
    }>
  }>(response)
}

export async function disconnectGoogleCalendar(accountId: string) {
  const response = await fetch('/api/integrations/google/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ accountId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Disconnect failed' })) as { error?: string }
    throw new Error(body.error || 'Disconnect failed')
  }
}
