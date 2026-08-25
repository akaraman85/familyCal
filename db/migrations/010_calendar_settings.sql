CREATE TABLE IF NOT EXISTS calendar_settings (
  owner_id TEXT PRIMARY KEY,
  default_view TEXT NOT NULL DEFAULT 'Month'
    CHECK (default_view IN ('Day', 'Week', 'Month', 'Year')),
  week_starts_on TEXT NOT NULL DEFAULT 'monday'
    CHECK (week_starts_on IN ('monday', 'sunday')),
  show_weekends BOOLEAN NOT NULL DEFAULT TRUE,
  daily_agenda_email BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
