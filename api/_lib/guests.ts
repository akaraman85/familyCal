import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import type { GuestCalendarGrant } from './guest-visibility.js'

export type GuestStatus = 'active' | 'revoked'

export type GuestRow = {
  owner_id: string
  id: string
  display_name: string
  email: string | null
  status: GuestStatus
  include_household: boolean
  expires_at: string
  token_hash: string
  created_at: string
  updated_at: string
  revoked_at: string | null
}

export type GuestRecord = GuestRow & {
  member_ids: string[]
  members: Array<{ id: string; name: string }>
}

export type GuestWrite = {
  display_name: string
  email: string | null
  include_household: boolean
  expires_at: Date
  member_ids: string[]
}

function database(databaseUrl: string) {
  return neon(databaseUrl)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createGuestToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export function guestInviteUrl(appUrl: string, token: string) {
  return `${appUrl.replace(/\/$/, '')}/guest/${token}`
}

function asIso(value: string | Date) {
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString()
}

function serializeGuest(
  row: GuestRow,
  members: Array<{ id: string; name: string }>,
): GuestRecord {
  return {
    ...row,
    expires_at: asIso(row.expires_at),
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    revoked_at: row.revoked_at ? asIso(row.revoked_at) : null,
    member_ids: members.map((member) => member.id),
    members,
  }
}

export function guestGrantFromRecord(guest: GuestRecord): GuestCalendarGrant {
  return {
    includeHousehold: guest.include_household,
    members: guest.members,
  }
}

export function guestIsUsable(guest: Pick<GuestRow, 'status' | 'expires_at'>, now = new Date()) {
  return guest.status === 'active' && new Date(guest.expires_at).getTime() > now.getTime()
}

async function replaceMemberGrants(
  sql: ReturnType<typeof database>,
  ownerId: string,
  guestId: string,
  memberIds: string[],
) {
  await sql.query(
    `DELETE FROM guest_member_grants WHERE owner_id = $1 AND guest_id = $2`,
    [ownerId, guestId],
  )
  for (const memberId of memberIds) {
    await sql.query(
      `INSERT INTO guest_member_grants (owner_id, guest_id, member_id)
       VALUES ($1, $2, $3)`,
      [ownerId, guestId, memberId],
    )
  }
}

async function loadGuestMembers(
  sql: ReturnType<typeof database>,
  ownerId: string,
  guestId: string,
) {
  const rows = await sql.query(
    `SELECT family_members.id, family_members.display_name
       FROM guest_member_grants
       JOIN family_members
         ON family_members.owner_id = guest_member_grants.owner_id
        AND family_members.id = guest_member_grants.member_id
      WHERE guest_member_grants.owner_id = $1
        AND guest_member_grants.guest_id = $2
      ORDER BY family_members.sort_order, family_members.display_name`,
    [ownerId, guestId],
  ) as Array<{ id: string; display_name: string }>
  return rows.map((row) => ({ id: row.id, name: row.display_name }))
}

export async function listGuests(databaseUrl: string, ownerId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, id, display_name, email, status, include_household, expires_at,
            token_hash, created_at, updated_at, revoked_at
       FROM guests
      WHERE owner_id = $1
      ORDER BY created_at DESC`,
    [ownerId],
  ) as GuestRow[]
  const guests = await Promise.all(rows.map(async (row) => (
    serializeGuest(row, await loadGuestMembers(sql, ownerId, row.id))
  )))
  return guests
}

export async function getGuest(databaseUrl: string, ownerId: string, guestId: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, id, display_name, email, status, include_household, expires_at,
            token_hash, created_at, updated_at, revoked_at
       FROM guests
      WHERE owner_id = $1 AND id = $2
      LIMIT 1`,
    [ownerId, guestId],
  ) as GuestRow[]
  const row = rows[0]
  if (!row) return null
  return serializeGuest(row, await loadGuestMembers(sql, ownerId, row.id))
}

export async function getActiveGuest(databaseUrl: string, ownerId: string, guestId: string) {
  const guest = await getGuest(databaseUrl, ownerId, guestId)
  if (!guest || !guestIsUsable(guest)) return null
  return guest
}

export async function findGuestByToken(databaseUrl: string, token: string) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `SELECT owner_id, id, display_name, email, status, include_household, expires_at,
            token_hash, created_at, updated_at, revoked_at
       FROM guests
      WHERE token_hash = $1
      LIMIT 1`,
    [hashToken(token)],
  ) as GuestRow[]
  const row = rows[0]
  if (!row) return null
  return serializeGuest(row, await loadGuestMembers(sql, row.owner_id, row.id))
}

export async function createGuest(
  databaseUrl: string,
  ownerId: string,
  input: GuestWrite,
) {
  const sql = database(databaseUrl)
  const { token, tokenHash } = createGuestToken()
  const id = randomUUID()
  const rows = await sql.query(
    `INSERT INTO guests (
       owner_id, id, display_name, email, status, include_household, expires_at, token_hash
     ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
     RETURNING owner_id, id, display_name, email, status, include_household, expires_at,
               token_hash, created_at, updated_at, revoked_at`,
    [
      ownerId,
      id,
      input.display_name,
      input.email,
      input.include_household,
      input.expires_at.toISOString(),
      tokenHash,
    ],
  ) as GuestRow[]
  await replaceMemberGrants(sql, ownerId, id, input.member_ids)
  return {
    guest: serializeGuest(rows[0], await loadGuestMembers(sql, ownerId, id)),
    token,
  }
}

export async function updateGuest(
  databaseUrl: string,
  ownerId: string,
  guestId: string,
  input: GuestWrite,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `UPDATE guests
        SET display_name = $3,
            email = $4,
            include_household = $5,
            expires_at = $6,
            updated_at = NOW()
      WHERE owner_id = $1 AND id = $2 AND status = 'active'
      RETURNING owner_id, id, display_name, email, status, include_household, expires_at,
                token_hash, created_at, updated_at, revoked_at`,
    [
      ownerId,
      guestId,
      input.display_name,
      input.email,
      input.include_household,
      input.expires_at.toISOString(),
    ],
  ) as GuestRow[]
  const row = rows[0]
  if (!row) return null
  await replaceMemberGrants(sql, ownerId, guestId, input.member_ids)
  return serializeGuest(row, await loadGuestMembers(sql, ownerId, guestId))
}

export async function rotateGuestToken(
  databaseUrl: string,
  ownerId: string,
  guestId: string,
) {
  const sql = database(databaseUrl)
  const { token, tokenHash } = createGuestToken()
  const rows = await sql.query(
    `UPDATE guests
        SET token_hash = $3, updated_at = NOW()
      WHERE owner_id = $1 AND id = $2 AND status = 'active'
      RETURNING owner_id, id, display_name, email, status, include_household, expires_at,
                token_hash, created_at, updated_at, revoked_at`,
    [ownerId, guestId, tokenHash],
  ) as GuestRow[]
  const row = rows[0]
  if (!row) return null
  return {
    guest: serializeGuest(row, await loadGuestMembers(sql, ownerId, guestId)),
    token,
  }
}

export async function revokeGuest(
  databaseUrl: string,
  ownerId: string,
  guestId: string,
) {
  const sql = database(databaseUrl)
  const rows = await sql.query(
    `UPDATE guests
        SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
      WHERE owner_id = $1 AND id = $2 AND status = 'active'
      RETURNING id`,
    [ownerId, guestId],
  )
  return rows.length === 1
}
