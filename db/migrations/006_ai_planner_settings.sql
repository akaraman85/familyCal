CREATE TABLE IF NOT EXISTS ai_planner_settings (
  owner_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  model_profile TEXT NOT NULL DEFAULT 'balanced'
    CHECK (model_profile IN ('fast', 'balanced', 'quality')),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  default_calendar TEXT NOT NULL DEFAULT 'Family',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
