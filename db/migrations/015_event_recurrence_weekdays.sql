ALTER TABLE saved_events
  ADD COLUMN IF NOT EXISTS recurrence_weekdays SMALLINT[];

ALTER TABLE saved_events
  DROP CONSTRAINT IF EXISTS saved_events_recurrence_weekdays_check;

ALTER TABLE saved_events
  ADD CONSTRAINT saved_events_recurrence_weekdays_check
  CHECK (
    recurrence_weekdays IS NULL
    OR (
      cardinality(recurrence_weekdays) > 0
      AND recurrence_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::SMALLINT[]
    )
  );
