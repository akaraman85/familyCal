import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { requireAuthentication } from '../_lib/auth.js'
import { integrationEnv } from '../_lib/env.js'
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
  PLANNER_CONTEXT_MAX_TURNS,
  readPlannerContext,
  signPlannerContext,
} from '../_lib/planner-context.js'
import {
  advancePlannerSession,
  createPlannerSession,
  getPlannerTurnResponse,
  plannerSessionIsCurrent,
} from '../_lib/planner-sessions.js'
import {
  consumePlannerRequest,
  getPlannerSettings,
} from '../_lib/planner-settings.js'

const MAX_MESSAGE_LENGTH = 12_000
const MAX_FOLLOW_UP_LENGTH = 4_000
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
    const env = integrationEnv()
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
    const requestedSessionId = typeof body.sessionId === 'string'
      ? body.sessionId
      : ''
    const turnId = typeof body.turnId === 'string' ? body.turnId : ''
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedSessionId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(turnId)
    ) {
      throw new ValidationError('Planner session identifiers are invalid')
    }
    const cachedResponse = await getPlannerTurnResponse<unknown>(
      env.databaseUrl,
      env.ownerId,
      requestedSessionId,
      turnId,
    )
    if (cachedResponse) {
      sendJson(response, 200, cachedResponse)
      return
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    let pendingImage: { data: Uint8Array; mediaType: string } | undefined
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
      pendingImage = { data: bytes, mediaType }
    }
    if ((!message && !pendingImage) || message.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(
        `Add instructions, a screenshot, or both. Instructions can be up to ${MAX_MESSAGE_LENGTH} characters.`,
      )
    }
    const contextToken = typeof body.contextToken === 'string'
      ? body.contextToken
      : ''
    const context = contextToken
      ? readPlannerContext(contextToken, env.ownerId)
      : undefined
    if (contextToken && !context) {
      sendJson(response, 409, {
        error: 'This planner session expired. Start a new plan.',
      })
      return
    }
    if (context && context.sessionId !== requestedSessionId) {
      throw new ValidationError('Planner session does not match its context')
    }
    if (context && pendingImage) {
      throw new ValidationError('Start a new plan before attaching another screenshot')
    }
    if (context && !message) {
      throw new ValidationError('Add a follow-up message for this planner session')
    }
    if (context && message.length > MAX_FOLLOW_UP_LENGTH) {
      throw new ValidationError(`Follow-up messages can be up to ${MAX_FOLLOW_UP_LENGTH} characters`)
    }
    if (context && context.turnCount >= PLANNER_CONTEXT_MAX_TURNS) {
      sendJson(response, 409, {
        error: 'This plan reached its eight-turn limit. Start a new plan to continue.',
      })
      return
    }
    if (context && !await plannerSessionIsCurrent(
      env.databaseUrl,
      env.ownerId,
      context.sessionId,
      context.revision,
    )) {
      sendJson(response, 409, {
        error: 'This plan is no longer current. Start a new plan.',
      })
      return
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
    const image = pendingImage ? {
      data: await canonicalizeImage(pendingImage.data, pendingImage.mediaType),
      mediaType: 'image/jpeg',
    } : undefined

    const result = await proposeCalendarEvents({
      databaseUrl: env.databaseUrl,
      ownerId: env.ownerId,
      encryptionKey: env.encryptionKey,
      googleClientId: env.googleClientId,
      googleClientSecret: env.googleClientSecret,
      message,
      image,
      context: context ?? undefined,
      settings,
      now: new Date(),
    })
    const proposalId = randomUUID()
    const sessionId = requestedSessionId
    const revision = context ? context.revision + 1 : 1
    const turnCount = (context?.turnCount ?? 0) + 1
    console.info('AI calendar proposal ready', {
      result: result.proposal.result,
      eventCount: result.proposal.events.length,
      warningCount: result.proposal.warnings.length,
      duplicateCount: result.duplicateCount,
      model: result.model,
      hadImage: Boolean(image),
      turnCount,
      usage: result.usage,
    })
    const workingEvents = result.proposal.events.length
      ? result.proposal.events
      : (context?.events ?? [])
    const responseBody = {
      ...result,
      proposalId,
      proposalToken: signPlannerProposal({
        requestId: proposalId,
        ownerId: env.ownerId,
        sessionId,
        revision,
        events: result.proposal.events,
      }),
      contextToken: signPlannerContext({
        ownerId: env.ownerId,
        sessionId,
        revision,
        turnCount,
        status: result.proposal.result,
        assistantMessage: result.proposal.message,
        events: workingEvents,
        warnings: result.proposal.warnings,
      }),
      sessionId,
      revision,
      turnsRemaining: PLANNER_CONTEXT_MAX_TURNS - turnCount,
      timezone: settings.timezone,
    }
    const storedRevision = context
      ? await advancePlannerSession(
        env.databaseUrl,
        env.ownerId,
        sessionId,
        context.revision,
        turnId,
        responseBody,
      )
      : (await createPlannerSession(
        env.databaseUrl,
        env.ownerId,
        sessionId,
        turnId,
        responseBody,
      ))
    if (storedRevision === null) {
      const concurrentResponse = await getPlannerTurnResponse<unknown>(
        env.databaseUrl,
        env.ownerId,
        sessionId,
        turnId,
      )
      if (concurrentResponse) {
        sendJson(response, 200, concurrentResponse)
        return
      }
      sendJson(response, 409, {
        error: 'This plan changed in another request. Retry from the latest response.',
      })
      return
    }
    sendJson(response, 200, responseBody)
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
