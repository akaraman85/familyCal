import { requireAuthentication } from '../_lib/auth.js'
import {
  createFamilyMember,
  deleteFamilyMember,
  listFamilyMembers,
  listIntegrationAccounts,
  updateFamilyMember,
} from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { integrationProviders, isIntegrationProvider } from '../_lib/integrations.js'

const MEMBER_COLORS = new Set(['blue', 'coral', 'green', 'gold'])

class ValidationError extends Error {}

function memberFields(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  const color = typeof body.color === 'string' ? body.color : ''
  if (!name || name.length > 100) throw new ValidationError('Name is required')
  if (email.length > 200 || (email && !email.includes('@'))) {
    throw new ValidationError('Enter a valid email address')
  }
  if (!role || role.length > 50) throw new ValidationError('Role is required')
  if (!MEMBER_COLORS.has(color)) throw new ValidationError('Choose a valid color')
  return {
    display_name: name,
    email: email || null,
    role,
    color,
  }
}

function memberJson(member: {
  id: string
  display_name: string
  email: string | null
  role: string
  color: string
}) {
  return {
    id: member.id,
    name: member.display_name,
    email: member.email,
    role: member.role,
    color: member.color,
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'POST', 'PATCH', 'DELETE'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    if (request.method !== 'GET') {
      if (!requireSameOrigin(request, response, env.appUrl)) return
      const body = await readJsonBody(request) as Record<string, unknown>
      if (request.method === 'POST') {
        const member = await createFamilyMember(
          env.databaseUrl,
          env.ownerId,
          memberFields(body),
        )
        sendJson(response, 201, { member: { ...memberJson(member), integrations: [] } })
        return
      }

      const memberId = typeof body.memberId === 'string' ? body.memberId : ''
      if (!memberId) throw new ValidationError('Family member is required')
      if (request.method === 'PATCH') {
        const member = await updateFamilyMember(
          env.databaseUrl,
          env.ownerId,
          memberId,
          memberFields(body),
        )
        if (!member) {
          sendJson(response, 404, { error: 'Family member not found' })
          return
        }
        sendJson(response, 200, { member: { ...memberJson(member), integrations: [] } })
        return
      }

      if (!await deleteFamilyMember(env.databaseUrl, env.ownerId, memberId)) {
        sendJson(response, 404, { error: 'Family member not found' })
        return
      }
      response.statusCode = 204
      response.setHeader('Cache-Control', 'no-store')
      response.end()
      return
    }

    const [members, accounts] = await Promise.all([
      listFamilyMembers(env.databaseUrl, env.ownerId),
      listIntegrationAccounts(env.databaseUrl, env.ownerId),
    ])

    sendJson(response, 200, {
      members: members.map((member) => ({
        ...memberJson(member),
        integrations: accounts
          .filter((account) => account.member_id === member.id)
          .map((account) => {
            const provider = isIntegrationProvider(account.provider)
              ? integrationProviders[account.provider]
              : null
            return {
              id: account.external_account_id,
              provider: account.provider,
              providerName: provider?.name ?? account.provider,
              status: account.status,
              displayName: account.display_name,
              email: account.account_email,
              scopes: account.scopes,
              connectedAt: account.connected_at,
            }
          }),
      })),
    })
  } catch (error) {
    console.error('Unable to list family members', error)
    sendJson(response, error instanceof ValidationError ? 400 : 500, {
      error: error instanceof ValidationError ? error.message : 'Family members are unavailable',
    })
  }
}
