# Tasks

Planning decisions confirmed after grilling on 2026-10-30. Implementation explicitly approved on 2026-10-30 with small verified commits/pushes; tasks are checked only after verification. The user authorizes a one-time reset of identified local Aster working/test databases when implementation starts, not automatic resets in startup or tests. No legacy data/session adoption is required. The archived MVP task 6.4 remains historical failed verification, carried forward into section 7.

## 1. Typed PostgreSQL Foundation and Fresh Schema

- [x] 1.1 After implementation approval, record the public/behavior regression baseline and identify exact project-owned local database/service/volume reset targets; verify unrelated resources are excluded and document the one-time reset boundary without performing broad cleanup. Evidence: pre-port lint/types/builds,30unit/40realPG integration pass. Reset targets verified by Docker labels: compose project aster, work db aster in aster-db-1 with volume aster_postgres-data, disposable aster_test in aster-test-db-1 tmpfs. No reset performed for this task; unrelated resources excluded.
- [ ] 1.2 Add a pinned compatible direct Kysely dependency and pg-backed database/transaction/destruction types with handwritten db/types.ts; verify frozen install, workspace types, real PostgreSQL queries and correct Date/array/null/default typing. Document SQL as schema authority; no codegen or naming plugin.
- [ ] 1.3 Create one new snake_case baseline SQL migration with all logical tables, keys, indexes and checks, including C-collated canonical pairs, partial pending uniqueness and deferred owner membership; verify clean catalog parity for business invariants and direct constraint rejection tests.
- [ ] 1.4 Add SQL UUID TEXT defaults and creation/modification timestamp defaults as designed; verify product inserts omit IDs/creation times successfully, returned IDs are strings, and explicit updated_at updates preserve empty PATCH/idempotent no-op timestamps. Keep auth IDs under Better Auth ownership and document the distinction.

## 2. Migration and Seed Lifecycle

- [ ] 2.1 Implement Bun-run Kysely Migrator entrypoint/SQL assets and root db:migrate with database coordination and safe nonzero failures; verify clean initialization, no-op reruns, concurrent runners and rollback/history after injected DDL failure. Document append-only future migrations and refusal of incompatible nonempty/legacy schemas without automatic adoption or deletion.
- [ ] 2.2 Port dictionary-only transactional seed and root db:seed, moving dictionary data out of prisma/; verify repeated execution, failure rollback, stable IDs/labels and absence of demo accounts/projects/messages. Document migrate-before-seed ordering.
- [ ] 2.3 Adapt isolated test setup to the new baseline and Kysely driver; verify unsafe/working URLs refuse before writes and fresh databases run migration/seed tests without resetting the working database. One-time transition permission must not weaken test safety.

## 3. Authentication and Profiles

- [ ] 3.1 Replace the Prisma auth adapter with the maintained Kysely integration and explicit snake_case model/field mapping; verify new registration, password hashing, bad/good sign-in, session expiry/sign-out, origin/cookie settings and renewal Set-Cookie on JSON/SSE. Keep mail/recovery/cache disabled; no old-session continuity requirement. Document mapping and shared connection ownership.
- [ ] 3.2 Port professional profile/dictionary reads and writes with explicit public projections and batched joins; verify field/dictionary validation, transactional rollback, concurrent PATCH, no hidden profile inserts, stable empty defaults, no-op timestamps, opt-out persistence and no private account exposure. Keep public TypeBox contracts unchanged.

## 4. Discovery, Matches and Teams

