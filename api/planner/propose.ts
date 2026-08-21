import { randomUUID } from 'node:crypto'
import { requireAuthentication } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { proposeCalendarEvents } from '../_lib/planner.js'
import {
  consumePlannerRequest,
  getPlannerSettings,
} from '../_lib/planner-settings.js'

const MAX_MESSAGE_LENGTH = 12_000
const MAX_IMAGE_BYTES = 2_500_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

class ValidationError extends Error {}

function matchesImageSignature(bytes: Uint8Array, mediaType: string) {
  if (mediaType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mediaType === 'image/png') {
    return bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
  }
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ValidationError('Planner request is invalid')
    }
    const body = rawBody as Record<string, unknown>
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    let image: { data: Uint8Array; mediaType: string } | undefined
    if (body.image !== undefined) {
      if (!body.image || typeof body.image !== 'object' || Array.isArray(body.image)) {
        throw new ValidationError('Screenshot attachment is invalid')
      }
      const rawImage = body.image as Record<string, unknown>
      const mediaType = typeof rawImage.mediaType === 'string' ? rawImage.mediaType : ''
      const data = typeof rawImage.data === 'string' ? rawImage.data : ''
      if (!IMAGE_TYPES.has(mediaType) || !data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        throw new ValidationError('Use a JPEG, PNG, or WebP screenshot')
      }
      const bytes = Buffer.from(data, 'base64')
      if (
        !bytes.length
        || bytes.length > MAX_IMAGE_BYTES
        || !matchesImageSignature(bytes, mediaType)
      ) {
        throw new ValidationError('Screenshot data is invalid or larger than 2.5 MB')
      }
      image = { data: bytes, mediaType }
    }
    if ((!message && !image) || message.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(
        `Add instructions, a screenshot, or both. Instructions can be up to ${MAX_MESSAGE_LENGTH} characters.`,
      )
    }

    const settings = await getPlannerSettings(env.databaseUrl, env.ownerId)
    if (!settings.enabled) {
      sendJson(response, 409, {
        error: 'The AI planner is disabled. Enable it in Settings.',
      })
      return
    }
    if (!await consumePlannerRequest(env.databaseUrl, env.ownerId)) {
      sendJson(response, 429, {
        error: 'Too many planner requests. Wait a minute and try again.',
      })
      return
    }

    const result = await proposeCalendarEvents({
      databaseUrl: env.databaseUrl,
      ownerId: env.ownerId,
      message,
      image,
      settings,
      now: new Date(),
    })
    sendJson(response, 200, {
      ...result,
      proposalId: randomUUID(),
      timezone: settings.timezone,
    })
  } catch (error) {
    console.error('Unable to create AI calendar proposal', error)
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, invalid ? 400 : 502, {
      error: invalid
        ? (error instanceof Error ? error.message : 'Planner request is invalid')
        : 'The AI planner could not prepare this request. Check AI Gateway setup and try again.',
    })
  }
}
