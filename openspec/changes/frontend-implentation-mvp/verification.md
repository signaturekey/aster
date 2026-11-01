# Execution and verification

## 2026-11-01 — implementation start

- User explicitly approved implementation in a separate worktree; no commits or pushes authorized.
- Worktree: `.claude/worktrees/frontend-mvp`, branch `feat/frontend-mvp`, base `2ea5c64`.
- Base already contains backend review fixes through the Codex cursor follow-up. No merge/cherry-pick was needed.
- Copied reviewed frontend/design/swipe change artifacts, current `CLAUDE.md`, OpenSpec config, ESLint config and ignore rules. Copied local ignored `DESIGN.md` and both previews excluding node_modules/dist/.vite. Original checkout's unrelated database README deletion and placeholder deletions were not copied.
- Base frozen install passed with Bun 1.4.4.
- Base unit checks: 36 passed, 0 failed.
- Base integration checks: 97 passed, 0 failed on an isolated Compose project `aster-frontend-tests`, disposable tmpfs PostgreSQL `aster_test`, loopback port 56443. Applied 2 migrations and dictionary seed only. Existing working services/volumes were not used.
- Hosted CI is unverified and awaits separate commit/push authorization.

## Verified implementation slices

- Workspace scaffold: pinned dependencies/root lockfile, frozen install, all workspace typechecks, API/client build and web build passed. No separate web lockfile or Axios/Zod/Zustand.
- Foundation: 8 unit tests cover error normalization, form limits/links, safe redirects, late session successes/failures and per-thread draft isolation. Web typecheck and scoped ESLint passed.
- Search API: focused 8 unit and 28 PostgreSQL tests passed; details in `search-verification.md`.
- Conversation summaries/cursors: focused 7 PostgreSQL tests and client inference checks passed; details in `conversation-summary-verification.md`.
- Bounded multi-tab SSE server: 3 unit and 22 PostgreSQL tests passed; details in `sse-verification.md`.
- Manual one-off Chromium inspection (local ignored tooling, no committed browser suite): landing at 1440/390 with reduced motion rendered without horizontal overflow; screenshots reviewed. Registration -> onboarding -> saved complete profile -> reload -> logout passed with zero JS page errors and zero localStorage/sessionStorage entries. This does not yet cover full identity expiry/two-account or complete landing interaction acceptance.
- Browser inspection exposed a StrictMode session-bootstrap race: the cancelled initial request could dismiss a later bootstrap's loading guard. Fixed stale completion handling and reran the successful registration/reload journey.
- Isolated dev runtime: Compose `aster-frontend-dev` PostgreSQL on 56442, API host process on 3100, Vite on 5175. Working project services remain untouched. Initial full image build caught a concurrent incomplete project-query type annotation; full image/runtime verification still pending after all slices settle.
- Unverified visual/manual and broader regression tasks remain open; no complete product or hosted success claimed.

## Integrated results — 2026-11-01

### Automated checks

- Final root `bun run check`, `bun run typecheck`, `bun run test:unit`, isolated `bun run test:integration`, and `bun run build` passed. Unit result: **98 passed, 0 failed**; PostgreSQL result: **118 passed, 0 failed**. API/client/web builds passed; browser-client metadata contains 132 inputs and no server runtime. Vite also rejects server-runtime inputs.
- Foundation suite expanded to 17 tests, including StrictMode replay, overlapping refresh ordering, native authentication versus bootstrap, account replacement, logout failure, stale completions and invalid-credential 401 feedback. Frontend unit total is 54.
- Additive migration `003_dev_seed` creates provenance only. Initial full integration run caught four stale exact-history expectations, then one additional stale history assertion; updated explicit migration/table expectations and reran all 118 successfully. No working database reset or test weakening.
- No Playwright/browser framework was added to root/web dependencies or CI. Local one-off browser tooling/screenshots live under locally excluded `.claude/browser`; they are inspection evidence, not a committed smoke/E2E suite.

### Real browser journeys

Inspected headless Chromium on this macOS machine, not a physical phone or other browser engines:

