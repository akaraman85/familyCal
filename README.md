# Karaman Calendar

A private, responsive family planning dashboard with day, week, month, and year
calendar views.

## Features

- Shared family calendar with multiple member calendars
- Manual event creation
- Conversational AI planning flow
- Structured event proposals through Vercel AI Gateway
- Server-side integration registry with Google Calendar as the first provider
- Read-only Google Calendar events with encrypted OAuth token storage and stale-while-revalidate caching
- Per-account primary, owner, editable, and read-only calendar controls
- Postgres-backed events created directly in the family calendar
- Family member and preference administration
- Time-limited guest links that show busy times only for selected family calendars
- Responsive desktop and mobile layouts
- Installable progressive web app on iPhone, iPad, and desktop
- Web push event reminders on installed devices

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

## Install on iPhone and iPad

The production site is a progressive web app. After deploying over HTTPS:

1. Open the calendar in **Safari** on an iPhone or iPad.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open **Karaman** from the Home Screen. It launches full screen, without Safari’s toolbar.

Safari is required for Home Screen install on iOS. Settings includes the same steps, and iPhone/iPad Safari shows a dismissible install hint until the app is added. After installing, open **Settings → Notifications** from the Home Screen app and allow notifications so event reminders can appear. Regenerating app icons: `npm run icons`.

## Event reminders

Installed devices can receive native OS notifications through Web Push. The
permission prompt must be accepted from the Home Screen app on iPhone and iPad.

Timed family and Google Calendar events send a reminder 15, 30, or 60 minutes
before they start. All-day events send at 8:00 AM in the household timezone from
AI Planner settings. A Vercel Cron job checks due reminders every five minutes;
that frequency requires a Vercel plan that allows sub-daily crons.

Generate VAPID keys with `npm run vapid` and store them only as server
environment variables. Subscription keys are encrypted with
`INTEGRATION_ENCRYPTION_KEY` before they are written to Postgres.

## Deployment policy

Vercel Git deployments run automatically only for pushes to `main`. Feature
branches do not create Preview deployments—or corresponding Neon preview
branches—unless someone explicitly deploys them through the Vercel dashboard
or runs `vercel deploy` from that branch. This keeps routine commits from
consuming Neon branch capacity. The ignore glob is `**` rather than `*`,
because `*` does not match `/` in names such as `cursor/feature`.

Use a manual Preview deployment only when the change needs browser, integration,
or isolated-database verification. Delete that Preview deployment after the PR
is merged so the Vercel-managed Neon integration can clean up its database
branch. Local type checks and builds remain the default verification path for
ordinary feature-branch pushes.

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
30 event facts, the latest assistant message, and up to 30 warnings. Each new
turn replaces that state; screenshots and earlier prompts are never resent.
Sessions allow eight AI turns, follow-ups are capped at 4,000 characters, and
the in-memory UI history is discarded on refresh or when **New plan** is used.
Postgres tracks session revision, status, and expiry plus one encrypted canonical
response for idempotent network retries—never raw prompts or screenshots. The
encrypted retry payload is replaced each turn and cleared on reset or
confirmation, while revisions invalidate superseded proposals and prevent
confirmation from racing a newer turn.

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
access gate is the household administrator login. Friends can be invited from
Family → Guest access with a copyable magic link. That link is hashed at rest,
can be rotated or revoked immediately, and must expire within a year. Guest
sessions are re-checked against the stored invite on every API request.

Guests see only busy blocks for the household calendar and/or family-member
calendars the administrator selected. Event titles, locations, descriptions,
attendees, and conference links are stripped on the server. Guests cannot
create or edit events, open integrations, change settings, or use the AI
Planner. Sending the link is the administrator's responsibility; the app does
not email invites.

A future version that needs separate household accounts should still replace
the shared administrator password with a managed identity provider.

## Google Calendar integration

The browser receives normalized calendar event data, never provider credentials.
Google access and refresh tokens are encrypted with AES-256-GCM before being
written to Postgres. Token exchange, refresh, event reads, revocation, and
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
| Web Push | Run `npm run vapid` and set server-only `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. |
| Reminder cron | Set server-only `CRON_SECRET` to `openssl rand -base64 32`. Vercel Cron sends it as a bearer token to `/api/notifications/dispatch` every five minutes. |

The current product is a single-family deployment with one household
administrator login plus optional guest links, not a multi-family identity
system. Vercel Deployment Protection remains useful as defense in depth.
A future multi-family version must replace
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
connected and disconnected independently. Google events stay sourced from
Google and are not imported as family events. Each connected account is cached
in Postgres by UTC month for two minutes, then served stale while a background
revalidate refreshes it. Changing calendar inclusion invalidates that account’s
cache. Disconnecting deletes the cache with the stored grant. No synthetic sync
activity is stored or displayed.

See [ADR 0002](docs/adr/0002-google-event-cache.md) for why the cache lives in
Postgres and is not an import of Google events.

## Google OAuth branding verification

Google shows your app name and logo on the OAuth consent screen only after
**brand verification** passes. The production deployment exposes the pages and
copy Google expects:

| Google Cloud field | Production URL |
| --- | --- |
| App name | `Family Calendar` |
| Application home page | `https://familycal-self.vercel.app/` |
| Privacy policy | `https://familycal-self.vercel.app/privacy` |
| Terms of service | `https://familycal-self.vercel.app/terms` |
| Authorized redirect URI | `https://familycal-self.vercel.app/api/integrations/google/callback` |
| User support email | `alexkaraman85@gmail.com` |

The home page includes a public description of the app and links to the privacy
policy and terms of service before JavaScript loads, so Google's review can read
them without signing in.

### Console checklist

1. In **Google Auth Platform → Branding**, set the app name to **Family Calendar**
   and upload a square logo (at least 120×120 px; the PWA icons in `public/`
   work).
2. Set the home page, privacy policy, and terms URLs to the production URLs in
   the table above. `PUBLIC_APP_URL` must match that origin exactly.
3. In **Authorized domains**, list only the host you own and can verify in
   [Google Search Console](https://search.google.com/search-console). Google
   requires verification of the registrable domain (for example `example.com`,
   not `vercel.app`). A `*.vercel.app` preview URL cannot be verified as a
   domain you own; attach a custom domain in Vercel first if branding
   verification fails on domain ownership.
4. Add the Search Console verification HTML file or meta tag to `public/`, or
   verify via DNS on the custom domain.
5. Click **Verify Branding** on the Branding page. If issues remain, use
   **View issues** for the specific failed checks, fix them, and re-verify.
6. After branding shows **Ready to publish**, click **Publish branding**. If
   you also use sensitive scopes (`calendar.readonly`), complete **Data access**
   verification in the Verification Center.

The privacy policy describes how Google user data is accessed, used, stored, and
shared, as required for OAuth apps.
