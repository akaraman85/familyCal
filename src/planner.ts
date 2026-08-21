export type PlannerModelProfile = 'fast' | 'balanced' | 'quality'

export type PlannerSettings = {
  enabled: boolean
  modelProfile: PlannerModelProfile
  timezone: string
  defaultCalendar: string
}

export type PlannedEvent = {
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  allDayDate: string | null
  allDayEndDate: string | null
  calendar: string
  location: string | null
}

export type PlannerProposal = {
  result: 'proposal' | 'needs_clarification'
  message: string
  events: PlannedEvent[]
  warnings: string[]
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export async function loadPlannerSettings() {
  const response = await fetch('/api/settings/planner', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{ settings: PlannerSettings }>(response)
}

export async function updatePlannerSettings(settings: PlannerSettings) {
  const response = await fetch('/api/settings/planner', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(settings),
  })
  return responseJson<{ settings: PlannerSettings }>(response)
}

export async function proposeEvents(message: string) {
  const response = await fetch('/api/planner/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ message }),
  })
  return responseJson<{
    proposal: PlannerProposal
    proposalId: string
    model: string
    timezone: string
  }>(response)
}