- Real registration/onboarding/profile save, reload and logout; empty browser storage. Native wrong password produces correct Russian feedback. Loss of session cookie redirects to sign-in and removes private history.
- Two independent accounts with narrow discovery filters: one-sided decision, then a real reciprocal decision and server-confirmed match dialog; match list survives reload. Driver attempts expecting an unfiltered exhaustion label initially failed because prior development accounts remained; corrected filtering/expected filtered-empty treatment without resetting data. Gesture/flick/touch acceptance remains open.
- Real catalogue/search and create -> apply -> withdraw -> reapply -> accept -> transfer ownership -> former-owner leave -> close/reopen -> edit -> reload -> search. Seeded owner/applicant acceptance and revoked-member behavior separately inspected. No JS page errors in successful journeys.
- Direct and team message writes; recipient delivery and second same-account tab delivery; retained per-thread drafts; missed offline messages recovered after reconnect. Team removal followed by refresh removes history/summary and disables composer.
- Older HTTP history pages loaded (44 messages); retry after injected transport failure reused the exact request ID and rendered one saved entry. Session expiry check rendered no former private message. Exact visual scroll-anchor stability during incoming messages while reading older content is still open.
- All product route layouts captured at 390/1440 and selected routes at 320/768/2560 without document overflow or JS page errors. Reviewed representative landing/profile/catalogue/project form/chat screenshots. Reduced-motion landing/deck and filter-dialog Escape/focus return checked. Full per-page visual/font/contrast/keyboard/touch matrix remains open, so layout screenshots alone do not complete visual tasks.
- Data-router blockers cover history navigation as well as links/reload; successful saves explicitly acknowledge the dirty form before immediate navigation. Explicit link and Back-dialog inspection confirmed that cancelling restores `/profile/edit` and preserves entered text. The earlier driver timeout was an incorrect expectation that cancelled navigation would finish loading.
- Landing anchor navigation worked; real deck short-drag spring return retained the person, accepted drag and ArrowLeft each advanced one acknowledged person, and computed touch-action was `pan-y`. Reduced-motion variants were separately inspected. Physical-device native touch/flick acceptance remains open.
- Chromium platform-font inspection of the Russian heading reported Plus Jakarta Sans custom font for supported glyphs and `.SF NS` Bold fallback for Cyrillic, matching the documented reference limitation. Filter modal focuses its first control, Escape closes it and focus returns to the trigger after teardown.

### Container runtime

- API/tools and web/Caddy images built from source/root lockfile, excluding local design references and docs. Full isolated Compose project `aster-frontend-dev` started successfully: web http://localhost:8180, published API port 3101, persistent development PostgreSQL port 56442. These override the documented default web port 8080; no normal project services/volumes were touched.
- Caddy `/health` returns JSON, unknown `/api/unknown` returns API 404 rather than SPA HTML, and a nested SPA URL returns HTML. Actual browser auth, direct send and second tab worked through Caddy with zero JS errors.
- Explicit seed CLI applied to the identified local `/aster` database; rerun via the Compose tools service skipped all five groups, preserving product progress. Seed unit/integration evidence covers collisions, concurrency, rollback and edits/deleted memberships. See tracked `apps/api/dev-seed.md` for credentials/commands.
- Graceful `docker compose stop` followed by `up -d --wait web` preserved both session and a committed message. No volume deletion/down-v/reset was used.
- Aged only the current inspection sessions in the dedicated dev database, then verified renewal through both localhost:5175 Vite and localhost:8180 Caddy: JSON returned 200 with HttpOnly renewal cookies, SSE returned 200. Origin/CSRF checks stayed enabled.
- Incomplete seeded Nina could enter the requested catalogue after sign-in. A deliberately injected 422 on profile save preserved the entered text. Signing out and into Anna removed Nina's view; another person's professional page and unavailable-ID recovery were inspected without foreign email fields. Server privacy/invariant integration checks also passed.
- Remaining at local verification time: full empty-database browser journey separately from the seeded journey, complete manual accessibility/motion/long-list matrix, and hosted CI after separately authorized commits/push. The hosted boundary was subsequently verified below; manual acceptance gaps remain open.

## Hosted verification — 2026-11-01

- User explicitly authorized committing and pushing to verify the hosted task. Frontend commits were fast-forwarded to main; the README removal and obsolete placeholder cleanup were committed separately.
- Latest pushed revision verified: `c70a98871cb47a9106c5b714c56dfc9f9c12ad28` (`main`). Local HEAD and remote main matched this revision when checked.
- GitHub Actions **Application checks** run [41287165906](https://github.com/signaturekey/aster/actions/runs/41287165906) completed with **success** for that exact SHA.
- Successful steps include frozen install, ESLint/Prettier, workspace types, unit tests, isolated PostgreSQL setup/migrations/integration tests, API/client/web builds, Compose validation and both API/web Docker image builds. No publication or deployment occurred.
- Task 12.4 is verified. This does not complete the remaining manual/product acceptance tasks. These local evidence edits are not a claim that a later, unverified pushed revision is green.
