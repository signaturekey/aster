# Proposal

## Why

Prisma's platform-specific engine download repeatedly blocks the ordinary local Docker build despite passing database tests and hosted builds. Replace Prisma with Kysely and pg, with a clean database baseline, so local development no longer depends on downloading an ORM engine executable.

## What Changes

- Replace Prisma Client, adapter and CLI with typed Kysely queries, the existing pg driver, handwritten database types and explicit SQL migrations run through Kysely Migrator.
- **BREAKING (database compatibility):** start from a clean database. The user explicitly authorized a one-time reset of this project's local working and disposable test databases during implementation. Old data/accounts/sessions will not be migrated; other databases, containers and volumes are outside that authorization.
- Replace Prisma schema and migration history with one new baseline using snake_case PostgreSQL table/column names. Keep history in Git, not a legacy-adoption subsystem.
- Generate product UUID IDs and creation timestamps through SQL defaults; update modification timestamps explicitly, with no triggers and no timestamp changes for no-op updates or idempotent retries.
- Preserve public HTTP/Eden/SSE contracts, validation, privacy and collaboration rules. Keep Better Auth email/password with a supported Kysely integration mapped to the new physical schema.
- Seed only the existing dictionaries, not demo accounts or collaboration data.
- Update tests, Docker/Compose, CI and documentation; prove actual local startup, authenticated API interaction, graceful stop and durable restart.
- Keep the preceding change archived as superseded, with its failed local-startup evidence and unchecked task 6.4 intact.

## Capabilities

### New Capabilities

- `database-lifecycle`: Engine-independent initialization, ordered migrations, safe startup/restart, dictionary seeding and isolated database verification.

### Modified Capabilities

None. Canonical `health` behavior is unchanged. Existing routes/tests and archived MVP requirements remain the product compatibility baseline; do not introduce MODIFIED deltas for capabilities absent from canonical specs.

## Impact

Affected: API connection/types, all persistence queries and transaction helpers, Better Auth mapping, database fixtures/instrumentation, migration/seed commands, dependencies, Dockerfile, Compose, Actions and current documentation. Public client schemas remain unchanged; new database code must stay out of browser bundles.

The user explicitly approved implementation after grilling on 2026-10-30, including small coherent commits/pushes and the one-time project-only database reset. Document readiness alone is not approval. The reset permission never applies to normal startup or test commands.

Excluded: legacy adoption/data transfer, preserving old sessions, rollback to Prisma data, code generation, naming plugins, additional ORMs, frontend/mobile, generic repositories/DI/event buses, new product behavior, deployment/publication, smoke/E2E/browser suites and backlog work.
