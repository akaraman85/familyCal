# Karaman Calendar

A private, responsive family planning dashboard with day, week, month, and year
calendar views.

## Features

- Shared family calendar with multiple member calendars
- Manual event creation
- Conversational AI planning flow
- Server-side integration registry with Google Calendar as the first provider
- Live read-only Google Calendar events with encrypted OAuth token storage
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

The schema is versioned in `db/migrations`. It stores one encrypted provider
credential per owner, short-lived single-use OAuth state records, and events
created directly in Karaman Calendar. Google events are read live and are not
copied into the database; no synthetic sync activity is stored or displayed.
