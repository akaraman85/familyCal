export type FamilyIntegration = {
  id: string
  provider: string
  providerName: string
  status: 'connected' | 'error'
  displayName: string | null
  email: string | null
  connectedAt: string
}

export type FamilyMember = {
  id: string
  name: string
  email: string | null
  role: string
  color: string
  integrations: FamilyIntegration[]
}

export async function loadFamilyMembers() {
  const response = await fetch('/api/family', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  if (response.ok) {
    return response.json() as Promise<{ members: FamilyMember[] }>
  }
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Unable to load family members')
}
