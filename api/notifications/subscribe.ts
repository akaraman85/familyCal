import { requireAuthentication } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  deletePushSubscription,
  isPushSubscriptionJSON,
  upsertPushSubscription,
  vapidConfig,
} from '../_lib/push.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

class ValidationError extends Error {}

function encryptionKey() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY?.trim()
  if (!value) throw new Error('Missing required environment variable: INTEGRATION_ENCRYPTION_KEY')
  return value
}

function userAgent(request: ApiRequest) {
  const value = request.headers['user-agent']
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().slice(0, 400)
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST', 'DELETE'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    if (!vapidConfig()) {
      sendJson(response, 503, { error: 'Web push is not configured' })
      return
    }

    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Push subscription is invalid')
    }
    const body = rawBody as Record<string, unknown>
    const subscription = body.subscription ?? body
    if (!isPushSubscriptionJSON(subscription)) {
      throw new ValidationError('Push subscription is invalid')
    }

    if (request.method === 'DELETE') {
      await deletePushSubscription(env.databaseUrl, env.ownerId, subscription.endpoint)
      response.statusCode = 204
      response.setHeader('Cache-Control', 'no-store')
      response.end()
      return
    }

    await upsertPushSubscription(
      env.databaseUrl,
      env.ownerId,
      encryptionKey(),
      subscription,
      userAgent(request),
    )
    sendJson(response, 200, { ok: true })
  } catch (error) {
    console.error('Unable to manage push subscription', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Push subscription is invalid')
        : 'Push subscription could not be saved',
    })
  }
}
