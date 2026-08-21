export type FamilyIntegration = {
  id: string
  provider: string
  providerName: string
  status: 'connected' | 'error'
  displayName: string | null
  email: string | null
  scopes: string[]
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

export type FamilyMemberInput = {
  name: string
  email: string
  role: string
  color: string
}

async function responseJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Request failed')
}

export async function loadFamilyMembers() {
  const response = await fetch('/api/family', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{ members: FamilyMember[] }>(response)
}

export async function saveFamilyMember(input: FamilyMemberInput, memberId?: string) {
  const response = await fetch('/api/family', {
    method: memberId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, memberId }),
  })
  return responseJson<{ member: FamilyMember }>(response)
}

export async function deleteFamilyMember(memberId: string) {
  const response = await fetch('/api/family', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ memberId }),
  })
  if (response.ok) return
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
  throw new Error(body.error || 'Unable to delete family member')
}
