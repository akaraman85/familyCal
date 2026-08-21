CREATE TABLE IF NOT EXISTS integration_calendar_exclusions (
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  excluded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, provider, external_account_id, calendar_id),
  CONSTRAINT integration_calendar_exclusions_account_fkey
    FOREIGN KEY (owner_id, provider, external_account_id)
    REFERENCES integration_accounts (owner_id, provider, external_account_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS integration_calendar_exclusions_owner_provider_idx
  ON integration_calendar_exclusions (owner_id, provider);
