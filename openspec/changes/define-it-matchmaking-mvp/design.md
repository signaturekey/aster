# Design

## Context and Review Status

Only `/health` currently exists in a single-package Bun/Elysia/Eden skeleton. PostgreSQL, auth, containers, CI, and product endpoints are not implemented.

The interview settled the direction below. Following the documentation review, the user explicitly approved implementation on 2026-10-30 through Claude Code `/goal`. Implementation, scoped verification, coherent commits, and pushes to the agreed repository are now authorized. Planning completeness is not evidence of working functionality.

## Goals / Non-Goals

**Goals:** a fully local containerized backend, explicit domain boundaries, browser-safe typed API access, tested permissions/concurrency, and green hosted CI after implementation approval.

**Non-Goals:** frontend/mobile applications, public deployment, SMTP/OAuth, backlog features, smoke/E2E/browser suites, commitlint/hooks, or an autonomous runner built by this project. Deferred ideas live in `docs/backlog.md`.

## Decisions

### 1. Workspaces and Modular Monolith

```text
apps/
  api/                         # @aster/api, one Bun process
    src/
      app.ts                   # Compose routes; export inferred App, no listener
      index.ts                 # Configuration and server lifecycle
      modules/
        identity/
        profiles/
        discovery/
        projects/
        conversations/
      db/
      lib/
    prisma/
    tests/
packages/
  api-client/                  # @aster/api-client, Eden HTTP client + shared event contract
openspec/
docs/
```

No `apps/web` yet. Each module normally has `routes.ts`, `service.ts`, and `schemas.ts`. Routes handle HTTP/schema/auth boundaries; services own business operations and transaction boundaries. Extract queries only when useful. Cross-module writes go through explicit operations or a deliberately coordinated transaction, not arbitrary route-level table mutations.

Do not add generic repositories, DI containers, event buses, CQRS, or services per table. One PostgreSQL database is sufficient. Use existing platform capabilities before adding libraries.

### 2. Schemas and Eden Contract Propagation

Use Elysia's TypeBox schemas for request validation and explicit public responses. Export the final chained `App` type; do not widen it to bare `Elysia`. No duplicate DTO interfaces, parallel Zod layer, or OpenAPI-generated client. OpenAPI documentation can be considered separately, not as another type authority.

```json
{
  "name": "@aster/api",
  "private": true,
  "exports": {
    "./contract": { "types": "./src/contract.ts" }
  }
}
```

```ts
// apps/api/src/contract.ts
export type { App } from "./app";

// packages/api-client/src/index.ts
import { treaty } from "@elysia/eden";
import type { App } from "@aster/api/contract";
export const createApiClient = (baseUrl: string) => treaty<App>(baseUrl);
```

The client declares Eden as a runtime dependency and the API workspace as a type-only development dependency. The API does not depend on the client. If shared runtime event schemas are needed, define them in a browser-safe contract file with explicit exports, not by importing the server app at runtime; avoid cyclic workspace dependencies.

Type-only imports prevent runtime bundling, but TypeScript still follows the server type graph. Use `@api/*` for backend source, mapped in the API config and explicitly in the API-client config for its server type graph; keep the shared TypeScript baseline package-agnostic. Do not let a future web-local `@/` resolve server imports incorrectly. Use a shared TypeScript baseline and per-package configs with explicit Bun/browser environments. Keep compatible pinned Elysia/Eden versions and one coherent Elysia type graph.

Use workspace client type checking and a browser-target client build, not a web application or smoke suite. The standalone consumer fixture was explicitly removed by the user on 2026-10-30; do not recreate it. Verify no server/Prisma runtime enters the browser bundle. Database models stay internal; response schemas select fields and timestamps serialize as ISO strings.

### 3. Prisma and Transaction Discipline

Use PostgreSQL, Prisma schema/client/migrations, and the supported `pg` + `@prisma/adapter-pg` setup for the chosen compatible versions. Prisma was chosen for a cohesive schema/migration/generated-client workflow, not a claim that agents cannot make mistakes with it. Drizzle/Kysely are not added alongside it.

Review generated migration SQL; commit it and apply it to a clean integration database. Use deploy/apply migrations at startup/CI; never use schema push or destructive reset as deployment. Auth schema generation must be reconciled with the same Prisma migration history.

