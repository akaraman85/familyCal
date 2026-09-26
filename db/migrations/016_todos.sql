CREATE TABLE IF NOT EXISTS todos (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_on DATE,
  assignee_id TEXT,
  calendar_event_id TEXT,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, assignee_id)
    REFERENCES family_members (owner_id, id)
    ON DELETE SET NULL,
  FOREIGN KEY (calendar_event_id)
    REFERENCES saved_events (id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS todos_calendar_event_idx
  ON todos (calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS todos_owner_completed_due_idx
  ON todos (owner_id, completed_at, due_on);

CREATE INDEX IF NOT EXISTS todos_owner_assignee_idx
  ON todos (owner_id, assignee_id);
