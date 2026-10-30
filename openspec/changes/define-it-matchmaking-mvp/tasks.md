# Tasks

Implementation was explicitly approved on 2026-10-30 through the user's Claude Code `/goal` directive to execute these tasks. Small Conventional Commits and pushes to the agreed repository are authorized. Complete each task only with its stated evidence; no smoke/E2E suite is required. The Git-ignored `docs/backlog.md` remains a local deferred-scope reference and is not published in the planning baseline.

## 1. Planning Baseline, Workspaces, Early CI

- [ ] 1.1 After explicit review approval, commit the agreed planning/rules/backlog baseline as a dedicated Conventional Commit; verify no user edits or secrets are lost and record the baseline SHA.
- [ ] 1.2 Move the existing backend to `apps/api`, add Bun workspace/root scripts and shared/per-package TypeScript configs, and update README/CLAUDE paths; verify frozen installation, existing health tests, lint, types, and build pass.
- [ ] 1.3 Add `@aster/api/contract` and `packages/api-client` with explicit type-only exports and resolvable backend imports; verify a separate consumer fixture infers request/response/error types without `any`, including negative compile-time assertions, and its browser-target build excludes API/Prisma runtime.
- [ ] 1.4 Add GitHub Actions early for main pushes and pull requests with minimal permissions, timeouts, pinned tool versions, frozen install, lint/types/unit/client/API build checks; verify YAML/scripts and document that database/image checks are added when introduced. Do not add commitlint/hooks.
- [ ] 1.5 Verify or configure the approved `https://github.com/signaturekey/aster` remote without overwriting unexpected configuration, push small coherent Conventional Commits on main, and inspect the actual Actions run; verify no history rewrite, image publication, or deployment occurs. Report missing credentials/access as a blocker.

## 2. PostgreSQL, Prisma, Docker, Integration Infrastructure

- [ ] 2.1 Add PostgreSQL/Prisma and the supported driver adapter, reviewed committed migrations, and idempotent dictionary seed data; verify client generation and migrations apply to a clean disposable database, and document seed identifiers/defaults.
- [ ] 2.2 Add a safe isolated integration-test setup and explicit unit/integration commands; verify it refuses the working database URL and tests run against real PostgreSQL without external listening servers or browsers.
- [ ] 2.3 Add a multi-stage API Dockerfile and Compose database/migration/API dependency ordering, persistent volume, safe `.env.example`, port configuration, and graceful shutdown; verify image build and Compose configuration, and document full `docker compose up --build` without host Bun or destructive resets.
- [ ] 2.4 Extend Actions with Prisma generation, clean PostgreSQL service migrations/integration tests, and Docker image build without publication; verify the hosted run includes these checks and database stages use isolated test credentials.

## 3. Identity, Profiles, Public Contracts

- [ ] 3.1 Integrate Better Auth email/password with the Prisma adapter and database-backed HttpOnly cookie sessions, without OAuth/mail/verification/recovery/cache; verify registration, correct/incorrect sign-in, current session, expiry/sign-out, and absence of attempted email delivery in unit/integration tests.
- [ ] 3.2 Implement current-user lookup, trusted-origin/CSRF configuration, and protected-route identity extraction; verify missing sessions, unauthorized origins, cookie configuration for local HTTP, and no user-ID spoofing with tests and provider-route documentation.
- [ ] 3.3 Implement professional profile/dictionary schemas, completeness, discovery opt-in, and known-ID visibility; verify validation, unauthorized edits, incomplete profiles, opt-out persistence, and no other-user email/private fields in responses.
- [ ] 3.4 Add product error schemas, ISO timestamp serialization, explicit public field projection, documented field limits, and bounded cursors; verify invalid input, limit/cursor errors, and Eden success/error typing without rewriting the native auth-provider contract.

## 4. Discovery, Matches, Direct Text Conversations

- [ ] 4.1 Implement filtered discovery and newest-first stable pagination; verify self/decided/matched/hidden/incomplete exclusions, filter conjunction, timestamp ties, empty deck, and no automatic reset.
- [ ] 4.2 Implement idempotent/revisable pre-match decisions and atomic match/direct-conversation creation; verify concurrent reciprocal requests do not miss or duplicate a match, one-sided interest stays private, hidden targets cannot receive new decisions, and matched retries cannot unmatch.
- [ ] 4.3 Implement match/conversation lists and authorized direct message history/send operations; verify third-party denial, deterministic cursor traversal, nonempty/bounded text, request-ID deduplication/conflicts, and preservation of matches after opt-out using unit/PostgreSQL integration tests.
- [ ] 4.4 Document the implemented discovery/match/message schemas and shared client usage; verify examples type-check and in-process integration tests exercise authenticated route boundaries with real database state. Do not add smoke or E2E journeys.

## 5. Project Recruitment and Teams

- [ ] 5.1 Implement open project creation, required-role/skill fields, catalogue/roster visibility, owner edits, and recruitment closure/reopening; verify atomic sole-owner/project-conversation creation and access rules with integration tests and route documentation. No position entities or seat quotas.
- [ ] 5.2 Implement private application submission/history/withdraw/reject and resubmission; verify one pending application per user/project under concurrency, simultaneous applications to different projects, no match requirement, and historical outcomes retained.
- [ ] 5.3 Implement atomic acceptance and project-chat membership; verify acceptance/closure races, duplicate retries, no partial membership, and no re-adding a removed member by retrying an old accepted application.
- [ ] 5.4 Implement owner transfer, leave/removal, and return through a new application; verify exactly one owner under concurrent transfers, owner cannot leave first, current/new/returning members read full history, and former members immediately lose read/send access including racing writes.

## 6. SSE, Final Evidence, Handoff

- [ ] 6.1 Add an authenticated SSE stream with a shared browser-safe schema/type, bounded delivery, disconnect cleanup, and post-commit events; verify schema-valid events, session/membership enforcement after connection, no uncommitted delivery, and no events after removal through in-process/PostgreSQL integration tests.
- [ ] 6.2 Verify reconnect history recovery and message-ID deduplication using focused integration/client tests, and document single-instance/lossy-event limits without adding Redis/Socket.IO or smoke/E2E suites.
- [ ] 6.3 Reconcile README/CLAUDE/API documentation and checklist with the actual implementation; verify local Compose startup instructions, migration/test commands, all approved endpoint contracts, and backlog exclusions are accurate. Keep both `.gitkeep` files.
- [ ] 6.4 Run frozen install, Prisma generation, lint, workspace types, unit/integration tests, API/client and Docker builds, plus strict OpenSpec validation; push the final coherent Conventional Commit and verify required GitHub Actions jobs succeed for that exact latest SHA. Record performed checks and any runtime checks not performed; do not declare completion with blockers or unverified hosted CI.

## Workflow Follow-up

- No implementation starts until the user approves the revised documents. Claude Code `/goal` is the user's execution mechanism, not a new tool to build here.
- Keep `docs/backlog.md` outside this goal; public safety/account lifecycle, frontend/mobile work, and deployment each need later approval.
- Sync/archive requirements only after verified implementation, not merely because planning artifacts exist.
