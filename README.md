# Karaman Calendar

A private, responsive family planning dashboard with day, week, month, and year
calendar views.

## Features

- Shared family calendar with multiple member calendars
- Manual event creation
- Conversational AI planning flow
- Structured event proposals through Vercel AI Gateway
- Server-side integration registry with Google Calendar as the first provider
- Live read-only Google Calendar events with encrypted OAuth token storage
- Per-account primary, owner, editable, and read-only calendar controls
- Postgres-backed events created directly in the family calendar
- Family member and preference administration
- Responsive desktop and mobile layouts

## Development

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev:full
```

`npm run dev` starts the frontend only. Use `npm run dev:full` to run both the
Vite app and `/api` functions. Run `npm run build` to type-check and create a
production build.

## AI Planner

The AI Planner uses the Vercel AI SDK and AI Gateway to turn natural-language
requests or attached calendar screenshots into validated event proposals. It
never writes during generation.
The browser displays every proposed event, and only an explicit confirmation
uses the authenticated events API to save the batch transactionally. Proposal
contents are bound to a short-lived server signature, so reviewed events cannot
be altered before confirmation.

Production deployments authenticate to AI Gateway with the short-lived
`VERCEL_OIDC_TOKEN` injected by Vercel, so no model credential is stored in the
browser or Postgres. Enable AI Gateway and fund it with credits in the Vercel
dashboard, then set a project budget before enabling the planner. For local
development, link the project and run `vercel env pull`, or set a server-only
`AI_GATEWAY_API_KEY`.

Settings → AI Planner persists only non-secret preferences: enabled state,
model profile, household timezone, and default calendar. The available profiles
route to OpenAI GPT-5.6 Luna, Terra, and Sol through AI Gateway. Planner prompts
may contain private household scheduling details; they are sent to the selected
model provider only when an authenticated user submits a request. Screenshot
attachments are decoded in the browser, resized to a maximum dimension, rendered
to a fresh JPEG to remove embedded file metadata, and rejected if the processed
payload exceeds 2.5 MB. The server accepts only JPEG and PNG image data, applies
an independent pixel limit, fully decodes it, and canonicalizes it to a fresh
JPEG before forwarding it to the model.

Planner follow-ups use a bounded rolling state rather than replaying the full
chat transcript. A signed, one-hour context token carries at most the current
20 event facts, the latest assistant message, and up to 10 warnings. Each new
turn replaces that state; screenshots and earlier prompts are never resent.
Sessions allow eight AI turns, follow-ups are capped at 4,000 characters, and
the in-memory UI history is discarded on refresh or when **New plan** is used.
Postgres tracks only the session ID, revision, status, and expiry—never prompts
or screenshots—so follow-ups invalidate superseded confirmation tokens and
confirmation cannot race a newer revision.

## Database migrations

`npm run db:migrate` applies each SQL file in `db/migrations` once. Applied
filenames and SHA-256 checksums are recorded in `schema_migrations`. The runner
holds a Postgres advisory lock and applies all pending files in one transaction,
so concurrent production builds cannot race. Never edit an applied migration;
add a new numbered SQL file instead.

Vercel uses `npm run vercel-build`. It builds the application first, then runs
pending migrations only when `VERCEL_ENV=production`. A failed build never
touches the database, and a failed migration prevents the deployment from being
published. Preview and local builds skip production migrations.

See [ADR 0001](docs/adr/0001-production-database-migrations.md) for the decision,
tradeoffs, rollback constraints, and alternatives considered.

## Temporary access

The app and every event/integration API require a server-validated session.
For the requested temporary access, set `APP_USERNAME=alexK` and
`APP_PASSWORD=cal`. The password is read only by the login function and is not
included in the browser bundle. Sessions last 12 hours in an HMAC-signed,
HTTP-only, SameSite cookie.

Set `AUTH_SESSION_SECRET` to an independent `openssl rand -base64 32` value.
Because `cal` is intentionally weak and known, replace it with a strong secret
before exposing the deployment beyond its temporary intended audience. This
access gate is single-user; migrate to a managed identity provider before
supporting separate household accounts or user-level permissions.

## Google Calendar integration

The browser receives normalized calendar event data, never provider credentials.
Google access and refresh tokens are encrypted with AES-256-GCM before being
written to Postgres. Token exchange, refresh, live event reads, revocation, and
OAuth state validation all run in server functions.

Before deployment, provision:

| Requirement | Configuration |
| --- | --- |
| Temporary app access | Set server-only `APP_USERNAME`, `APP_PASSWORD`, and a unique `AUTH_SESSION_SECRET`. |
| Google Cloud project | Enable the Google Calendar API and configure the OAuth consent screen. |
| OAuth web client | Set `GOOGLE_CLIENT_ID` and server-only `GOOGLE_CLIENT_SECRET`. Add `https://YOUR_DOMAIN/api/integrations/google/callback` as an exact authorized redirect URI. |
| Postgres | Set server-only `DATABASE_URL` and run `npm run db:migrate` against the production database. Neon Postgres or another SSL-enabled Postgres service is supported. |
| Token encryption | Set server-only `INTEGRATION_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. Back it up securely; changing it invalidates stored grants. |
| Canonical URL | Set `PUBLIC_APP_URL` to the exact public origin, without a trailing slash. |
| Integration owner | Set `INTEGRATION_OWNER_ID` to a stable, non-secret identifier for this family deployment. |

The current product is a single-family deployment with one shared temporary
login, not a multi-user identity system. Vercel Deployment Protection remains
useful as defense in depth. A future multi-family version must replace
`INTEGRATION_OWNER_ID` with the authenticated user's or household's server-side
identity and use individual accounts.

Google consent requests `openid`, `email`, `profile`, and read-only Calendar
access. Disconnecting revokes the Google grant before deleting its encrypted
credentials. Do not expose any of the server-only variables with a `VITE_`
prefix.

Every readable calendar returned by Google is included by default. The
Integrations view identifies primary calendars and each non-primary calendar's
effective permission level (owner, editable, or read-only), then lets an
administrator exclude individual calendars per connected account.
Only exclusions are persisted, so newly discovered calendars remain included.
Google events retain their source calendar and connected-account provenance;
events from the same shared calendar are deduplicated while preserving every
account through which they were visible.

The schema is versioned in `db/migrations`. Family members are user-managed
parent records for calendar integrations; no sample household members are
created automatically. Each member can own multiple encrypted Google account
credentials. The selected member is captured in the OAuth state and attached
to the account only after the callback validates that state. Accounts can be
connected and disconnected independently. Google events are read live and are
not copied into the database; no synthetic sync activity is stored or
displayed.