Initial entities: auth-owned User/Account/Session and adapter-required metadata, Profile and dictionary joins, DiscoveryDecision, Match, Project, ProjectMember, Application, Conversation, ConversationMember, Message.

Constraints and coordinated transactions must cover:

- unique actor/target decisions and canonically ordered user-pair matches;
- coordinated reciprocal writes (stable pair lock or serializable transactions with bounded retry), because unique constraints alone can miss simultaneous mutual interest;
- exactly one direct conversation per match and one project conversation per project;
- serializing recruitment closure, acceptance, transfer, and membership changes against project state;
- one pending application per user/project, retaining historical applications; use a reviewed partial unique index if needed;
- unique project membership and unique message request ID per conversation/sender;
- membership authorization and message persistence serialized against revocation.

Parameterized raw SQL is allowed for locks/indexes/specialized queries. Never interpolate user values into unsafe SQL. Integration tests must exercise these PostgreSQL guarantees rather than mock them.

### 4. Better Auth and Browser Sessions

Use Better Auth's maintained Elysia integration and Prisma adapter with email/password enabled. Registration does not require email verification. Do not configure OAuth, SMTP, verification mail, or password recovery, and do not stub successful delivery.

Use database-backed sessions with the opaque HttpOnly session cookie, no cookie cache initially, and no custom access/refresh JWT flow. Immediate session revocation is not a high-priority differentiator, but the default database path is simpler than adding caching. The JWT plugin is not needed. Roles/team membership are always checked against current server state, not embedded claims.

Mount the provider handler under `/api/auth/*`; retain its documented request/error/session contract. Product endpoints use the separate error envelope below. Configure trusted origins and CSRF protections. Permit local HTTP cookies; Secure follows HTTPS configuration. Browser support is the current target; a possible React Native client is deferred.

The Eden client must allow credentials configuration for eventual cookie-authenticated browser calls. Do not add browser localStorage tokens. No frontend proxy/UI is implemented by this change.

### 5. Product Defaults Agreed in the Interview

- Complete profile: display name, specialization, at least one skill and goal. Goals include startup, hackathon, side-project, learning, and pair-programming.
- Explicit discoverability defaults false; viewing another professional profile by known ID requires sign-in but not discoverability. Never expose another account's email.
- Discovery: newest-first stable creation-time/ID pagination; AND across categories, ALL selected skills, ANY selected goal. Exclude self, hidden/incomplete, decided, and already-matched profiles.
- `interested` / `skipped` decisions persist; no automatic reset or incoming-likes list. Explicit pre-match revision by ID remains possible for otherwise eligible profiles. Deck exclusion is not decision-write ineligibility.
- A match atomically creates one direct conversation. Existing matches survive later opt-out/incompleteness. Existing interested retries return the match; skipped after matching is a conflict, not an implicit unmatch.
- Projects start open with one owner and a project conversation. Required roles/skills are fields, not position records or seat quotas.
- Applications do not require a mutual match. Users may apply to many projects and join many teams; only duplicate pending applications to the same project are forbidden. Rejection/withdrawal permits a new application; removal/leave permits reapplying as a nonmember. Keep prior application history.
- Closing recruitment blocks new applications and acceptances while preserving pending applications, teams, and chats. Reopening resumes recruitment.
- Exactly one owner; transfer to an existing member before the owner leaves. Authenticated users may see project details/rosters, but only the applicant/current owner may see applications.
- New/returning members see the entire project chat history. Former members cannot read/send/receive new events; previously downloaded copies cannot be revoked. Returning requires a new accepted application.
- Text messages only; no avatars, attachments, editing/deletion, blocking/reporting/unmatching, or account deletion. Public onboarding is out of scope until safety/lifecycle work is separately reviewed.

### 6. HTTP + SSE Conversations

HTTP owns message writes and cursor-paginated history. One authenticated SSE stream per user delivers schema-valid conversation/message identifiers after commit. Eden does not automatically type browser EventSource payloads: export an explicit browser-safe event schema/type and test it.

Use bounded single-process delivery and clean up disconnected streams. Recheck current session/membership for delivery; connection-time authorization alone is insufficient. Stop delivery on membership removal, and do not emit uncommitted messages. Sending accepts a client-generated request ID scoped to sender/conversation; same-content retries return the original, different-content reuse returns 409.

