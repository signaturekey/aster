# Aster Backend

Aster helps IT people find collaborators for startups, hackathons, and side projects through discovery, mutual matches, and project teams.

## OpenSpec workflow

**Current change:** none. Confirm with `openspec list --json` before starting work.

- `openspec/specs/` contains canonical requirements for implemented product and system behavior. Read the relevant capability specs before changing that behavior.
- `openspec/changes/<change-name>/` contains active proposals, designs, delta specs and task checklists. Read the selected change's artifacts before implementation; use `openspec status --change <change-name>` to inspect its state.
- `openspec/changes/archive/<date>-<change-name>/` stores closed changes and their decisions, task outcomes and verification evidence. Consult it for historical context, not as an active task list or authorization to implement deferred work. An archived change may be superseded or incomplete; read its closure notes.
- Update the current-change pointer when work starts or is archived. Keep progress, dates, blockers and execution history in the change artifacts, not in this file.
- Planning completeness is not implementation approval. Wait for the user's explicit approval before applying a new change. Mark tasks complete only after their work and stated verification pass; sync only implemented and verified requirements into canonical specs.

## Scope and repository map

- Scope: a locally runnable backend and shared API client. Do not create `apps/web`, select a frontend framework, implement a mobile app, or deploy anything without separate approval.
- `apps/api/src/modules/` contains identity, profiles, discovery/matches, projects/teams and conversations. `apps/api/src/app.ts` composes the API without starting a listener; `src/index.ts` owns server startup/shutdown.
- `apps/api/src/db/` contains the connection lifecycle, handwritten table types, SQL migrations and dictionary seed. See its README for database tooling and safety boundaries.
- `apps/api/tests/` contains unit and real-PostgreSQL integration tests. `packages/api-client/` provides the typed Eden client; `packages/contracts/` provides browser-safe runtime contracts.
- `scripts/` contains development and verification entrypoints. Root `README.md` covers quick start and common commands; keep it concise.
- Detailed API/container notes and deferred ideas live locally in Git-ignored `docs/`. Read files directly when needed; ignore-aware searches may omit them, and fresh clones will not contain them. If `docs/backlog.md` is absent, do not recreate it or infer additional scope. Backlog items require separate approval.

## Architecture

- Bun workspaces: `apps/api` and `packages/api-client`; reserve `apps/web` for later.
- Modular monolith: one API process and PostgreSQL. Modules: identity, profiles, discovery/matches, projects/teams, conversations.
- Elysia + its TypeBox schemas for request validation and explicit public responses; Eden Treaty for the client. No duplicate DTO interfaces, Zod layer, or generated OpenAPI SDK.
- Use Kysely + pg, handwritten database types and explicit reviewed SQL migrations. Physical names are snake_case with explicit public camelCase projections, no naming plugin or codegen. Product UUID/created_at defaults come from PostgreSQL; mutations explicitly update updated_at without triggers. Preserve no-op timestamps. Normal startup/tests must never reset the working DB; any destructive database operation requires explicit, scoped approval.
- Better Auth email/password, database-backed sessions, HttpOnly cookies, no cookie cache initially. No OAuth, email verification, SMTP, or password-reset flow in this local MVP.
- HTTP message writes/history plus authenticated SSE events. Single-instance API; no Socket.IO, Redis, presence, typing indicators, or read receipts.
- Dockerfile for the API and Docker Compose for the complete local stack, including migration startup. Normal container startup must not require Bun on the host.
- ESLint + typescript-eslint (recommended rules and type-aware Promise checks), Prettier defaults, strict TypeScript, and `bun:test`. Keep lint configuration minimal; no stylistic plugins. Pin TypeScript within typescript-eslint's supported range. Unit and real-PostgreSQL integration tests; no smoke/E2E suites or browser tests.

## Code conventions

