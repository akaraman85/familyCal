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

INSERT INTO family_members (owner_id, id, display_name, email, role, color, sort_order)
SELECT owner_id, 'alex', 'Alex Karaman', 'alex@karaman.family', 'Administrator', 'blue', 1
FROM (
  SELECT owner_id FROM integration_accounts
  UNION
  SELECT owner_id FROM saved_events
) owners
ON CONFLICT (owner_id, id) DO NOTHING;

ALTER TABLE integration_accounts
  ADD COLUMN IF NOT EXISTS member_id TEXT;

UPDATE integration_accounts
SET member_id = 'alex'
WHERE member_id IS NULL;

ALTER TABLE integration_accounts
  ALTER COLUMN member_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'integration_accounts_family_member_fkey'
  ) THEN
    ALTER TABLE integration_accounts
      ADD CONSTRAINT integration_accounts_family_member_fkey
      FOREIGN KEY (owner_id, member_id)
      REFERENCES family_members (owner_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS member_id TEXT;

CREATE INDEX IF NOT EXISTS integration_accounts_member_idx
  ON integration_accounts (owner_id, member_id);
