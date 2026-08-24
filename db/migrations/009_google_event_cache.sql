CREATE TABLE IF NOT EXISTS google_event_cache (
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  month_start DATE NOT NULL,
  exclusion_fingerprint TEXT NOT NULL,
  events JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, provider, external_account_id, month_start),
  CONSTRAINT google_event_cache_account_fkey
    FOREIGN KEY (owner_id, provider, external_account_id)
    REFERENCES integration_accounts (owner_id, provider, external_account_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS google_event_cache_owner_fetched_idx
  ON google_event_cache (owner_id, fetched_at);
