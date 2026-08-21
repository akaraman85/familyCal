CREATE TABLE IF NOT EXISTS ai_planner_sessions (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'confirmed', 'reset')),
  last_turn_id TEXT,
  encrypted_last_response TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS ai_planner_sessions_expiry_idx
  ON ai_planner_sessions (expires_at);
