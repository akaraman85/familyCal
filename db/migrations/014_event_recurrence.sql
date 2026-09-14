ALTER TABLE saved_events
  ADD COLUMN IF NOT EXISTS recurrence TEXT
    CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_until DATE;

CREATE INDEX IF NOT EXISTS saved_events_owner_recurrence_idx
  ON saved_events (owner_id, recurrence)
  WHERE recurrence IS NOT NULL;
