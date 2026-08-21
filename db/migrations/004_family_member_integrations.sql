CREATE TABLE IF NOT EXISTS family_members (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE integration_accounts
  ADD COLUMN IF NOT EXISTS member_id TEXT;

ALTER TABLE integration_accounts
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE integration_accounts
  DROP CONSTRAINT IF EXISTS integration_accounts_family_member_fkey;

ALTER TABLE integration_accounts
  ADD CONSTRAINT integration_accounts_family_member_fkey
  FOREIGN KEY (owner_id, member_id)
  REFERENCES family_members (owner_id, id)
  ON DELETE SET NULL;

ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS member_id TEXT;

CREATE INDEX IF NOT EXISTS integration_accounts_member_idx
  ON integration_accounts (owner_id, member_id);
