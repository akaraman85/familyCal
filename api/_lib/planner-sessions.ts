import { createHmac } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { decryptJson, encryptJson } from './crypto.js'

function responseEncryptionKey() {
  const value = process.env.AUTH_SESSION_SECRET?.trim()
  if (!value) throw new Error('AUTH_SESSION_SECRET is required')
  const secret = Buffer.from(value, 'base64')
  if (secret.length !== 32) {
    throw new Error('AUTH_SESSION_SECRET must be a base64-encoded 32-byte key')
  }
  return createHmac('sha256', secret)
    .update('planner-last-response-v1')
    .digest('base64')
}

export async function createPlannerSession(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
  turnId: string,
  response: unknown,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO ai_planner_sessions (
       owner_id, id, revision, status, last_turn_id,
       encrypted_last_response, expires_at
     ) VALUES ($1, $2, 1, 'active', $3, $4, NOW() + INTERVAL '1 hour')
     ON CONFLICT DO NOTHING
     RETURNING revision`,
    [
      ownerId,
      sessionId,
      turnId,
      encryptJson(response, responseEncryptionKey()),
    ],
  ) as Array<{ revision: number }>
  return rows[0]?.revision ?? null
}

export async function advancePlannerSession(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
  expectedRevision: number,
  turnId: string,
  response: unknown,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `UPDATE ai_planner_sessions
        SET revision = revision + 1,
            expires_at = NOW() + INTERVAL '1 hour',
            last_turn_id = $4,
            encrypted_last_response = $5,
            updated_at = NOW()
      WHERE owner_id = $1
        AND id = $2
        AND revision = $3
        AND status = 'active'
        AND expires_at > NOW()
    RETURNING revision`,
    [
      ownerId,
      sessionId,
      expectedRevision,
      turnId,
      encryptJson(response, responseEncryptionKey()),
    ],
  ) as Array<{ revision: number }>
  return rows[0]?.revision ?? null
}

export async function getPlannerTurnResponse<T>(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
  turnId: string,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT encrypted_last_response
       FROM ai_planner_sessions
      WHERE owner_id = $1
        AND id = $2
        AND last_turn_id = $3
        AND expires_at > NOW()
      LIMIT 1`,
    [ownerId, sessionId, turnId],
  ) as Array<{ encrypted_last_response: string | null }>
  const encrypted = rows[0]?.encrypted_last_response
  return encrypted
    ? decryptJson<T>(encrypted, responseEncryptionKey())
    : null
}

export async function plannerSessionIsCurrent(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
  revision: number,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `SELECT 1
       FROM ai_planner_sessions
      WHERE owner_id = $1
        AND id = $2
        AND revision = $3
        AND status = 'active'
        AND expires_at > NOW()
      LIMIT 1`,
    [ownerId, sessionId, revision],
  )
  return rows.length === 1
}

export async function resetPlannerSession(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
) {
  const sql = neon(databaseUrl)
  await sql.query(
    `UPDATE ai_planner_sessions
        SET status = 'reset',
            encrypted_last_response = NULL,
            updated_at = NOW()
      WHERE owner_id = $1 AND id = $2 AND status = 'active'`,
    [ownerId, sessionId],
  )
}
