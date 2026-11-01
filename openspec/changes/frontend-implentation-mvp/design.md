# Design

## Context

See proposal.md for motivation and the capability deltas for observable behavior. The current interface is already React/TypeScript/Vite, not a plain HTML page: its Context/reducer, fixture DTOs, actor switching and simulated operations are the parts that must not become production state. API schemas are Elysia/TypeBox; `@aster/api-client` wraps Eden with `parseDate: false`. `@aster/contracts/events` provides the browser-safe message-event validator, not a catalogue of product DTOs.

Current product collections use cursor pages, the project catalogue has no search, and conversation list rows contain IDs and creation time only. Better Auth owns `/api/auth`; product `/api/v1` uses a different error envelope. Existing Compose has `db`, `migrate`, `api` and isolated test services. API auth defaults point to localhost:3000; the preview uses 127.0.0.1:5175 with no proxy, so those settings cannot simply be inherited.

`backend-review-fixes` is parallel work affecting string fidelity, cursor validation, authorization locks and bounded SSE delivery. Inspect its latest artifacts and actual Git state before apply. Do not assume a peer's reported revision has been merged; preserve the verified safeguards when adding multiple connections. Canonical product specs currently cover health/database lifecycle only; this change does not treat archived product plans as current authorization.

## Goals / Non-Goals

**Goals:** a modest feature-oriented application, one API contract authority, explicit session boundaries, reusable custom UI, bounded best-effort realtime and reproducible local runtime.

**Non-Goals:** a frontend business-rule replica, full ceremonial FSD, generic repositories/event buses, client-side authorization guarantees, a second backend-for-frontend, additional transport libraries or speculative infrastructure. See proposal exclusions rather than importing deferred backlog items.

## Decisions

### 1. Workspace and stack

Create `apps/web` / `@aster/web` under existing `apps/*`, sharing the root Bun install and lockfile. Pin selected dependency versions at implementation. Use React, strict TypeScript, Vite, React Router, Tailwind CSS, selected shadcn/ui source components and Motion. Do not add a standalone lockfile, Next.js/SSR, SCSS or every component from a library catalogue. Existing React/Vite experience and the SPA requirement make a second server framework unnecessary.

Use a self-contained web tsconfig and package-specific `@web/*` alias. Since Eden follows the API type graph, explicitly map encountered backend aliases in the consuming config rather than inheriting a shared base config. Keep browser runtime imports confined to the client and browser-safe event contract. Extend bundle checks to prevent Elysia/API runtime, Kysely, pg or Node/Bun runtime code entering browser output. Type checking remains separate from Vite build.

### 2. FSD-lite boundaries

```text
src/
  app/        router, providers, session lifecycle, global styles
  pages/      route composition and page-local components
  features/   user actions and their forms
  entities/   domain query options, adapters and reusable domain UI
  shared/     UI primitives, client setup and genuinely shared utilities
```

Dependencies flow from app/pages through features/entities to shared. Compose cooperating features in pages rather than cross-importing their internals. Create small public boundaries where useful; no blanket barrel-file ceremony, mandatory widgets/processes, empty folders or separate UI package. Entity models derive transport types from the client instead of duplicating API DTO interfaces. Presentation/form models may differ intentionally from transport values.

TanStack Query owns server state, RHF owns forms, URL search parameters own filters and navigation state, and local React state owns transient UI. Keep the QueryClient/session coordinator in app. A small route-scoped draft map can retain per-thread text without Zustand. Do not copy server data into a global store; add Zustand only if a demonstrated remaining shared-state requirement justifies it.

### 3. One visual authority

Use root `DESIGN.md` for visual rules and `prototypes/interface` for the latest working composition/landing/motion; the older swipe experiment supplies historical mechanics only where not superseded. These are visual references, not permissions to carry demo business behavior into the app. The latest interface refines the `aster.` wordmark and landing beyond the older document. Review discrepancies explicitly rather than silently changing fonts or reverting newer approved refinements.

Map the existing CSS tokens into Tailwind/shadcn semantic theme variables and customize component density, borders, radii, typography and states. Keep complex landing decoration in ordinary CSS when clearer, and swipe physics in Motion. Do not reproduce the token catalogue in OpenSpec or accept default shadcn styling as visual completion. Keep the light theme; do not add a dark-mode initiative.

Root `DESIGN.md` and `prototypes/` are Git-ignored local visual references, not committed application inputs. Copy the needed sources explicitly and safely into the implementation worktree; do not assume a fresh clone includes them. Builds must remain independent of these references. Ignoring does not delete local files. Any later local removal requires resolving live references and maintained design ownership first.

### 4. Transport, forms and sessions

