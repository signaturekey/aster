# Conversation summary API and verification

## Scope

Implemented the backend read model for tasks 7.1/7.2 in the shared `frontend-mvp` worktree. This note describes this slice only; it does not assert frontend acceptance, full-change completion or hosted CI verification. No commits, pushes, migrations or database resets were performed.

## API contract

- `GET /api/v1/conversations` remains authenticated and returns `{ items, nextCursor }`, with the existing `limit` default 20 / maximum 50 and bounded cursor input.
- `GET /api/v1/conversations/:conversationId` returns one authorized summary for deep links, independently of whether it appears on the first list page. Anonymous requests return 401; missing or unauthorized conversations return 404.
- Both endpoints share the explicit TypeBox `conversationSummarySchema`. Existing `id`, `matchId`, `projectId` and ISO-string `createdAt` remain present.
- A direct summary has `kind: "direct"`, non-null `matchId`, `projectId: null`, `peer: { userId, displayName }` and `project: null`. Missing professional profiles retain the peer ID with an empty display name, consistent with profile defaults; account names/emails are not a substitute public profile.
- A team summary has `kind: "project"`, `matchId: null`, non-null `projectId`, `peer: null` and `project: { id, title }`.
- `latestMessage` is either `null` for an empty thread or `{ id, senderId, text, createdAt }`. Text is preserved exactly. No request IDs, account records, emails, session data, unread counts or delivery/read claims are added.
- `lastActivityAt` is the latest committed message timestamp, falling back to conversation creation. Latest-message ties use descending message ID. List ordering is descending `(lastActivityAt, id)`.

The parent integrated the small GET route with `getConversationSummary` from `@api/modules/conversations/summaries` and `conversationSummarySchema` from the schemas module. Existing list routing remains unchanged; service `listConversations` delegates to the read model. Message history, writes and SSE retain their existing service boundaries.

## Authorization and query bounds

Each list or detail read executes one parameterized SELECT, authorizing and projecting within the same PostgreSQL statement snapshot. It requires current conversation membership and, for projects, current project-roster membership. Removed members receive neither preview nor context; even an accidentally stale conversation-member row does not restore project-roster access. Concurrent reads describe the state at statement start, not a promise that permissions cannot change while a response is in flight.

Peer context joins only professional profiles and match endpoints, never private account tables. A lateral latest-message lookup returns at most one message per authorized conversation; list output is limited to `limit + 1`, detail to its requested unique conversation. The database may evaluate activity for all of the user's authorized conversations to sort them; this is not a materialized activity index or a bounded total row-scan claim. There are no application/client per-conversation hydration round trips.

No new index is justified for this slice: the existing `conversation_members(user_id, conversation_id)` index selects user membership, roster primary key supports the project-membership check, and `messages(conversation_id, created_at, id)` supports the latest-message backward lookup. Existing match/project/profile primary keys serve context joins. No applied migration or baseline was edited. Production-scale sorting optimization remains a measured future concern rather than speculative schema changes.

## Cursor incompatibility

The conversation-specific canonical base64url cursor encodes `["conversation-activity-v1", ISO timestamp, conversation ID]`. Old two-element creation-order cursors, wrong versions, noncanonical/malformed payloads, unsafe text IDs, and dates outside the shared reviewed PostgreSQL/JavaScript range fail with `422 INVALID_CURSOR`. Other endpoints and history keep their existing cursor contract.

Activity can move conversations between pages. Clients must invalidate/restart the loaded conversation-list cursor chain after activity changes and deduplicate by ID; this is not snapshot pagination during concurrent messages. Do not silently reuse previously persisted creation-order cursors.

## Verification performed

Final checks on 2026-11-01:

- API TypeScript check passed during implementation.
- `bun run typecheck` passed for root/API/contracts/client/client tests/web, including direct/project narrowing and the inferred deep-link endpoint.
- `bun run test:unit` passed: 63 tests, 0 failures, 1,648 assertions across 15 files at execution time. Focused new summary cursor and client-inference tests: 3 passed, 35 assertions.
- Focused PostgreSQL integration command used only the already prepared disposable `aster_test` database at `127.0.0.1:56443`, with `ASTER_INTEGRATION=1`, and ran `conversation-summaries.test.ts` plus `pagination.test.ts`: 7 passed, 0 failures, 80 assertions. No global truncate/reset; fixtures use distinct registered users. Database usage was coordinated with the SSE agent and released before seed tests.
- Integration coverage: empty/direct/project rows; absent/stored public profiles; exact preview text; list/detail equivalence; authorized deep link outside first page; anonymous/nonmember/missing-ID denial; revoked roster and stale chat membership; one SELECT for list/detail; private-field exclusion; deterministic latest-message ties; multi-page conversation ties; movement after a committed new message; old/wrong-version/unsafe cursor rejection; actual pg binding at accepted timestamp boundaries.
- Existing pagination boundary regressions now send activity cursors only to the conversation endpoint, retaining creation cursors and checks for unrelated endpoints.
- Focused ESLint passed for all owned source/test files.
- `bun run build:api` passed. `bun run build:client` passed with 132 browser inputs and no server runtime.
- `git diff --check` passed.

Initial focused integration failures were test setup/integration timing, not skipped checks: the detail route was not yet wired, and the project fixture lacked a complete owner profile. Both were corrected and the focused suite reran successfully. Initial client type checking exposed a widened fixture discriminant; retaining its literal type fixed the test, and all workspace types then passed. Type-aware lint required awaiting the actual rejected service promise rather than Bun's non-thenable assertion return; assertions were preserved and lint rerun.

The entire integration suite, rendered browser conversation UI, full Docker lifecycle, root formatting check and latest-pushed-commit GitHub Actions were not run by this agent. Task checkboxes and overall verification remain owned by the parent; this file is evidence, not an implicit completion claim.
