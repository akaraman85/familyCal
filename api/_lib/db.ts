import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

export type IntegrationAccountRow = {
  owner_id: string
  member_id: string | null
  provider: string
  status: 'connected' | 'error'
  external_account_id: string
  display_name: string | null
  account_email: string | null
  scopes: string[]
  encrypted_credentials: string
  connected_at: string
  updated_at: string
}

export type FamilyMemberRow = {
  owner_id: string
  id: string
  display_name: string
  email: string | null
  role: string
  color: string
  sort_order: number
}

export type StoredCredentials = {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

export type CalendarExclusionRow = {
  owner_id: string
  provider: string
  external_account_id: string
  calendar_id: string
}

function database(databaseUrl: string) {
  return neon(databaseUrl)
}

export async function listIntegrationAccounts(databaseUrl: string, ownerId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, member_id, provider, status, external_account_id, display_name,
            account_email, scopes, connected_at, updated_at
       FROM integration_accounts
      WHERE owner_id = $1
      ORDER BY provider`,
    [ownerId],
  )
  return rows as Omit<IntegrationAccountRow, 'encrypted_credentials'>[]
}

export async function getIntegrationAccount(
  databaseUrl: string,
  ownerId: string,
  provider: string,
  externalAccountId?: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, member_id, provider, status, external_account_id, display_name,
            account_email, scopes, encrypted_credentials, connected_at, updated_at
       FROM integration_accounts
      WHERE owner_id = $1
        AND provider = $2
        AND ($3::text IS NULL OR external_account_id = $3)
      ORDER BY connected_at
      LIMIT 1`,
    [ownerId, provider, externalAccountId ?? null],
  ) as IntegrationAccountRow[]
  return rows[0]
}

export async function listIntegrationAccountsWithCredentials(
  databaseUrl: string,
  ownerId: string,
  provider: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, member_id, provider, status, external_account_id, display_name,
            account_email, scopes, encrypted_credentials, connected_at, updated_at
       FROM integration_accounts
      WHERE owner_id = $1 AND provider = $2
      ORDER BY connected_at`,
    [ownerId, provider],
  )
  return rows as IntegrationAccountRow[]
}

export async function listCalendarExclusions(
  databaseUrl: string,
  ownerId: string,
  provider: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, provider, external_account_id, calendar_id
       FROM integration_calendar_exclusions
      WHERE owner_id = $1 AND provider = $2`,
    [ownerId, provider],
  )
  return rows as CalendarExclusionRow[]
}