Events are not guaranteed exactly once and do not replace history. Reconnect recovery fetches persisted data and deduplicates by message ID. Document single-instance limits; no Redis, durable outbox, Socket.IO, presence, typing indicators, or receipts. These are future candidates, not mandatory dependencies.

### 7. Local Docker Stack

Provide a multi-stage API Dockerfile with pinned compatible Bun, frozen dependencies, explicit Prisma generation, and bundled API startup with required runtime assets. Container startup must not assume host Bun or committed generated artifacts.

`docker-compose.yml` provides:

- PostgreSQL with a health check and persistent volume;
- a migration step using the API image, waiting for the healthy database and applying committed migrations;
- the API, waiting for successful migrations, with documented local port and graceful shutdown.

Use safe `.env.example` values and clear database URLs; user credentials are never baked into images or committed. Pin/test versions and document the distinction between Compose-internal hostnames and optional host development URLs. Basic logs must be useful without exposing passwords, cookies, tokens, or message bodies.

Document `docker compose up --build`, stop/start, migration, and isolated test commands. Normal stop/start preserves data; no automatic volume deletion/reset. Test setup uses an explicitly separate disposable database and rejects a working-database URL. Optional host Bun development can remain, but it is not required to run the full stack.

### 8. CI, Git, and Completion

After review approval, work on `main` and use small coherent Conventional Commits. GitHub target: `https://github.com/signaturekey/aster`. Configure/verify the intended remote before pushing; do not overwrite an unexpected remote or rewrite remote history. Record the existing planning changes in a dedicated documentation commit before implementation. No commitlint, hooks, force pushes, amend, or bypassing checks.

Add GitHub Actions in the first implementation slices for pushes to `main` and pull requests. Use minimal read permissions, explicit timeouts, and pinned tool versions. Root scripts are shared between local and hosted verification. Pipeline:

1. frozen lockfile install;
2. Prisma generation once introduced;
3. ESLint + typescript-eslint (recommended rules and type-aware Promise checks) and Prettier;
4. workspace TypeScript checks;
5. unit tests;
6. committed migrations on clean PostgreSQL service database and integration tests;
7. API and browser-safe client builds;
8. Docker image build without push/publication or running a smoke/E2E suite.

Introduce database-dependent stages alongside the database implementation, never fake-pass absent stages. Integration tests invoke the application in-process (including cookies, auth, and SSE responses) with real PostgreSQL, not a browser or separate listening deployment. There is no mandatory coverage percentage.

Completion requires all scoped OpenSpec tasks and their evidence plus an actual successful GitHub Actions run for the latest pushed commit. Local success cannot substitute for inspecting hosted CI. No smoke/E2E suite or multi-user externally launched HTTP journey is required. Compose startup remains a deliverable; image build alone is not runtime verification. If container startup is exercised manually, report it separately and accurately rather than inventing a mandatory smoke gate.

The user will launch/approve Claude Code `/goal`; this project does not implement or assume special `/goal` lifecycle guarantees. Persistent failures, contradictory requirements, unavailable GitHub credentials, or other blockers require a clear report and open tasks, not weakened acceptance criteria. No production deployment, external image/package publication, or unrelated-machine changes are authorized.

### 9. API Inventory

Product prefix `/api/v1`; all product routes require a session. `/health` is public. Collection default is 20, maximum 50, with deterministic cursors; exact field limits/dictionary seeds are documented engineering defaults, not hidden product features. Product errors: `{ error: { code, message } }`, with safe validation details where necessary. Use 401 for no session, 404 for hidden/nonmember resources, 403 for forbidden management of visible resources, 409 for state conflicts, and 422 for schema validation.

