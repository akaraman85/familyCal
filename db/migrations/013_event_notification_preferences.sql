ALTER TABLE notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_reminder_minutes_check;

ALTER TABLE notification_settings
  ADD CONSTRAINT notification_settings_reminder_minutes_check
  CHECK (reminder_minutes IN (0, 5, 15, 30, 60, 120, 1440, 2880));

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS reminder_frequency TEXT NOT NULL DEFAULT 'once';

ALTER TABLE notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_reminder_frequency_check;

ALTER TABLE notification_settings
  ADD CONSTRAINT notification_settings_reminder_frequency_check
  CHECK (reminder_frequency IN ('once', 'every_15m', 'every_30m', 'hourly', 'daily'));

CREATE TABLE IF NOT EXISTS event_notification_preferences (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notify_minutes INTEGER NOT NULL
    CHECK (notify_minutes IN (0, 5, 15, 30, 60, 120, 1440, 2880)),
  frequency TEXT NOT NULL
    CHECK (frequency IN ('once', 'every_15m', 'every_30m', 'hourly', 'daily')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_notification_preferences_owner_idx
  ON event_notification_preferences (owner_id);

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS fire_key TEXT NOT NULL DEFAULT 'once';

ALTER TABLE notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_pkey;

ALTER TABLE notification_deliveries
  ADD PRIMARY KEY (owner_id, event_id, kind, event_start_at, fire_key);
