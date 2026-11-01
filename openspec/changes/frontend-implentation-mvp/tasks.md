# Tasks

Implementation was explicitly approved on 2026-11-01 in a separate frontend worktree. Mark tasks complete only after their stated verification; commits and pushes remain separately gated.

## 1. Safe implementation foundation

- [x] 1.1 After apply approval, prepare a dedicated frontend branch/worktree and safely copy the relevant uncommitted change/design/preview inputs without overwriting edits; verify the worktree contains the reviewed artifacts and record its base revision and preserved inputs. Do not commit, merge or push implicitly.
- [x] 1.2 Reconcile the actual `backend-review-fixes` integration state before overlapping API work; record the chosen base/dependency and verify its cursor/text/authorization/SSE tests remain present and passing, without silently importing unapproved Git changes.
- [x] 1.3 Create `apps/web` / `@aster/web` with pinned selected dependencies, root lockfile, self-contained strict tsconfig and explicit aliases; verify root frozen install, web typecheck/build and API/client alias propagation. Document the workspace/dependency boundaries without Axios, Zod or speculative Zustand.

## 2. Shared visual and application foundation

- [ ] 2.1 Map existing design tokens/fonts into Tailwind and selected customized shadcn primitives, preserving the refined wordmark and Motion behavior; verify actual rendered Russian typography, focus/contrast/dialog states and 390/1440 screenshots against `DESIGN.md` and the latest interface. Record deviations and do not duplicate the design catalogue in specs.
- [ ] 2.2 Implement FSD-lite providers/router, responsive shell, guest/protected route composition, titles/focus and not-found recovery; verify direct nested URLs, back/forward and accessible mobile navigation. Document routes and remove all actor/demo/reset/simulator wiring from the real workspace.
- [x] 2.3 Add Eden setup, narrow Better Auth adapter, Query defaults, Russian error normalization and RHF validation helpers; unit-test product/native-auth errors, network-versus-auth failures, payload conversion and important field boundaries. Document server-authoritative validation and disabled automatic mutation retry.
- [x] 2.4 Add session-scoped cancellation/generation/cache cleanup and memory-only draft ownership; unit-test late query/mutation/event completions after logout/account switch and per-thread drafts. Verify no credentials/private drafts are persisted and document reload/dirty-form behavior.
- [ ] 2.5 Transfer the existing public landing with real entry links, original decorative examples and reduced motion; inspect 390/1440 screenshots, keyboard/anchor/CTA behavior, overflow and static reduced-motion artwork, documenting that illustrations are not product activity.

## 3. Real identity and profiles

- [x] 3.1 Connect registration, sign-in, session bootstrap and logout with safe return paths and incomplete-profile onboarding guidance; test redirect/auth-state helpers and manually verify cookie renewal, reload, wrong credentials, expired session and two-account isolation. Document that mail/OAuth/recovery remain absent.
- [x] 3.2 Implement own profile read/edit/onboarding with real dictionaries, existing field limits and separate discovery opt-in; unit-test completeness/form boundaries and manually verify save/reload, server rejection and allowed navigation with an incomplete profile. Update feature usage notes.
- [x] 3.3 Connect authenticated other-person profiles with public projections and unavailable states; verify no foreign email/private account data appears in responses or UI, and document that discovery opt-out is not a known-ID privacy block.

## 4. People discovery and matches

- [x] 4.1 Connect discovery filters/URL keys, cursor loading and eligibility/empty/error states; test AND/ALL/ANY filter mapping and query resets, and verify real API filtering without fixture fallback. Document discovery prerequisites and exhaustion semantics.
- [ ] 4.2 Connect once-only like/skip with pending guards, failure recovery and server-confirmed match celebration/list/chat links; unit-test duplicate commands and error recovery, and verify a real two-account reciprocal match plus persistence on reload. Inspect drag/flick/return/buttons/keyboard/reduced motion and native vertical touch scrolling.

## 5. Project search and catalogue

- [x] 5.1 Add optional bounded normalized `q`/`goalId` catalogue schemas and parameterized literal case-insensitive title/description search before cursor pagination; PostgreSQL-test multi-page matches, AND goal semantics, wildcard escaping, blank/unknown/invalid inputs and deterministic ordering. Update API docs and review any required additive index migration.
- [ ] 5.2 Connect catalogue URL search/goal filters, load-more, project detail/roster and my-project lists; test filter-key/reset helpers and verify loading/empty/error/search-across-pages behavior against real data. Document list semantics without invented totals.
- [x] 5.3 Connect create/edit/recruitment forms and owner-only controls using RHF/current API limits; test payload/boundary handling, verify save/reload and cross-view invalidation, and record owner/nonowner and close/reopen behavior.

## 6. Applications and current teams

- [x] 6.1 Connect application submission/history/withdrawal/resubmission and owner accept/reject views; unit-test UI state/error/invalidation helpers and verify real applicant/owner journeys, duplicate pending rejection and closed-recruitment conflicts. Retain PostgreSQL race coverage and document outcomes.
- [x] 6.2 Connect paginated roster, confirmed removal/leave/ownership transfer and current-role controls; verify two-account role changes and owner-before-leave restriction, including revoked chat access and no resurrection from accepted application history. Keep authorization/concurrency tests passing and document recovery from stale views.
- [x] 6.3 Implement relevant mutation/navigation/focus/reconnect refresh plus explicit refresh controls for non-message data; test invalidation mapping and manually verify remote changes become visible after refresh without permanent polling or claims of immediate push updates. Document the refresh limitation.

## 7. Conversation API read model

