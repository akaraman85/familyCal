import { requireAuthentication } from '../_lib/auth.js'
import {
  ensureDefaultFamilyMembers,
  listFamilyMembers,
  listIntegrationAccounts,
} from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
import { requireMethod, sendJson, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { integrationProviders, isIntegrationProvider } from '../_lib/integrations.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = integrationEnv()
    await ensureDefaultFamilyMembers(env.databaseUrl, env.ownerId)
    const [members, accounts] = await Promise.all([
      listFamilyMembers(env.databaseUrl, env.ownerId),
      listIntegrationAccounts(env.databaseUrl, env.ownerId),
    ])

    sendJson(response, 200, {
      members: members.map((member) => ({
        id: member.id,
        name: member.display_name,
        email: member.email,
        role: member.role,
        color: member.color,
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
              connectedAt: account.connected_at,
            }
          }),
      })),
    })
  } catch (error) {
    console.error('Unable to list family members', error)
    sendJson(response, 500, { error: 'Family members are unavailable' })
  }
}
