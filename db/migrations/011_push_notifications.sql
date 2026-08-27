CREATE TABLE IF NOT EXISTS notification_settings (
  owner_id TEXT PRIMARY KEY,
  event_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (reminder_minutes IN (15, 30, 60)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  encrypted_subscription TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, endpoint_hash)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_owner_idx
  ON push_subscriptions (owner_id);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  event_start_at TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, event_id, kind, event_start_at)
);
