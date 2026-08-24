# ADR 0002: Cache connected calendar events in Postgres

- Status: Accepted
- Date: 2026-08-24

## Context

The calendar UI loads saved family events and read-only Google Calendar events
for the visible date range. Saved events already live in Postgres. Google
events were fetched live from the Calendar API on every request.

That live read is slow: each connected account lists calendars, then loads
events sequentially to avoid quota bursts. The first paint of a month or year
waited on those provider round-trips, including when the user only needed
events they had already seen.

The previous product rule was that Google events are not copied into the
database. Caching them is a change to that rule and needs an explicit boundary:
a TTL cache is not an import, a sync, or a second source of truth.

## Decision

Connected Google events are stored in `google_event_cache` as a
stale-while-revalidate snapshot:

- Cache key is owner, provider, connected account, and UTC month.
- Default event loads return saved events plus whatever cache covers the
  requested range, without calling Google.
- A cache younger than two minutes is treated as fresh. Older complete cache
  is served immediately, then a background revalidate refreshes it.
- Missing months are also served from whatever cache exists, then filled by
  that same background revalidate.
- Rows record the current calendar-exclusion fingerprint so a fetch started
  before an inclusion change cannot be mistaken for current data.
- Rows older than 14 days are deleted. Disconnecting an account deletes its
  cache with the stored grant. Changing inclusions invalidates that account.

Google remains the source of truth. Cached payloads are not written to
`saved_events`, are not editable in the family calendar, and are not shown as
sync activity.

## Consequences

### Benefits

- Calendar navigation is a Postgres read after the first fill of a month.
- Saved family events are no longer blocked behind Google latency.
- Local `vercel dev` and production behave the same, because the cache is in
  the existing Neon database rather than a platform-only store.
- Disconnect and exclusion changes have a clear invalidation path.

### Costs and constraints

- Private Google event fields now persist in Postgres for up to 14 days.
- The UI may show events that changed in Google within the last two minutes,
  or slightly longer while a revalidate is in flight.
- A cold cache still requires a live Google fetch.
- Production rollout depends on migration `009_google_event_cache.sql`.

## Alternatives considered

### Keep live Google reads

Rejected. The latency is user-visible on every range change, and Google quota
is spent even when the visible month has not changed.

### Import Google events into `saved_events`

Rejected. That would mix provider data with family-owned events, imply
editability, and create a sync problem the product does not have.

### Cache in Vercel Runtime Cache only

Rejected as the primary store. The cache needs to work locally, survive
serverless isolation, hold a month of events without a 2 MB item cap, and
invalidate with account disconnect. Runtime Cache does not replace those
requirements.

### HTTP `Cache-Control: stale-while-revalidate` on `/api/events`

Rejected. The endpoint is authenticated and personalized. Browser and CDN SWR
for cookie-credentialed JSON is unreliable, and it would not share work across
overlapping day, week, and month ranges.