| Method    | Path                                             | Purpose / access                                |
| --------- | ------------------------------------------------ | ----------------------------------------------- |
| GET       | `/health`                                        | Public liveness, unchanged                      |
| POST      | `/api/auth/sign-up/email`                        | Better Auth email/password registration         |
| POST      | `/api/auth/sign-in/email`                        | Better Auth sign-in                             |
| POST      | `/api/auth/sign-out`                             | Better Auth sign-out                            |
| GET       | `/api/auth/get-session`                          | Better Auth session contract                    |
| GET       | `/api/v1/me`                                     | Own account/onboarding                          |
| GET/PATCH | `/api/v1/me/profile`                             | Own profile and discovery opt-in                |
| GET       | `/api/v1/profiles/:userId`                       | Professional fields, never another user's email |
| GET       | `/api/v1/dictionaries`                           | Skills, specializations, experience, goals      |
| GET       | `/api/v1/discovery`                              | Filtered eligible cards                         |
| PUT       | `/api/v1/discovery/decisions/:targetUserId`      | Set/revise interested or skipped                |
| GET       | `/api/v1/matches`                                | Own matches                                     |
| GET       | `/api/v1/matches/:matchId`                       | Participants only; direct conversation ID       |
| GET/POST  | `/api/v1/projects`                               | Catalogue / create                              |
| GET/PATCH | `/api/v1/projects/:projectId`                    | Read / owner edits including recruitment state  |
| GET       | `/api/v1/me/projects`                            | Owned/joined projects                           |
| POST      | `/api/v1/projects/:projectId/applications`       | Eligible nonmember applies                      |
| GET       | `/api/v1/projects/:projectId/applications`       | Current owner only                              |
| GET       | `/api/v1/me/applications`                        | Own application history                         |
| POST      | `/api/v1/applications/:applicationId/accept`     | Current owner; atomic membership                |
| POST      | `/api/v1/applications/:applicationId/reject`     | Current owner                                   |
| POST      | `/api/v1/applications/:applicationId/withdraw`   | Applicant                                       |
| GET       | `/api/v1/projects/:projectId/members`            | Authenticated roster                            |
| DELETE    | `/api/v1/projects/:projectId/members/me`         | Leave, not current owner                        |
| DELETE    | `/api/v1/projects/:projectId/members/:userId`    | Owner removes non-owner                         |
| POST      | `/api/v1/projects/:projectId/transfer-ownership` | Owner transfers to existing member              |
| GET       | `/api/v1/conversations`                          | Own current conversations                       |
| GET/POST  | `/api/v1/conversations/:conversationId/messages` | Current members; history / idempotent text send |
| GET       | `/api/v1/events`                                 | Authenticated SSE stream                        |

Verify the selected Better Auth version's documented routes during integration; its native response/error shape is not silently rewritten. Disable/exclude unneeded optional features rather than advertising unsupported recovery/verification endpoints. Product route schemas/tests refine this inventory without adding unapproved behavior.

For retried acceptance, authenticate/authorize first. Returning the already committed result never re-adds someone who later left or was removed; rejoining requires a new application. Conflicting terminal transitions return 409. User IDs, application ownership, and project membership are never trusted from caller-provided identity fields.

## Risks / Trade-offs

- [Broad backend scope] → Small vertical slices with unit/integration tests and documentation in each commit group.
- [Cross-workspace server type graph] → Type-only exports, resolvable imports, workspace client type checking and browser-target build.
- [Concurrent state changes] → Constraints, coordinated locks/isolation, bounded retries, and real-PostgreSQL race tests.
- [Single-instance SSE is lossy] → Durable history and reconnect recovery; scaling ideas stay in the backlog.
- [No smoke/E2E acceptance] → Do not claim full deployed-stack journey coverage from in-process integration tests or image builds.
- [Hosted checks need remote access] → Use the approved repository after approval; unavailable credentials are a blocker, not permission to bypass CI.
- [No email verification or abuse controls] → Local MVP only; no external onboarding/deployment in this goal.

## Implementation Sequence and Review Boundary

1. Wait for user review and explicit approval. Then commit the planning baseline, establish workspaces, and add CI early.
2. Add Docker/PostgreSQL/Prisma and migration/integration infrastructure; extend CI when each real check becomes applicable.
3. Implement Better Auth/profiles, discovery/matching/direct chat, then project teams and project chat with the agreed rules.
4. Add SSE and complete permission/concurrency/client tests; document the local container startup and API contracts.
5. Run required local checks, push the final commit, inspect GitHub Actions, and report remaining limitations. Do not implement a frontend or deploy anything.
6. Sync/archive only after implemented behavior is verified; never mark planning completion as product completion.
