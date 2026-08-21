# ADR 0001: Run tracked database migrations during production deployment

- Status: Accepted
- Date: 2026-08-21

## Context

The application uses Neon Postgres and deploys through Vercel. Neon connection
variables are marked sensitive in Vercel, so `vercel env pull` redacts them and
cannot support a reliable local production-migration workflow.

The original migration script reapplied every SQL file on every invocation. It
did not record migration history or coordinate concurrent deployments. Running
that script automatically would risk races and repeated schema operations.

Database changes must complete before new application code receives production
traffic. At the same time, compilation failures must not mutate the production
database, and preview deployments must not migrate a shared production schema.

## Decision

Vercel production builds use the following sequence:

1. Build and type-check the application.
2. If `VERCEL_ENV=production`, run `npm run db:migrate`.
3. Publish the deployment only if both steps succeed.

The migration runner:

- discovers numbered SQL files in `db/migrations`;
- records each applied filename and SHA-256 checksum in `schema_migrations`;
- rejects changes to a migration after it has been applied;
- obtains a transaction-scoped Postgres advisory lock;
- applies all pending migrations and ledger entries in one transaction; and
- rolls back the complete pending batch if any migration fails.

Local and preview builds skip production migrations. Developers may still run
`npm run db:migrate` explicitly against a database connection they control.

## Consequences

### Benefits

- Sensitive production credentials remain inside Vercel.
- Concurrent production builds cannot race schema changes.
- A compilation failure cannot alter the database.
- A migration failure prevents publication of incompatible application code.
- Applied migration history is auditable and deterministic.

### Costs and constraints

- Production deployment now depends on database availability.
- Migrations must be backward-compatible with the currently running version,
  because the old deployment continues serving traffic while the build runs.
- Rolling back a Vercel deployment does not roll back its database migration.
- Destructive changes require an expand-and-contract sequence across separate
  deployments.
- Applied SQL files are immutable; corrections require a new numbered file.
- Preview environments do not validate pending production migrations unless
  they are explicitly given an isolated database and migrated separately.

## Alternatives considered

### Run migrations manually from a developer machine

Rejected as the primary workflow because sensitive Vercel variables cannot be
pulled in plaintext, and release success would depend on an undocumented manual
step.

### Run migrations before compiling

Rejected because a later type-check or build failure would leave production
schema changes without a corresponding deployable artifact.

### Run migrations for every preview

Rejected while previews may share database configuration. A feature branch
must not alter the production schema before it is approved.

### Use Neon Auth

Rejected as a migration mechanism. Neon Auth manages application identities and
sessions; it does not execute schema migrations.

### Use a separate CI deployment pipeline

Deferred. A two-phase CI pipeline can later build, migrate, and promote a
prebuilt deployment with stronger release controls. The Vercel build hook is
adequate for the current single-application deployment.
