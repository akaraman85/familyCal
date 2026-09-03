CREATE TABLE IF NOT EXISTS guests (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  include_household BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS guests_token_hash_idx
  ON guests (token_hash);

CREATE INDEX IF NOT EXISTS guests_owner_status_idx
  ON guests (owner_id, status, expires_at);

CREATE TABLE IF NOT EXISTS guest_member_grants (
  owner_id TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, guest_id, member_id),
  FOREIGN KEY (owner_id, guest_id)
    REFERENCES guests (owner_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (owner_id, member_id)
    REFERENCES family_members (owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS guest_member_grants_member_idx
  ON guest_member_grants (owner_id, member_id);