export async function setCalendarIncluded(
  databaseUrl: string,
  ownerId: string,
  provider: string,
  externalAccountId: string,
  calendarId: string,
  included: boolean,
) {
  const sql = database(databaseUrl)
  if (included) {
    await sql.query(
      `DELETE FROM integration_calendar_exclusions
        WHERE owner_id = $1
          AND provider = $2
          AND external_account_id = $3
          AND calendar_id = $4`,
      [ownerId, provider, externalAccountId, calendarId],
    )
    return
  }
  await sql.query(
    `INSERT INTO integration_calendar_exclusions (
       owner_id, provider, external_account_id, calendar_id
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [ownerId, provider, externalAccountId, calendarId],
  )
}

export async function upsertIntegrationAccount(
  databaseUrl: string,
  account: Omit<IntegrationAccountRow, 'connected_at' | 'updated_at'>,
) {
  const sql = database(databaseUrl)
  await sql.query(
    `INSERT INTO integration_accounts (
       owner_id, member_id, provider, status, external_account_id, display_name,
       account_email, scopes, encrypted_credentials
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     ON CONFLICT (owner_id, provider, external_account_id) DO UPDATE SET
       member_id = EXCLUDED.member_id,
       status = EXCLUDED.status,
       display_name = EXCLUDED.display_name,
       account_email = EXCLUDED.account_email,
       scopes = EXCLUDED.scopes,
       encrypted_credentials = EXCLUDED.encrypted_credentials,
       updated_at = NOW()`,
    [
      account.owner_id,
      account.member_id,
      account.provider,
      account.status,
      account.external_account_id,
      account.display_name,
      account.account_email,
      JSON.stringify(account.scopes),
      account.encrypted_credentials,
    ],
  )
}

export async function updateEncryptedCredentials(
  databaseUrl: string,
  ownerId: string,
  provider: string,
  externalAccountId: string,
  encryptedCredentials: string,
) {
  const sql = database(databaseUrl)
  await sql.query(
    `UPDATE integration_accounts
        SET encrypted_credentials = $4, status = 'connected', updated_at = NOW()
      WHERE owner_id = $1 AND provider = $2 AND external_account_id = $3`,
    [ownerId, provider, externalAccountId, encryptedCredentials],
  )
}

export async function deleteIntegrationAccount(
  databaseUrl: string,
  ownerId: string,
  provider: string,
  externalAccountId: string,
) {
  const sql = database(databaseUrl)
  await sql.query(
    `DELETE FROM integration_accounts
      WHERE owner_id = $1 AND provider = $2 AND external_account_id = $3`,
    [ownerId, provider, externalAccountId],
  )
}

export async function createOAuthState(
  databaseUrl: string,
  stateHash: string,
  ownerId: string,
  memberId: string,
) {
  const sql = database(databaseUrl)
  await sql.query('DELETE FROM oauth_states WHERE expires_at < NOW()')
  await sql.query(
    `INSERT INTO oauth_states (state_hash, owner_id, provider, member_id, expires_at)
     VALUES ($1, $2, 'google-calendar', $3, NOW() + INTERVAL '10 minutes')`,
    [stateHash, ownerId, memberId],
  )
}

export async function consumeOAuthState(
  databaseUrl: string,
  stateHash: string,
  ownerId: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `DELETE FROM oauth_states
      WHERE state_hash = $1
        AND owner_id = $2
        AND provider = 'google-calendar'
        AND expires_at > NOW()
    RETURNING member_id`,
    [stateHash, ownerId],
  )
  return rows[0]?.member_id as string | undefined
}

export async function getFamilyMember(
  databaseUrl: string,
  ownerId: string,
  memberId: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, id, display_name, email, role, color, sort_order
       FROM family_members
      WHERE owner_id = $1 AND id = $2
      LIMIT 1`,
    [ownerId, memberId],
  ) as FamilyMemberRow[]
  return rows[0]
}

export async function listFamilyMembers(databaseUrl: string, ownerId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, id, display_name, email, role, color, sort_order
       FROM family_members
      WHERE owner_id = $1
      ORDER BY sort_order, display_name`,
    [ownerId],
  )
  return rows as FamilyMemberRow[]
}

export async function createFamilyMember(
  databaseUrl: string,
  ownerId: string,
  member: Pick<FamilyMemberRow, 'display_name' | 'email' | 'role' | 'color'>,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `INSERT INTO family_members (
       owner_id, id, display_name, email, role, color, sort_order
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       COALESCE((SELECT MAX(sort_order) + 1 FROM family_members WHERE owner_id = $1), 1)
     )
     RETURNING owner_id, id, display_name, email, role, color, sort_order`,
    [
      ownerId,
      randomUUID(),
      member.display_name,
      member.email,
      member.role,
      member.color,
    ],
  ) as FamilyMemberRow[]
  return rows[0]
}

export async function updateFamilyMember(
  databaseUrl: string,
  ownerId: string,
  memberId: string,
  member: Pick<FamilyMemberRow, 'display_name' | 'email' | 'role' | 'color'>,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `UPDATE family_members
        SET display_name = $3, email = $4, role = $5, color = $6, updated_at = NOW()
      WHERE owner_id = $1 AND id = $2
    RETURNING owner_id, id, display_name, email, role, color, sort_order`,
    [
      ownerId,
      memberId,
      member.display_name,
      member.email,
      member.role,
      member.color,
    ],
  ) as FamilyMemberRow[]
  return rows[0]
}

export async function deleteFamilyMember(
  databaseUrl: string,
  ownerId: string,
  memberId: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `DELETE FROM family_members
      WHERE owner_id = $1 AND id = $2
    RETURNING id`,
    [ownerId, memberId],
  )
  return rows.length === 1
}
