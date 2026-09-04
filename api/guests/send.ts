import { requireAdmin } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import { getGuest } from '../_lib/guests.js'
import {
  isValidGuestInviteUrl,
  sendGuestInviteEmail,
} from '../_lib/guest-invite-email.js'
import { EmailNotConfiguredError, EmailDeliveryError } from '../_lib/email.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

class ValidationError extends Error {}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return

    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Invite details are invalid')
    }
    const body = rawBody as Record<string, unknown>

    const guestId = typeof body.guestId === 'string' ? body.guestId.trim() : ''
    const inviteUrl = typeof body.inviteUrl === 'string' ? body.inviteUrl.trim() : ''
    if (!guestId) throw new ValidationError('Guest is required')
    if (!inviteUrl) throw new ValidationError('Invite link is required')
    if (!isValidGuestInviteUrl(env.appUrl, inviteUrl)) {
      throw new ValidationError('Invite link is invalid')
    }

    const guest = await getGuest(env.databaseUrl, env.ownerId, guestId)
    if (!guest) {
      sendJson(response, 404, { error: 'Guest access not found' })
      return
    }
    if (!guest.email) {
      throw new ValidationError('Add an email address before sending the invite')
    }

    await sendGuestInviteEmail({
      guestName: guest.display_name,
      guestEmail: guest.email,
      inviteUrl,
      expiresAt: new Date(guest.expires_at),
    })

    sendJson(response, 200, { sent: true, email: guest.email })
  } catch (error) {
    console.error('Unable to send guest invite email', error)
    if (error instanceof ValidationError) {
      sendJson(response, 400, { error: error.message })
      return
    }
    if (error instanceof EmailNotConfiguredError) {
      sendJson(response, 503, { error: error.message })
      return
    }
    if (error instanceof EmailDeliveryError) {
      sendJson(response, 502, { error: error.message })
      return
    }
    sendJson(response, 500, { error: 'Unable to send guest invite email' })
  }
}
