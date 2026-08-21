import { neon } from '@neondatabase/serverless'

export type IntegrationAccountRow = {
  owner_id: string
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

export type StoredCredentials = {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

function database(databaseUrl: string) {
  return neon(databaseUrl)
}

export async function listIntegrationAccounts(databaseUrl: string, ownerId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, provider, status, external_account_id, display_name,
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
    `SELECT owner_id, provider, status, external_account_id, display_name,
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
    `SELECT owner_id, provider, status, external_account_id, display_name,
            account_email, scopes, encrypted_credentials, connected_at, updated_at
       FROM integration_accounts
      WHERE owner_id = $1 AND provider = $2
      ORDER BY connected_at`,
    [ownerId, provider],
  )
  return rows as IntegrationAccountRow[]
}

export async function upsertIntegrationAccount(
  databaseUrl: string,
  account: Omit<IntegrationAccountRow, 'connected_at' | 'updated_at'>,
) {
  const sql = database(databaseUrl)
  await sql.query(
    `INSERT INTO integration_accounts (
       owner_id, provider, status, external_account_id, display_name,
       account_email, scopes, encrypted_credentials
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (owner_id, provider, external_account_id) DO UPDATE SET
       status = EXCLUDED.status,
       display_name = EXCLUDED.display_name,
       account_email = EXCLUDED.account_email,
       scopes = EXCLUDED.scopes,
       encrypted_credentials = EXCLUDED.encrypted_credentials,
       updated_at = NOW()`,
    [
      account.owner_id,
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
) {
  const sql = database(databaseUrl)
  await sql.query('DELETE FROM oauth_states WHERE expires_at < NOW()')
  await sql.query(
    `INSERT INTO oauth_states (state_hash, owner_id, provider, expires_at)
     VALUES ($1, $2, 'google-calendar', NOW() + INTERVAL '10 minutes')`,
    [stateHash, ownerId],
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
    RETURNING state_hash`,
    [stateHash, ownerId],
  )
  return rows.length === 1
}
