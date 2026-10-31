# Verification — 2026-10-31

## Scope and commits

The user authorized six backend review fixes in an isolated worktree, with small commits. Worktree: `.claude/worktrees/backend-review`; branch: `fix/backend-review`; base: `c21b9a9`. Main-checkout interface/prototype edits were neither copied nor committed. No push, merge or deployment was performed.

- `81b3797`: reject NUL/unpaired surrogates in product schemas, preserve exact valid Unicode and request-id retries; unit/schema and HTTP PostgreSQL regressions.
- `b039bc5`: additive user-leading membership indexes; populated baseline upgrade, concurrent migrators, rerun/catalog/data preservation tests.
- `ef9bfcc`: shared project authorization locks and separate exclusive send lock; concurrent readers, duplicate writes and revocation tests.
- `0f371ed`: bounded recipient ingress and per-connection pending work, one active delivery per connection, coalesced heartbeats, disconnected-work checks; deterministic query gates and overload tests.
- `5f0b63d`: HTTP acknowledgement independent of SSE; a real PostgreSQL recipient session query stays paused until after HTTP response and durable-row verification.
- `a8efe06`: lightweight locked project state; query observation coverage plus existing application/ownership/no-op/roster tests.
- `a5d22fd`: explicit resolved completion promises for disconnected recipients, satisfying type-aware promise lint.
- `ceb62cb`: independent review found reconnects could otherwise accumulate detached blocked delivery transactions. Added a global eight-transaction admission limit, held until each transaction settles, with no waiting semaphore. A deterministic PostgreSQL regression replaces the same connection 40 times while eight session queries remain paused, verifies only eight queries start, then verifies no further queries after abort/release. The reviewer found no other concrete defects in acknowledgement, lock ordering, idempotency or revocation checks.

## Final local checks

All passed after the final reconnect fix as well as both membership optimization commits. Docker rebuild and the complete HTTP/SSE/persistent restart/graceful shutdown interaction were repeated successfully with the final runtime code:

- `bun install --frozen-lockfile` — 155 packages installed with Bun 1.4.4, no lockfile edits.
- `bun run check` — ESLint and Prettier passed.
- `bun run typecheck` — root/API/contracts/client/test configurations passed.
- `bun run test:unit` — 35 passed, 0 failed; 242 assertions.
- `TEST_DATABASE_URL=postgresql://aster_test:aster_test_local_password@127.0.0.1:55433/aster_test bun run test:integration` — 95 passed, 0 failed; 1,557 assertions across 14 files. Explicit disposable `aster_test` database only; no working database reset. Final migrator rerun applied zero migrations.
- `bun run build` — API built, browser client built with 132 inputs and no server runtime.
- `git diff --check` — passed.
- `openspec validate backend-review-fixes --strict` — passed for the proposal/spec/task artifacts.

Negative integration cases intentionally emit invalid-password/origin warnings and one `sse.recipients` error from the simulated lookup outage; these are expected successful regression cases, not ignored test failures.

An initial test import used a schema package not directly installed; corrected to the existing Elysia type compiler without adding dependencies. An initial type-aware lint run rejected aggregating undefined delivery values; corrected with explicit resolved promises and reran the full checks. No checks were disabled or weakened.

## Actual Docker lifecycle

- `docker build --target runtime --tag aster-api:backend-review .` passed.
- Compose configuration validated and actual `docker compose -p aster-backend-review up --build -d --wait` passed with `API_PORT=3011`, `DB_PORT=55443`, `BETTER_AUTH_URL=http://localhost:3011`, `TRUSTED_ORIGINS=http://localhost:3011`.
- Isolated project created its own `aster-backend-review` containers/network/volume; existing `aster` services on ports 3000/55432 remained untouched and running. No volume deletion.
- Fresh startup applied two committed migrations, then dictionary seed, before API start. Health returned `{"status":"ok"}`.
- Real network HTTP interactions: signup, complete profile, project creation, project conversation listing, exact Unicode message write, same-request retry returning the same message, NUL rejection with 422. Live SSE returned the committed message ID.
- Stopped API and database, started the same Compose project again with its volume preserved. Migrator reported zero applied migrations and seed reran safely.
- Signed in again over HTTP, read the same project and exactly one unchanged historical message.
- Opened live SSE and stopped the API. SSE reached EOF; container exit code was 0, OOMKilled false. Stopped the isolated database afterward. Review containers/volume remain stopped/preserved; original `aster-api-1`, `aster-db-1`, `aster-test-db-1` remained running.
- Better Auth logged its existing local-runtime warning that client IP could not be determined and a shared per-path rate-limit bucket was used. This was outside the six findings; no proxy/IP policy was invented.

The temporary interaction driver and local-only test account state were kept outside the repository under `/tmp`, not committed. This was actual local lifecycle verification, not a new smoke/E2E suite.

## Remaining completion boundary

GitHub Actions for the latest commit is **not verified**: the user requested local fixes and commits, not publication. Task 4.3 remains open pending separate push approval and an actual successful hosted run. Local checks are not represented as hosted CI success. The change remains active, not archived; canonical requirements are not claimed synced before final review.
