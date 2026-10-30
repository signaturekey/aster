# Design

## Context

See proposal.md for motivation. The current modular backend uses Prisma/client/adapter 7.10.1, pg 8.23.1 and Better Auth 1.7.14. Kysely 0.29.7 is already present through the maintained auth adapter. The working Compose database was inspected read-only: it has no application tables or migration history. The user explicitly permits discarding this project's local working/test data and old migration files when implementation starts.

The preceding MVP change is archived as superseded, with 24/25 historically verified tasks. Its unchecked local-startup criterion is carried forward, not converted into a success. Current routes, public TypeBox schemas and PostgreSQL tests remain the product behavior baseline. No legacy-data compatibility is required.

## Goals / Non-Goals

**Goals:** a clean Kysely/pg schema, explicit typed queries/transactions, unchanged public/business behavior and proven local Docker lifecycle without an ORM engine download.

**Non-Goals:** old-data adoption, old-session continuity, old migration replay/retention, codegen, schema naming plugins, SQL triggers, another ORM, generic repositories/DI/event buses or new product features. No frontend/mobile, deployment/publication or smoke/E2E/browser suites. A bounded manual stack verification does not introduce an automated E2E suite.

## Decisions

### 1. Kysely and handwritten database types

Use a pinned direct Kysely dependency compatible with the maintained Better Auth adapter; start from the installed compatible 0.29.7 line and verify the actual dependency/type graph. Keep the current pg driver unless demonstrated compatibility requires a reviewed change. No unrelated framework upgrades.

`db/client.ts` constructs one Kysely instance with PostgresDialect/pg Pool and owns destruction. Services and cross-module operations accept the database or a current Kysely transaction. `db/types.ts` manually describes actual tables, insert defaults, nullable fields and Date-valued internal timestamptz columns using Kysely ColumnType/Generated as appropriate. SQL is schema authority; handwritten types are checked by compile-time query checking and real database/catalog tests, not assumed correct because a build bundles.

Do not add a code generator, mirror public DTOs, introduce unsafe any/casts to force compilation, or load account rows into public projections. Maintain the existing small route/service/schema organization and explicit transaction operations.

### 2. Fresh snake_case schema with one SQL baseline

New physical names use unquoted snake_case: users, sessions, accounts, verifications, profiles, profile_skills, profile_goals, discovery_decisions, matches, projects, project_skills, project_members, applications, conversations, conversation_members, messages, and dictionary tables. Columns use names such as user_id, created_at and recruitment_open. Use those names directly in Kysely, without a naming plugin. Public responses retain camelCase through explicit projections, not changes to HTTP schemas.

Create one new initial SQL migration containing the complete current logical schema and all required invariants. Do not copy historical intermediate Prisma migrations or keep a migration 004 fix-up: the initial canonical-pair constraint must already use C collation. Remove old Prisma schema/config/migration files from the current tree; Git and the archived change retain historical context.

Translate and review all foreign keys/delete actions, unique/compound keys, pagination indexes, decision no-self/value checks, one-source conversation check, application states, partial one-pending index, message nonblank/length check and the deferrable initially-deferred owner-membership FK. Do not weaken constraints during renaming. Use non-null arrays for logical fields that require arrays, matching the public contract and handwritten types; the fresh schema is not required to reproduce accidental old-DDL nullability gaps.

### 3. Database-generated product IDs and creation times

For matches, projects, applications, conversations and messages, use TEXT primary keys with `DEFAULT gen_random_uuid()::text`, retaining string public IDs and avoiding unnecessary changes to shared user-ID column types. PostgreSQL 18 supplies gen_random_uuid without an extra extension. Better Auth continues to own authentication IDs; dictionary IDs remain stable semantic strings. Profile identity and join keys remain explicit foreign keys.

Use timestamptz(3) creation timestamps with CURRENT_TIMESTAMP defaults. Initialize updated_at with a database default where the table has one; update it explicitly in owning mutation code, with no triggers. Better Auth remains responsible for its session/account mutation timestamps through its maintained adapter.

Use RETURNING to obtain generated IDs/timestamps and coordinate dependent inserts in the same transaction. Empty profile/project PATCH and same-value idempotent retries perform no unnecessary update and do not advance updated_at. No-op classification must preserve established business outcomes, including matched retries and accepted-application retries after departure.

Alternative rejected: manually generating every product ID/timestamp or adding automatic update triggers. Defaults reduce repetitive insert code, while explicit modification times preserve no-op semantics.

### 4. Kysely Migrator, explicit SQL and dictionary seed

Use Kysely's built-in Migrator through a small Bun-run `db:migrate` entrypoint and an explicit ordered registry. One initial migration loads a committed SQL asset containing the baseline; tools images include the asset. Future reviewed migrations are appended, not edits to already-applied versions. Do not introduce a second migration framework or provider schema generator.

Use PostgreSQL-backed migration locking and transactional migration/history updates. Verify concurrent runners, reruns and rollback after injected DDL failure. Ordinary commands must refuse an incompatible nonempty schema with safe diagnostics; they must not automatically baseline/adopt it, reset it or treat existing CREATE TABLE errors as successful application. Support only fresh initialization and the new migration history, not `_prisma_migrations` adoption.

Keep root `db:migrate` and `db:seed` commands. Remove `db:generate` rather than replacing it with a fake no-op. Seed only agreed dictionaries with transactional idempotent upserts, moving seed data out of the Prisma directory. No demo users/projects/messages and no db:adopt-legacy command.

### 5. One-time reset boundary