- When writing or changing code, add comments in English near non-obvious logic to explain its purpose, the reasons for the chosen approach, and relevant constraints or consequences. Give the next engineer or agent enough context to understand the intent without reconstructing it from the implementation. Do not narrate obvious operations or add comments mechanically to every function.
- Update related comments when behavior changes. Do not invent rationale: if it cannot be established from the code, tests, or documented requirements, ask for clarification. Comments explain intent and constraints; they do not replace checking the implementation and tests.
- Use small modules: routes for HTTP/auth/schema boundaries, services for business operations and transactions, schemas for public contracts. Extract query files when useful, not by default.
- Do not introduce generic repositories, DI containers, event buses, or speculative abstraction layers.
- Chain Elysia route/plugin definitions and export the final inferred `App` type without starting a server. Do not widen it to bare `Elysia`.
- Use extensionless, package-specific aliases such as `@api/*` for backend source instead of deep relative imports or an ambiguous shared `@/*` alias.
- Keep each TypeScript config self-contained; do not introduce a shared `tsconfig.base.json` or config inheritance. Define aliases in the owning package's config, not globally. A package that follows another package's source type graph must explicitly map the aliases it encounters: `apps/api` maps `@api/*` to `./src/*`, and `packages/api-client` maps it to `../../apps/api/src/*` because it consumes the inferred API contract. Explicit duplication is preferable to hidden configuration coupling. Verify alias changes with workspace type checks, Bun tests, and API/browser-client builds.
- Export `@aster/api/contract` as types only. `@aster/api-client` must not import the API runtime, Kysely or pg into browser bundles.
- Root, API, client, client-test and contracts TypeScript configs explicitly declare their compiler options, environment types and file scope. Preserve strict checks in each config. `bun build` does not replace type checking.
- Never expose database rows directly: select public fields, serialize timestamps to ISO strings, and exclude email/private account data from other users' responses.
- Enforce permissions using current database state, including chat history, message writes, and SSE delivery after membership revocation.
- Use constraints and coordinated transactions for matching, recruitment, ownership, and message idempotency. Test races against PostgreSQL; mocks cannot establish these invariants.
- Keep engineering defaults such as field limits explicit in schemas and tests; do not silently invent new product behavior.

## Local execution boundaries

After implementation approval, project dependencies, local containers, migrations, tests, builds, and changes within Aster are allowed. Do not touch unrelated files, databases, containers, or processes. Never reset the working database in a test command: use an explicitly isolated disposable test database.

Do not commit secrets, read unrelated credentials, publish packages/images, buy services, or deploy to production. `.env.example` must contain safe local examples only. No fake email delivery or success stubs.

## Git and CI

- Work on `main` unless the user asks for another branch. Preserve their edits.
- When commits and pushes are authorized, use small coherent commits and push only to `https://github.com/signaturekey/aster`. Do not treat approval of document edits as permission to commit or push.
- Follow Conventional Commits: `<type>(<optional-scope>): <description>`, for example `feat(auth): add email sign-in`, `fix(matches): prevent duplicate matches`, or `ci: add backend checks`.
- Do not add commitlint or commit hooks. Do not amend/reset/rewrite history, force-push, or bypass hooks/signing/checks without explicit approval.
- Keep GitHub Actions for pushes to `main` and pull requests aligned with local commands: frozen install, ESLint/Prettier, workspace type checks, unit tests, PostgreSQL migration/integration tests, API/client builds and Docker image build. No image publication or deployment.
- Hosted CI is only verified when the run for the latest pushed commit succeeds. If GitHub access is unavailable, report the blocker; do not equate local checks with a green Actions run.

## Verification and completion

Current root commands (workspace type checks; no standalone consumer fixture):

```sh
bun run check
bun run typecheck
bun run test:unit
bun run test:integration # Explicit isolated TEST_DATABASE_URL required
bun run build
```

Keep root commands stable where practical; add documented unit/integration and database setup commands during implementation. CI and local validation must exercise the same checks. Do not add smoke/E2E tests as an unstated completion condition.

The goal is complete only when all in-scope OpenSpec tasks are implemented and verified, required local checks pass, and GitHub Actions is green for the latest pushed commit. Docker startup must be fully configured and documented; image build alone is not proof that a container was run. Report exactly which checks were performed and their limitations.

On an unresolved requirement, unavailable external access, or persistent failure, leave affected tasks open and report the blocker. Never weaken requirements, skip failing checks, or mark tasks complete to make the goal appear successful. Wait for user approval before starting implementation.