- [ ] 4.1 Port bounded discovery and match lookups/lists, preserving repeatable-read snapshots, trim-equivalent completeness and filters; verify exclusions, all-skills/any-goals conjunction, cursor ties/errors and candidate hydration races on PostgreSQL. Reuse shared pagination schemas/helpers and explain specialized SQL with concise English comments.
- [ ] 4.2 Port decision upserts and atomic match/direct-conversation creation using pair/profile locks and DB-generated IDs; verify concurrent reciprocity, pre-match revisions, unchanged retries after opt-out, hidden-target rejection, matched conflicts and exactly one match/conversation without partial writes.
- [ ] 4.3 Port project creation/edit/catalogue/roster with shared coordination operations and batched public profiles; verify atomic owner/project/chat creation, dictionaries/field limits, closure/reopening, transfer-versus-roster snapshots, concurrent absent-profile read-only defaults and bounded query counts.
- [ ] 4.4 Port private application submission/history/terminal transitions; verify pending uniqueness, independent projects, resubmission, acceptance/closure races, rollback and accepted retries that cannot re-add departed members. Preserve current-owner authorization under the project lock.
- [ ] 4.5 Port ownership transfer, leave/removal and both membership tables atomically; verify concurrent transfers retain one owner, owner cannot leave first, revocation serializes with writes and a new accepted application restores the original full chat history.

## 5. Messaging, SSE and Regression Instrumentation

- [ ] 5.1 Port conversation listing/history/message writes to typed Kysely queries and parameterized locks; verify current-member access, timestamp ties, exact-content request deduplication/conflicts, DB-generated IDs/timestamps and rollback. Adapt native SQLSTATE assertions without weakening safe product errors.
- [ ] 5.2 Port SSE recipient selection and locked delivery checks, preserving session FOR SHARE, membership authorization through enqueue and postcommit-only publication; verify in-flight revocation, expiry/sign-out, unrelated connections excluded, bounded queues, safe diagnostics and shutdown sealing. Keep browser schema and lossy reconnect semantics unchanged.
- [ ] 5.3 Replace remaining Prisma fixtures/extensions with narrow Kysely/PostgreSQL instrumentation; verify full permission/concurrency/rollback/query-count regressions use deterministic gates rather than sleeps or mock-only claims. Update local API docs only where persistence details changed; no public behavior changes.

## 6. Toolchain, Containers and CI

- [ ] 6.1 Remove Prisma packages, generated schema/client/config, old migration files, db:generate and all obsolete imports/build/ignore references; verify dependency/import scans, frozen install, lint, workspace types and builds with no Prisma engine preparation. Update CLAUDE/OpenSpec context and concise README/current local docs to the confirmed clean-start plan without altering archived evidence.
- [ ] 6.2 Update Docker tools/runtime assets and Compose migration/seed startup; verify clean ordinary image build and Compose config without engine cache/download, host Bun, credential changes or reset commands in startup. Document project-only one-time reset separately from durable normal restart.
- [ ] 6.3 Update Actions to use the same root commands with clean PostgreSQL migrations/seed, unit/integration/race tests, types, API/browser builds and Docker build; verify isolated test credentials/targets and actual hosted stages without publication or deployment. No adoption/codegen stage.

## 7. Final Verification and Carried-Forward Local Startup

- [ ] 7.1 Perform the authorized one-time reset only after verifying exact local Aster work/test targets; record what was removed/recreated and verify unrelated resources are untouched. Remove no data automatically from normal migrate/test commands.
- [ ] 7.2 Run ordinary docker compose up --build after the clean transition; verify migration/seed success, HTTP health and an authenticated DB-backed operation, graceful stop with SSE, then restart preserving newly committed data. Record exact runtime evidence separately from tests/image build; do not add an automated smoke/E2E suite.
- [ ] 7.3 Run frozen install, ESLint/Prettier, all workspace types, units, full isolated PostgreSQL migrations/regressions, API/browser-client and Docker builds and strict OpenSpec validation; push coherent approved commits and inspect green Actions for the exact latest SHA. Verify browser inputs exclude Kysely/pg/Prisma/API runtime and leave failed/unavailable checks open.

## Workflow Follow-up

- Planning is complete only as documentation; wait for a new explicit apply request before implementation/reset.
- Prior MVP archive remains superseded with 24/25 historical tasks, no canonical sync and no fabricated successful Prisma startup.
- Do not add legacy adoption, old-data migration, codegen, naming plugins, demo seed, frontend, deployment, publishing or backlog features.
- Keep detailed docs local/Git-ignored and README concise; do not recreate the standalone consumer fixture.
- Archive/sync this change only after implemented behavior and required local/hosted evidence are verified.
