import { requireAdmin } from '../_lib/auth.js'
import { listFamilyMembers } from '../_lib/db.js'
import { appEnv } from '../_lib/env.js'
import {
  createGuest,
  guestInviteUrl,
  listGuests,
  rotateGuestToken,
  revokeGuest,
  updateGuest,
  type GuestRecord,
} from '../_lib/guests.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

const MAX_ACCESS_MS = 366 * 24 * 60 * 60 * 1000
const MIN_ACCESS_MS = 60 * 60 * 1000

class ValidationError extends Error {}

function guestJson(guest: GuestRecord, inviteUrl?: string) {
  return {
    id: guest.id,
    name: guest.display_name,
    email: guest.email,
    status: guest.status,
    includeHousehold: guest.include_household,
    expiresAt: guest.expires_at,
    memberIds: guest.member_ids,
    calendars: guest.members,
    createdAt: guest.created_at,
    revokedAt: guest.revoked_at,
    inviteUrl,
  }
}

async function parseGuestFields(
  body: Record<string, unknown>,
  databaseUrl: string,
  ownerId: string,
) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const includeHousehold = body.includeHousehold === true
  const memberIds = Array.isArray(body.memberIds)
    ? [...new Set(body.memberIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : []
  const expiresAt = new Date(typeof body.expiresAt === 'string' ? body.expiresAt : '')

  if (!name || name.length > 100) throw new ValidationError('Name is required')
  if (email.length > 200 || (email && !email.includes('@'))) {
    throw new ValidationError('Enter a valid email address')
  }
  if (Number.isNaN(expiresAt.getTime())) {
    throw new ValidationError('Choose when this access should end')
  }
  const remaining = expiresAt.getTime() - Date.now()
  if (remaining < MIN_ACCESS_MS) {
    throw new ValidationError('Access must last at least one hour')
  }
  if (remaining > MAX_ACCESS_MS) {
    throw new ValidationError('Access cannot last more than one year')
  }
  if (!includeHousehold && memberIds.length === 0) {
    throw new ValidationError('Choose at least one calendar')
  }

  const members = await listFamilyMembers(databaseUrl, ownerId)
  const knownIds = new Set(members.map((member) => member.id))
  if (memberIds.some((id) => !knownIds.has(id))) {
    throw new ValidationError('A selected family member was not found')
  }

  return {
    display_name: name,
    email: email || null,
    include_household: includeHousehold,
    expires_at: expiresAt,
    member_ids: memberIds,
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'POST', 'PATCH', 'DELETE'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = appEnv()
    if (request.method === 'GET') {
      const guests = await listGuests(env.databaseUrl, env.ownerId)
      sendJson(response, 200, { guests: guests.map((guest) => guestJson(guest)) })
      return
    }

    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Guest details are invalid')
    }
    const body = rawBody as Record<string, unknown>

    if (request.method === 'POST') {
      const created = await createGuest(
        env.databaseUrl,
        env.ownerId,
        await parseGuestFields(body, env.databaseUrl, env.ownerId),
      )
      sendJson(response, 201, {
        guest: guestJson(created.guest, guestInviteUrl(env.appUrl, created.token)),
      })
      return
    }

    const guestId = typeof body.guestId === 'string' ? body.guestId : ''
    if (!guestId) throw new ValidationError('Guest is required')

    if (request.method === 'DELETE') {
      if (!await revokeGuest(env.databaseUrl, env.ownerId, guestId)) {
        sendJson(response, 404, { error: 'Guest access not found' })
        return
      }
      response.statusCode = 204
      response.setHeader('Cache-Control', 'no-store')
      response.end()
      return
    }

    if (body.rotateLink === true) {
      const rotated = await rotateGuestToken(env.databaseUrl, env.ownerId, guestId)
      if (!rotated) {
        sendJson(response, 404, { error: 'Guest access not found' })
        return
      }
      sendJson(response, 200, {
        guest: guestJson(rotated.guest, guestInviteUrl(env.appUrl, rotated.token)),
      })
      return
    }

    const updated = await updateGuest(
      env.databaseUrl,
      env.ownerId,
      guestId,
      await parseGuestFields(body, env.databaseUrl, env.ownerId),
    )
    if (!updated) {
      sendJson(response, 404, { error: 'Guest access not found' })
      return
    }
    sendJson(response, 200, { guest: guestJson(updated) })
  } catch (error) {
    console.error('Unable to manage guest access', error)
    sendJson(response, error instanceof ValidationError || error instanceof SyntaxError ? 400 : 500, {
      error: error instanceof ValidationError
        ? error.message
        : 'Guest access is unavailable',
    })
  }
}
