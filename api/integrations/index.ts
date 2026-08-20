import { listIntegrationAccounts } from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
import { errorMessage, requireMethod, sendJson, type ApiRequest, type ApiResponse } from '../_lib/http.js'
import { integrationProviders } from '../_lib/integrations.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return

  try {
    const env = integrationEnv()
    const accounts = await listIntegrationAccounts(env.databaseUrl, env.ownerId)
    const accountByProvider = new Map(accounts.map((account) => [account.provider, account]))

    sendJson(response, 200, {
      integrations: Object.values(integrationProviders).map((provider) => {
        const account = accountByProvider.get(provider.id)
        return {
          ...provider,
          status: account?.status ?? 'disconnected',
          account: account ? {
            displayName: account.display_name,
            email: account.account_email,
            scopes: account.scopes,
            connectedAt: account.connected_at,
            updatedAt: account.updated_at,
          } : null,
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
