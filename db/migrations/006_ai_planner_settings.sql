CREATE TABLE IF NOT EXISTS ai_planner_settings (
  owner_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  model_profile TEXT NOT NULL DEFAULT 'balanced'
    CHECK (model_profile IN ('fast', 'balanced', 'quality')),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  default_calendar TEXT NOT NULL DEFAULT 'Family',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_planner_rate_limits (
  owner_id TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE saved_events
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS all_day_date DATE,
  ADD COLUMN IF NOT EXISTS planner_request_id TEXT,
  ADD COLUMN IF NOT EXISTS planner_item_index INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS saved_events_planner_request_item_idx
  ON saved_events (owner_id, planner_request_id, planner_item_index)
  WHERE planner_request_id IS NOT NULL;