Use `@aster/api-client` with same-origin URLs and cookie credentials. Eden is typed HTTP over Fetch, not a runtime validator. Do not add Axios as a parallel client. For Better Auth use its maintained browser client in a small identity adapter, with account/session server state coordinated through TanStack Query; native auth errors need separate normalization from product `{ error: { code, message } }`. Keep the adapter narrow rather than building a generic HTTP framework.

RHF rules provide required/length/format/cross-field checks and typed conversion into API payloads. Zod is omitted because no concrete need justifies it, not because Eden replaces validation. Server TypeBox/service checks remain authoritative. Align local limits with existing schemas and test important boundaries; a generic 422 response is a form-level error unless a field is genuinely identifiable. Do not import server schema runtime or fabricate field error maps.

Guests see `/`, `/sign-in`, `/sign-up`; guard product routes after session bootstrap without a protected-content flash. Preserve safe same-origin internal return paths. New users see onboarding guidance; incomplete profiles are not globally locked out. Preserve existing product route map from the preview (`/discover`, `/people/:personId`, `/matches`, `/profile`, `/profile/edit`, project/applications/my-projects and message routes) as an implementation default, with `/onboarding` and unknown-route recovery.

On sign-out or confirmed session expiry: close events, abort protected queries, advance a session generation, clear private cache and drafts, and reject late completions belonging to the old generation. Do not let a delayed mutation response repopulate a new account's cache. Cache keys and callbacks must respect the active account boundary. Ordinary resource denial invalidates the affected resource; it is not automatically a global session failure. Do not turn a network outage into sign-out.

### 5. Project search and query lifecycle

Extend catalogue query schema/service with optional `q` and `goalId`, using parameterized PostgreSQL conditions before limit/cursor application. Engineering default: trim `q`, bound it to 200 characters, treat blank as absent, and reject unknown goal IDs consistently with dictionary validation. Escape `%`, `_` and the escape character for literal case-insensitive substring matching over title OR description; combine with goal using AND. Preserve `(created_at,id)` newest-first ordering. No search engine or relevance ranking.

Query keys include normalized filters and account context. Changing filters resets cursors. Use load-more controls rather than totals or page numbers. Refresh affected queries after local mutations; refresh relevant active queries on navigation/focus/reconnect and explicit user action. No permanent polling and no expansion of SSE to non-message events. Pending mutation controls prevent accidental repeats; do not automatically retry non-idempotent mutations.

### 6. Conversation read model and ordering

Extend the public conversation summary with a discriminated direct/project context, authorized public peer/project display data, nullable last-message summary and `lastActivityAt`. Retain existing IDs and `createdAt`. Return only fields needed for the row; never expose another user's email/account row. Fetch a page through bounded server queries, not client N+1 profile/history requests. Direct URLs may use a small authorized conversation-detail projection sharing the summary model so they do not scan every conversation page.

Compute activity from the latest committed message timestamp, falling back to conversation creation. Use descending `(lastActivityAt,id)` ordering and a versioned conversation-specific cursor that old creation-order cursors cannot masquerade as. No global pagination helper semantic change. Add reviewed indexes/migrations only where the query plan requires them; do not reset the database or rewrite the baseline. Message arrival can move rows between pages, so invalidate/restart loaded summary pagination and deduplicate IDs; do not promise snapshot pagination during concurrent activity.

History remains HTTP-authoritative with existing descending API pages rendered chronologically. Prepending old pages preserves scroll anchoring. Pending send entries have a stable request ID and immutable submitted payload. Retry the same payload with the same ID after ambiguous network failure; edits are a new attempt/ID. Merge HTTP acknowledgement/refetch by persisted ID/request identity so event/response races cannot duplicate messages. Separate pending/failed/saved UI from unsupported delivery/read receipts. Preserve composer content on error and avoid stealing scroll from someone reading older messages.

### 7. Bounded SSE for tabs

Keep named `message.created` hints validated with `@aster/contracts/events`; do not replace HTTP+SSE with Socket.IO/Redis. Change the registry from user-to-single-stream to a bounded user-to-stream-set while preserving current authorization checks and the parallel review's delivery bounds.

Explicit initial engineering defaults: at most 8 streams per user and 128 streams per API instance, reject excess new connections with 429 before stream establishment without evicting healthy connections. Retain per-stream/ingress queue bounds of 32 and global active delivery work bound of 8, including detached reconnect work; coalesce heartbeats and stop detached work. Make these limits explicit in code/tests/docs. Fan-out must not delay committed HTTP acknowledgements. Delivery rechecks session/membership for each intended recipient stream; revocation and shutdown close/clean all applicable streams.

Use a small EventSource coordinator owned by the authenticated app, not one connection per mounted query. On stream open/reopen, message hints, focus and network recovery, reconcile authorized history and summaries through Query. HTTP is recovery even if events are lost. Use capped backoff with jitter for reconnects (initial 1s, cap 30s), avoid competing native/manual reconnect loops, and stop on logout or confirmed auth failure. Capacity/transient failures must not create a rapid retry loop. A stream error alone does not prove expiry; revalidate the session through HTTP. No replay or exactly-once event-delivery claim, no cross-tab leader election.

