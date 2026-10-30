# Aster Backend

Aster helps IT people find collaborators for startups, hackathons, and side projects through discovery, mutual matches, and project teams.

## Approval and scope

- Implementation was explicitly approved on 2026-10-30 through the user's Claude Code `/goal` directive to execute the OpenSpec tasks. Document readiness alone is not implementation approval.
- Read `openspec/changes/define-it-matchmaking-mvp/` before implementation. Keep `tasks.md` honest: check a task only after its work and stated verification pass.
- Scope: a locally runnable backend and shared API client. Do not create `apps/web`, select a frontend framework, implement a mobile app, or deploy anything.
- Deferred ideas are stored locally in Git-ignored `docs/backlog.md`. Read it directly when needed; ignore-aware searches may omit it, and fresh clones will not contain it. If absent, do not recreate it or infer additional scope. Do not implement backlog items without approval.
- Canonical `openspec/specs/` describes implemented behavior. Do not sync or archive unimplemented requirements.

## Current state and target architecture

Currently only `GET /health` exists in Bun workspaces: `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/tests/unit/health.test.ts`, and `packages/api-client/src/index.ts`. A separate contract consumer fixture and GitHub Actions workflow are configured. PostgreSQL/Prisma dictionaries, committed migrations, isolated integration infrastructure and Docker/Compose configuration exist. Full local image build/startup is blocked on the Prisma engine download; see `CONTAINERS.md` and the task evidence. Better Auth database sessions, profiles/dictionaries, discovery/matches, project teams/applications, durable text conversations and SSE are implemented. See `API.md` for implemented contracts. Runtime SSE schemas live in browser-safe `packages/contracts`; the API contract remains type-only.

Approved implementation direction:

- Bun workspaces: `apps/api` and `packages/api-client`; reserve `apps/web` for later.
- Modular monolith: one API process and PostgreSQL. Modules: identity, profiles, discovery/matches, projects/teams, conversations.
- Elysia + its TypeBox schemas for request validation and explicit public responses; Eden Treaty for the client. No duplicate DTO interfaces, Zod layer, or generated OpenAPI SDK.
- Prisma schema, generated client, and reviewed SQL migrations; PostgreSQL via the supported Prisma driver adapter. Parameterized raw SQL is allowed for locks and specialized queries.
- Better Auth email/password, database-backed sessions, HttpOnly cookies, no cookie cache initially. No OAuth, email verification, SMTP, or password-reset flow in this local MVP.
- HTTP message writes/history plus authenticated SSE events. Single-instance API; no Socket.IO, Redis, presence, typing indicators, or read receipts.
- Dockerfile for the API and Docker Compose for the complete local stack, including migration startup. Normal container startup must not require Bun on the host.
- Biome, strict TypeScript, and `bun:test`. Unit and real-PostgreSQL integration tests; no smoke/E2E suites or browser tests.

## Code conventions

- Use small modules: routes for HTTP/auth/schema boundaries, services for business operations and transactions, schemas for public contracts. Extract query files when useful, not by default.
- Do not introduce generic repositories, DI containers, event buses, or speculative abstraction layers.
- Chain Elysia route/plugin definitions and export the final inferred `App` type without starting a server. Do not widen it to bare `Elysia`.
- Use extensionless relative imports for contract-reachable backend files so future web aliases cannot collide. The old root `@/` alias has been removed.
- Export `@aster/api/contract` as types only. `@aster/api-client` must not import the API runtime or Prisma into browser bundles.
- Use per-package TypeScript configs extending a shared baseline after migration. `bun build` does not replace type checking.
- Never expose Prisma rows directly: select public fields, serialize timestamps to ISO strings, and exclude email/private account data from other users' responses.
- Enforce permissions using current database state, including chat history, message writes, and SSE delivery after membership revocation.
- Use constraints and coordinated transactions for matching, recruitment, ownership, and message idempotency. Test races against PostgreSQL; mocks cannot establish these invariants.
- Keep engineering defaults such as field limits explicit in schemas and tests; do not silently invent new product behavior.

## Local execution boundaries

After implementation approval, project dependencies, local containers, migrations, tests, builds, and changes within Aster are allowed. Do not touch unrelated files, databases, containers, or processes. Never reset the working database in a test command: use an explicitly isolated disposable test database.

Do not commit secrets, read unrelated credentials, publish packages/images, buy services, or deploy to production. `.env.example` must contain safe local examples only. No fake email delivery or success stubs.

## Git and CI

- Work on `main` unless the user asks for another branch. Preserve their edits.
- After implementation approval, use small coherent commits and push to `https://github.com/signaturekey/aster` to verify GitHub Actions. Do not push during the current documentation review.
- Follow Conventional Commits: `<type>(<optional-scope>): <description>`, for example `feat(auth): add email sign-in`, `fix(matches): prevent duplicate matches`, or `ci: add backend checks`.
- Do not add commitlint or commit hooks. Do not amend/reset/rewrite history, force-push, or bypass hooks/signing/checks without explicit approval.
- Add GitHub Actions early for pushes to `main` and pull requests. Run frozen install, Prisma generation when introduced, Biome, workspace type checks, unit tests, PostgreSQL migration/integration tests, API build, and Docker image build. No image publication or deployment.
- Hosted CI is only verified when the run for the latest pushed commit succeeds. If GitHub access is unavailable, report the blocker; do not equate local checks with a green Actions run.

## Verification and completion

Current root commands (workspace checks include the standalone client consumer fixture):

```sh
bun run db:generate
bun run check
bun run typecheck
bun run test:unit
bun run test:integration # Explicit isolated TEST_DATABASE_URL required
bun run build
```

Keep root commands stable where practical; add documented unit/integration and database setup commands during implementation. CI and local validation must exercise the same checks. Do not add smoke/E2E tests as an unstated completion condition.

The goal is complete only when all in-scope OpenSpec tasks are implemented and verified, required local checks pass, and GitHub Actions is green for the latest pushed commit. Docker startup must be fully configured and documented; image build alone is not proof that a container was run. Report exactly which checks were performed and their limitations.

On an unresolved requirement, unavailable external access, or persistent failure, leave affected tasks open and report the blocker. Never weaken requirements, skip failing checks, or mark tasks complete to make the goal appear successful. Wait for user approval before starting implementation.
