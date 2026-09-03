import { requireAdmin } from '../_lib/auth.js'
import { listIntegrationAccounts } from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
import { errorMessage, requireMethod, sendJson, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { integrationProviders } from '../_lib/integrations.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = integrationEnv()
    const accounts = await listIntegrationAccounts(env.databaseUrl, env.ownerId)

    sendJson(response, 200, {
      integrations: Object.values(integrationProviders).map((provider) => {
        const providerAccounts = accounts.filter((account) => account.provider === provider.id)
        return {
          ...provider,
          status: providerAccounts.some((account) => account.status === 'connected')
            ? 'connected'
            : 'disconnected',
          accounts: providerAccounts.map((account) => ({
            id: account.external_account_id,
            memberId: account.member_id,
            displayName: account.display_name,
            email: account.account_email,
            scopes: account.scopes,
            connectedAt: account.connected_at,
            updatedAt: account.updated_at,
          })),
        }
      }),
    })
  } catch (error) {
    console.error('Unable to list integrations', error)
    sendJson(response, 500, {
      error: 'Integration service is unavailable',
      detail: process.env.NODE_ENV === 'development' ? errorMessage(error) : undefined,
    })
  }
}