### 8. Explicit development seed

Keep normal migration/dictionary seed behavior unchanged. Add a separately invoked development command, also runnable through Compose with no host Bun. Require a deliberate development target and explicit dev-seed acknowledgement; reject test/production-looking or otherwise unsafe targets rather than weakening isolated-test guards. Never log live secrets.

Create a small deterministic scenario set with local-only documented credentials, normal Better Auth password hashing and the current services/transactions for collaboration transitions where applicable. Use a dedicated seed provenance/version marker to recognize completed or previously applied scenario groups and avoid treating arbitrary accounts with matching email as owned. Coordinate runs; record completed groups transactionally where possible. A rerun reports existing/changed groups and leaves them untouched, including removed memberships or changed application outcomes; do not reassert initial state. Conflicts or partial auth creation must be detected/reported, not adopted/reset. No normal startup sessions or fixture-mode privileges.

Tests must cover first run, repeat, concurrent invocation/partial failure handling, collisions and rerun after user edits/leave. Use isolated disposable databases, never the working DB. The fixed scenario set covers all agreed profile/discovery/project/application/chat states; new empty accounts remain usable without seeding.

### 9. Same-origin Caddy and verification

Build Vite output inside a multi-stage web image using the root workspace lockfile. Serve it with Caddy over explicit local HTTP, for example `http://localhost:8080`, forwarding `/api` and `/api/*` unchanged to `api:3000`. Route `/health` explicitly to the API; apply SPA fallback only after API/health matchers. Preserve cookies, separate Set-Cookie headers and original Origin; configure external host/protocol consistently and disable inappropriate buffering/caching/transformations for SSE.

Set Better Auth base URL/trusted origins to the public browser URL, not Compose DNS. Keep origin/CSRF checks enabled. Vite dev uses a proxy and a documented matching external origin (engineering default localhost:5175); changing mode requires correct API auth environment, not only a port mapping. Bind public local services to loopback. Keep `db -> migrate -> api` dependencies, add a suitable API healthcheck for web startup, and retain the API's liveness semantics rather than pretending `/health` is database readiness. Preserve working volumes and isolated test tmpfs.

Extend root check/typecheck/test:unit/build and CI to cover web while keeping existing command meanings stable. Update API Docker manifest copies for the new workspace and build both images. Verify no host-built dist dependency or missing ignored local docs in fresh-clone builds. Run actual Compose startup and browser interactions, SSE through proxy, graceful shutdown and persistent restart. Unit tests cover pure/query/form/session/reconciliation helpers; PostgreSQL tests prove backend authorization/races/search/seed semantics. Manual browser evidence covers the agreed two-account journey, viewport/keyboard/motion cases and network failures. No committed browser automation/smoke/E2E suite.

## Risks / Trade-offs

- Hand-maintained form checks can drift from API constraints -> derive payload types, keep checks small, test boundary behavior and retain authoritative server rejection.
- Activity ordering moves conversations between cursor pages -> use explicit cursor versioning, restart/deduplicate list pages and document non-snapshot semantics.
- SSE is lossy and instance-local -> bounded work and HTTP recovery; multi-instance/event replay remain deferred.
- Role revocation has no general push event -> server enforces immediately; UI clears denied data upon the next refresh/action, with no instant membership-update claim.
- Seed reruns can accidentally undo user activity -> provenance/group completion tracking, non-overwrite policy and database tests; no destructive reset command.
- Untracked design sources or ignored docs vanish in a worktree/fresh clone -> copy approved references explicitly, keep build/config independent of local docs and preserve originals.
- Parallel backend fixes can conflict -> inspect actual branch/artifacts before implementation and coordinate their integration; do not silently cherry-pick/merge or claim hosted verification.

## Migration Plan

After a separate apply approval, create a dedicated frontend branch/worktree. Preserve current edits and copy only relevant uncommitted planning/design inputs after checking targets; no automatic commits or broad staging. Resolve the backend-fix dependency before overlapping API changes. Implement vertical slices with tests/docs, add only reviewed additive migrations, then integrate Caddy/Compose and record actual acceptance evidence.

Existing conversation cursors are intentionally invalidated by the new list contract; the frontend restarts pagination. Ordinary database initialization remains dictionary-only. Development data is inserted only by the explicit command. Rollback removes/reverts only this change's application/config additions after inspecting edits; never remove database volumes, reset data or run destructive down migrations without separate authorization. Keep hosted acceptance open until an authorized latest push is green. Canonical spec sync/archive and removal of visual references happen only after implemented verification and the applicable user request.