The user authorized a clean start for Aster's local working and disposable test databases. This permission becomes executable only after the next implementation/apply request. Identify the exact Compose project, service, database and work volume before any destructive action; preserve unrelated containers, databases, volumes and files. Do not use broad Docker prune or machine-wide cleanup. Record targets and outcome.

Reset is a separate one-time transition action, not code added to normal startup or test commands. Existing Prisma accounts/sessions/data are discarded, not migrated. No old-data rollback promise is made. After initialization, normal Compose stop/start preserves the new data, and unsafe test URLs still fail before writes. If target ownership is unclear, stop rather than guessing.

### 6. Authentication mapping and public contracts

Use Better Auth 1.7.14's maintained Kysely integration with the shared Kysely instance and PostgreSQL dialect/type, verifying compatible package identity and transaction configuration. Explicitly map logical auth models/fields to the new snake_case tables/columns. Verify the selected version's schema expectations; its migration generator is not a second schema authority.

Retain email/password hashing, native provider route responses, disabled mail/recovery/account features, database-backed sessions without cookie cache, HttpOnly/Secure/local HTTP settings, CSRF/trusted origins and renewal Set-Cookie propagation on JSON/SSE. Tests start with newly registered users; preserving pre-reset cookies or password hashes is out of scope.

Elysia TypeBox remains the public contract authority and the final chained App type remains inferred. Keep package-local @api aliases, no backend mapping in the shared baseline. Eden keeps parseDate:false. Serialize database Dates to ISO strings; date-like message text remains exact content. Browser events remain in packages/contracts. Browser build input checks must exclude Kysely, pg, Prisma and API runtime; do not recreate the removed standalone consumer fixture.

### 7. Preserve query, transaction and concurrency behavior

Expand Prisma nested writes into explicit Kysely statements inside the existing transaction boundaries. Preserve bounded queries, batched public roster hydration and read-only default profiles. Retain:

- repeatable-read discovery selection/hydration and roster snapshots;
- canonical pair advisory locks and deterministic profile row locking;
- shared project row locking before current-owner/recruitment/member authorization;
- atomic project/owner/conversation creation and application/team/chat changes;
- direct-message idempotency serialization and exact-content conflict handling;
- session FOR SHARE and project/conversation membership checks through SSE enqueue;
- recipient preselection, postcommit publication, bounded queues and sealed shutdown.

Use Kysely parameterized sql templates for specialized locks/queries. SQLSTATE replaces Prisma exception codes in tests and safe logs; do not blanket-map every constraint error to409. Unexpected failures remain safe500 with sanitized diagnostics. If a real serializable failure needs retries, retry only the entire identified transaction with bounded attempts; do not repeat external/SSE side effects inside retries.

Rewrite Prisma-specific fixtures/$extends instrumentation using narrow Kysely driver/query instrumentation or PostgreSQL lock coordination. Preserve deterministic race gates, rollback/privacy/query-count assertions and permission scenarios; mocks or sleeps do not substitute for real PostgreSQL invariants. Exact test counts may change, not behavioral coverage.

### 8. Docker, CI and local evidence

Remove Prisma dependencies, generated artifacts/schema/config, migration files, ignores and engine-related scripts/build steps. Runtime uses the API bundle and required dependencies; tools contains migrations/SQL/seed. Both use frozen installs. No codegen, native ORM preparation or former engine-domain download.

Compose keeps health -> migration/seed -> API ordering, persistent work volume, isolated disposable test PostgreSQL, ports, credentials and graceful signal handling. Do not change credentials incidentally. Keep short README instructions and detailed local docs under ignored docs/.

CI runs frozen install, ESLint/Prettier, workspace types, units, clean PostgreSQL migration/seed/concurrency tests, API/browser builds, Compose validation and Docker build. No publication/deployment. Local completion separately requires ordinary `docker compose up --build`, migration exit success, HTTP health and an authenticated DB-backed operation, graceful stop with SSE, and restart proving data persistence. No cached downloaded engine or temporary build-context workaround may substitute for the ordinary build.

## Risks / Trade-offs

- [Handwritten types can drift] -> reviewed SQL plus insert/select/update/catalog tests; defaults and nullability reflect the actual DB.
- [Physical renaming can break auth or raw SQL] -> explicit mappings and full route/permission/race regression coverage.
- [Former Prisma defaults/nested writes are implicit] -> SQL defaults, RETURNING and explicit transaction sequence tests.
- [Reset permission could be over-applied] -> verify exact project-owned targets; never put reset into startup/tests or touch unrelated resources.
- [Test rewrite may weaken race proof] -> deterministic synchronization, real PostgreSQL and unchanged semantic assertions.
- [Removing one download does not eliminate network failures] -> verify actual ordinary local lifecycle; never disable TLS or equate hosted builds with local startup.

## Migration Plan

1. Wait for explicit implementation approval. Capture current behavior and identify approved local reset targets.
2. Add Kysely/types and one fresh snake_case baseline, with migrations/defaults/seed tests against isolated PostgreSQL.
3. Port auth and product modules, including deterministic test instrumentation, without changing public/business behavior.
4. Remove Prisma and old migration/tooling artifacts; update Docker/CI/docs/rules without rewriting archived failure evidence.
5. Perform the authorized one-time project-only local reset, start the ordinary stack and verify API, shutdown/restart and persistence. Run all local checks and inspect green Actions for the latest pushed SHA.

There is no data-preserving downgrade to Prisma in this plan. Before reset, code can be reverted through normal new commits; after reset, any old data recovery would require a separately retained backup, which is not a completion deliverable. Never rewrite Git history or silently apply destructive down migrations.