- [x] 7.1 Add explicit authorized direct/project summary schemas and bounded list/detail queries with peer/project display context, nullable latest message and activity timestamp; PostgreSQL-test empty/direct/team cases, direct links, revoked membership and private-field exclusion. Verify browser client inference and update API documentation.
- [x] 7.2 Add activity-tuple ordering and versioned conversation cursors, with only reviewed additive indexes if required; PostgreSQL-test tie-breaking, multi-page traversal, old/invalid cursor rejection and new-message ordering. Document cursor incompatibility and list restart semantics without changing unrelated pagination contracts.

## 8. Bounded multi-tab SSE

- [x] 8.1 Extend the reviewed SSE registry to multiple per-user streams with explicit per-user/instance connection limits, non-evicting overflow handling and preserved ingress/queue/active-work/heartbeat bounds; unit-test capacity, cleanup, reconnect churn, shutdown and nonblocking HTTP acknowledgement. Document exact limits and preserve prior review protections.
- [x] 8.2 Verify per-stream current session/membership authorization with PostgreSQL tests across multiple streams, revocation, delivery races and overload; document that notifications are lossy single-instance hints and do not promise replay or exactly-once delivery.
- [x] 8.3 Implement one authenticated app-level event coordinator with contract validation, bounded reconnect/backoff and HTTP reconciliation; unit-test malformed events, missed-event recovery, auth-versus-network failures and logout cleanup. Manually verify two same-account tabs do not evict each other and SSE remains message-only.

## 9. Conversation browser experience

- [x] 9.1 Connect enriched activity-ordered list and directly addressable thread context, with cache restart/deduplication and meaningful unavailable/error states; test summary reconciliation and verify phone single-pane/desktop two-pane navigation without per-row hydration. Document no unread/presence/read claims.
- [ ] 9.2 Connect paginated chronological history with upward loading and scroll anchoring; test page merge/deduplication and manually verify older-history loading, focus recovery and no scroll theft while reading. Document HTTP-authoritative recovery.
- [x] 9.3 Implement composer validation, pending/failed/saved entries and immutable request-ID retries; unit-test lost-response retry, duplicate event/ack/refetch merging, edited retry payloads and 4000-character/nonblank boundaries. Verify real direct/team messages, retained failed text, per-thread drafts and denied access after removal.

## 10. Explicit development data

- [x] 10.1 Add a documented explicit development-seed command with target acknowledgement, normal auth hashing, collision/provenance handling and coordinated non-overwriting reruns; isolated PostgreSQL-test first/repeat/concurrent runs, partial failure, collisions and preserved edits/removed membership. Verify ordinary migrations/dictionary seed still create no demo collaboration/auth records.
- [x] 10.2 Add the fixed profile/discovery/match/project/application/direct/team-history scenario set and documented local-only credentials; verify referential/business invariants and that separate browser profiles can use all scenarios through real API calls. Document the Compose command and absence of a reset or automatic reseed.

## 11. Complete local runtime and continuous checks

- [x] 11.1 Add the multi-stage static-web/Caddy image, root-workspace-aware API build changes and Compose web service while preserving migration order/volumes/test isolation; verify clean image builds and actual startup without host Bun. Document loopback address, prerequisites, lifecycle and safe stop/restart commands.
- [x] 11.2 Configure same-origin `/api` and `/health` routing, SPA fallback, cookie/origin propagation and unbuffered SSE, plus Vite proxy/auth environment parity; verify deep-link reload, unknown API error, registration/session renewal and live events through both documented modes without disabling CSRF/origin checks. Update safe `.env.example` and proxy notes.
- [x] 11.3 Integrate web into root check/typecheck/test:unit/build and existing GitHub Actions, including both image builds and browser-runtime dependency rejection; run frozen install and all local commands with explicitly isolated integration targets. Verify fresh-clone inputs do not depend on ignored docs or host-built dist, and document exact command coverage.

## 12. Integrated acceptance evidence

- [ ] 12.1 Run the complete real two-account browser journey from empty initialization and separately from explicit development seed: register/profile/discover/match/apply/accept/transfer/remove/direct/team messages. Verify reload, conflict/error/expiry states, account isolation, multi-tab disconnect/recovery, safe retries and persistence across graceful Compose restart; record precise evidence and limitations without introducing an automated browser suite.
- [ ] 12.2 Review all in-scope pages against visual references at 390/1440, spot-check 320/768/wide desktop and inspect screenshots, actual Cyrillic rendering, keyboard/dialog focus, reduced motion, touch scrolling and overflow; record browser/device scope and any unresolved defects rather than equating emulation with physical-device coverage.
- [x] 12.3 Re-run all required local checks and both image builds after final fixes and preserve their actual results in the change verification record. If any check or requirement remains blocked, keep its task open and distinguish implementation completion from evidence gaps.
- [ ] 12.4 Only after separate commit/push authorization, verify GitHub Actions succeeds for the exact latest pushed commit; record run/revision evidence. Until then leave this task open and explicitly label hosted verification unavailable/unverified.

## Workflow follow-up

- Present all artifacts for review and wait for a new apply request; do not mark any task complete from planning alone.
- Keep canonical specs unchanged until corresponding behavior is implemented and verified; sync/archive only through the requested workflow after acceptance requirements are satisfied.
- Keep the Git-ignored interface/design references locally available for visual transfer and copy them explicitly into the worktree when needed; builds must not depend on them. Any later local deletion requires resolving live references and maintained design ownership first.
- Deferred search/realtime/draft/i18n/SSR/tooling ideas remain in local `docs/backlog.md`, not automatic follow-up implementation authority.
- No database reset, unrelated edits, package/image publication, deployment, implicit commits or pushes are authorized.
