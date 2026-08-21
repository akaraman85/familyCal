import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { requireAuthentication } from '../_lib/auth.js'
import { appEnv } from '../_lib/env.js'
import {
  readJsonBody,
  RequestBodyTooLargeError,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { proposeCalendarEvents } from '../_lib/planner.js'
import { signPlannerProposal } from '../_lib/planner-confirmation.js'
import {
  consumePlannerRequest,
  getPlannerSettings,
} from '../_lib/planner-settings.js'

const MAX_MESSAGE_LENGTH = 12_000
const MAX_IMAGE_BYTES = 2_500_000
const MAX_REQUEST_BYTES = 3_600_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

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
  return false
}

async function canonicalizeImage(bytes: Uint8Array, mediaType: string) {
  try {
    const pipeline = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: 16_000_000,
    })
    const metadata = await pipeline.metadata()
    const expectedFormat = mediaType === 'image/png' ? 'png' : 'jpeg'
    if (
      metadata.format !== expectedFormat
      || !metadata.width
      || !metadata.height
      || metadata.width * metadata.height > 16_000_000
    ) {
      throw new ValidationError('Screenshot format or dimensions are invalid')
    }
    const normalized = pipeline
      .rotate()
      .resize({
        width: 2200,
        height: 2200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
    let output = await normalized.clone().jpeg({ quality: 86 }).toBuffer()
    if (output.length > MAX_IMAGE_BYTES) {
      output = await normalized.clone().jpeg({ quality: 68 }).toBuffer()
    }
    if (!output.length || output.length > MAX_IMAGE_BYTES) {
      throw new ValidationError('Screenshot is too large after processing')
    }
    return output
  } catch (error) {
    if (error instanceof ValidationError) throw error
    throw new ValidationError('Screenshot could not be safely decoded')
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['POST'])) return
  if (!requireAuthentication(request, response)) return

  try {
    const env = appEnv()
    if (!requireSameOrigin(request, response, env.appUrl)) return
    const contentLength = Number(request.headers['content-length'] ?? 0)
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new RequestBodyTooLargeError('Request body is too large')
    }
    const rawBody = await readJsonBody(request, MAX_REQUEST_BYTES)
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
        throw new ValidationError('Use a JPEG or PNG screenshot')
      }
      const bytes = Buffer.from(data, 'base64')
      if (
        !bytes.length
        || bytes.length > MAX_IMAGE_BYTES
        || !matchesImageSignature(bytes, mediaType)
      ) {
        throw new ValidationError('Screenshot data is invalid or larger than 2.5 MB')
      }
      image = {
        data: await canonicalizeImage(bytes, mediaType),
        mediaType: 'image/jpeg',
      }
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
    const proposalId = randomUUID()
    sendJson(response, 200, {
      ...result,
      proposalId,
      proposalToken: signPlannerProposal({
        requestId: proposalId,
        ownerId: env.ownerId,
        events: result.proposal.events,
      }),
      timezone: settings.timezone,
    })
  } catch (error) {
    console.error('Unable to create AI calendar proposal', error)
    const tooLarge = error instanceof RequestBodyTooLargeError
    const invalid = error instanceof ValidationError || error instanceof SyntaxError
    sendJson(response, tooLarge ? 413 : invalid ? 400 : 502, {
      error: tooLarge
        ? 'Screenshot request is too large'
        : invalid
        ? (error instanceof Error ? error.message : 'Planner request is invalid')
        : 'The AI planner could not prepare this request. Check AI Gateway setup and try again.',
    })
  }
}
