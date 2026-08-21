import { neon } from '@neondatabase/serverless'

export async function createPlannerSession(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
) {
  const sql = neon(databaseUrl)
  await sql.query(
    `INSERT INTO ai_planner_sessions (
       owner_id, id, revision, status, expires_at
     ) VALUES ($1, $2, 1, 'active', NOW() + INTERVAL '1 hour')`,
    [ownerId, sessionId],
  )
}

export async function advancePlannerSession(
  databaseUrl: string,
  ownerId: string,
  sessionId: string,
  expectedRevision: number,
) {
  const sql = neon(databaseUrl)
  const rows = await sql.query(
    `UPDATE ai_planner_sessions
        SET revision = revision + 1,
            expires_at = NOW() + INTERVAL '1 hour',
            updated_at = NOW()
      WHERE owner_id = $1
        AND id = $2
        AND revision = $3
        AND status = 'active'
        AND expires_at > NOW()
    RETURNING revision`,
    [ownerId, sessionId, expectedRevision],
  ) as Array<{ revision: number }>
  return rows[0]?.revision ?? null
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
        SET status = 'reset', updated_at = NOW()
      WHERE owner_id = $1 AND id = $2 AND status = 'active'`,
    [ownerId, sessionId],
  )
}
