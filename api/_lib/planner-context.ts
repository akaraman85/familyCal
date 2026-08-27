import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PlannerConfirmationEvent } from './planner-confirmation.js'
import {
  MAX_PLANNER_WARNINGS,
  MAX_PROPOSED_EVENTS,
} from './planner-limits.js'

const MAX_CONTEXT_TOKEN_LENGTH = 48_000
const MAX_TURNS = 8

export type PlannerContextState = {
  version: 1
  ownerId: string
  sessionId: string
  revision: number
  expiresAt: number
  turnCount: number
  status: 'proposal' | 'needs_clarification' | 'calendar_info'
  assistantMessage: string
  events: PlannerConfirmationEvent[]
  warnings: string[]
}

function secret() {
  const value = process.env.AUTH_SESSION_SECRET?.trim()
  if (!value) throw new Error('AUTH_SESSION_SECRET is required')
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== 32) {
    throw new Error('AUTH_SESSION_SECRET must be a base64-encoded 32-byte key')
  }
  return decoded
}

function signature(encoded: string) {
  return createHmac('sha256', secret())
    .update(`planner-context-v1:${encoded}`)
    .digest('base64url')
}

export function readPlannerContext(token: string, ownerId: string) {
  if (!token || token.length > MAX_CONTEXT_TOKEN_LENGTH) return null
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return null
  const expectedSignature = signature(encoded)
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (
    supplied.length !== expected.length
    || !timingSafeEqual(supplied, expected)
  ) {
    return null
  }
  try {
    const state = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as PlannerContextState
    if (
      state.version !== 1
      || state.ownerId !== ownerId
      || typeof state.sessionId !== 'string'
      || !state.sessionId
      || state.sessionId.length > 100
      || !Number.isInteger(state.revision)
      || state.revision < 1
      || !Number.isFinite(state.expiresAt)
      || state.expiresAt < Date.now()
      || !Number.isInteger(state.turnCount)
      || state.turnCount < 1
      || state.turnCount > MAX_TURNS
      || !['proposal', 'needs_clarification', 'calendar_info'].includes(state.status)
      || typeof state.assistantMessage !== 'string'
      || !Array.isArray(state.events)
      || state.events.length > MAX_PROPOSED_EVENTS
      || !Array.isArray(state.warnings)
      || state.warnings.length > MAX_PLANNER_WARNINGS
    ) {
      return null
    }
    return state
  } catch {
    return null
  }
}

export function signPlannerContext(state: Omit<
  PlannerContextState,
  'version' | 'expiresAt'
>) {
  const payload: PlannerContextState = {
    ...state,
    version: 1,
    expiresAt: Date.now() + 60 * 60 * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  if (encoded.length > MAX_CONTEXT_TOKEN_LENGTH - 50) {
    throw new Error('Planner context exceeds its safe size limit')
  }
  return `${encoded}.${signature(encoded)}`
}

export const PLANNER_CONTEXT_MAX_TURNS = MAX_TURNS
