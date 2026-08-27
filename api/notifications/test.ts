import { requireAuthentication } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  isPushSubscriptionJSON,
  sendPushPayload,
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

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return
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
    if (!isPushSubscriptionJSON(body.subscription)) {
      throw new ValidationError('Push subscription is invalid')
    }

    const result = await sendPushPayload(
      env.databaseUrl,
      env.ownerId,
      encryptionKey(),
      {
        title: 'Karaman is ready',
        body: 'Event reminders will appear on this device.',
        url: '/',
        tag: 'karaman-test',
      },
      {
        endpoint: body.subscription.endpoint,
        ttl: 300,
      },
    )
    if (result.sent === 0) {
      sendJson(response, 400, { error: 'This device is not registered for notifications' })
      return
    }
    sendJson(response, 200, { ok: true })
  } catch (error) {
    console.error('Unable to send test notification', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 500, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Test notification is invalid')
        : 'Test notification could not be sent',
    })
  }
}
