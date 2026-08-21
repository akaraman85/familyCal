ALTER TABLE integration_accounts
  DROP CONSTRAINT IF EXISTS integration_accounts_pkey;

ALTER TABLE integration_accounts
  ADD CONSTRAINT integration_accounts_pkey
  PRIMARY KEY (owner_id, provider, external_account_id);

CREATE INDEX IF NOT EXISTS integration_accounts_owner_provider_idx
  ON integration_accounts (owner_id, provider);
