# Karaman Calendar

A private, responsive family planning dashboard with day, week, month, and year
calendar views.

## Features

- Shared family calendar with multiple member calendars
- Manual event creation
- Conversational AI planning flow
- Server-side integration registry with Google Calendar as the first provider
- Read-only Google Calendar discovery with encrypted OAuth token storage
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

## Google Calendar integration

The browser only receives connection metadata and calendar names. Google access
and refresh tokens are encrypted with AES-256-GCM before being written to
Postgres. Token exchange, refresh, API access, revocation, and OAuth state
validation all run in server functions.

Before deployment, provision:

| Requirement | Configuration |
| --- | --- |
| Google Cloud project | Enable the Google Calendar API and configure the OAuth consent screen. |
| OAuth web client | Set `GOOGLE_CLIENT_ID` and server-only `GOOGLE_CLIENT_SECRET`. Add `https://YOUR_DOMAIN/api/integrations/google/callback` as an exact authorized redirect URI. |
| Postgres | Set server-only `DATABASE_URL` and run `npm run db:migrate` against the production database. Neon Postgres or another SSL-enabled Postgres service is supported. |
| Token encryption | Set server-only `INTEGRATION_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. Back it up securely; changing it invalidates stored grants. |
| Canonical URL | Set `PUBLIC_APP_URL` to the exact public origin, without a trailing slash. |
| Integration owner | Set `INTEGRATION_OWNER_ID` to a stable, non-secret identifier for this family deployment. |

The current product is a single-family deployment and does not contain end-user
authentication. Enable Vercel Deployment Protection (or equivalent upstream
access control) before production so integration metadata and connect/disconnect
actions are not public. A future multi-family version must replace
`INTEGRATION_OWNER_ID` with the authenticated user's or household's server-side
identity.

Google consent requests `openid`, `email`, `profile`, and read-only Calendar
access. Disconnecting revokes the Google grant before deleting its encrypted
credentials. Do not expose any of the server-only variables with a `VITE_`
prefix.

The schema is versioned in `db/migrations/001_integrations.sql`. It stores one
encrypted provider credential per owner and short-lived, single-use OAuth state
records; it does not store calendar events or sync activity.
