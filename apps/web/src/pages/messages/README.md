# Messages

Mount `MessagesPage` at `/messages` and `/messages/:conversationId` inside the
session-guarded Shell. Mount `MessageEvents` from
`features/messages/MessageEvents.tsx` once under that same authenticated Shell,
not within this page. This slice deliberately does not edit the router/session.

## Data and recovery

Rows render solely from the enriched conversation-list response; a directly
addressed thread fetches its authorized summary by ID. There are no per-row
profile/history requests, fabricated conversations, unread counts, presence,
typing, attachments, delivery/read receipts, or arbitrary create-chat controls.
An acknowledgement means **saved to the service**, not delivered or read.

Query roots are `[accountId, 'conversations', ...]` and
`[accountId, 'messages', ...]`, shared with project membership invalidation.
Activity reconciliation cancels the old list fetch, retains only the first page,
and obtains a fresh cursor chain. Overlapping rows deduplicate by ID/newest
activity. Cursor lists are not snapshots; explicit refresh restarts after cursor
errors. Desktop shows list/detail together; phone shows one pane with a back link.

History is authoritative HTTP, rendered chronologically despite descending API
pages. Older-history controls prepend and preserve the first visible message's
position. Refresh/new sends follow the bottom only when already near it; a
separate latest-message button is intentional. HTTP errors never mean an empty
thread. Observed 403/404 clears thread history, drafts and pending attempts,
hides stale context and disables sending; it does not globally sign out.

The app-level coordinator listens only for named `message.created` events and
validates them through `@aster/api-client/events`. It invalidates summaries and
active histories on valid hints, open/reopen, focus, network recovery and manual
refresh. Bursts coalesce with a trailing reconciliation. EventSource closes on
error to prevent native/manual competing retry loops. Manual backoff starts at
1 second, exponentially caps at 30 seconds including equal jitter, and retains
backoff across short-lived opens. Stream errors revalidate the session through
HTTP: confirmed session loss stops reconnecting, ordinary transport failure does
not sign out. Scope reset/unmount closes streams, timers and late callbacks.
An unavailable-stream banner offers HTTP refresh. Events are lossy single-instance
hints: no replay or exactly-once promise, cross-tab leader election, polling, or
non-message push. Each authenticated tab owns one bounded server stream.

## Sending and memory

RHF requires nonblank, lossless PostgreSQL-compatible text up to the current
service's 4000 UTF-16-unit limit (including whitespace). Submitted whitespace is
not trimmed. Server validation remains authoritative. Each submission freezes
its text/request ID. A failed item keeps its original text and retries only that
payload with the original ID; edits in the separate editor always get a new ID.
There is no automatic mutation retry. Pending/saved attempts block repeat retry
clicks. HTTP acknowledgements, history and duplicate events merge by persisted
ID and `(conversationId, senderId, requestId)` without duplicate bubbles.

Drafts are per-thread `SessionScope` memory. A scoped in-memory outbox preserves
pending/failed sends while navigating between threads. Confirmed HTTP records
retire local attempts; scope reset clears the outbox and drafts and rejects late
HTTP work. Neither is persisted to browser storage; reload/tab close loses drafts
and unconfirmed local retry IDs. After reload, HTTP history is the recovery source.

## Verification and outstanding acceptance

Scoped helper tests cover malformed events, capped jitter, duplicate reconnect
suppression, open/focus/reconnect recovery, auth versus network failures, reset
cleanup, summary/history deduplication, ambiguous/lost-response retries, immutable
payloads and validation boundaries. Run:

- `bun test apps/web/src/entities/conversation apps/web/src/features/messages`
- `bun run --filter @aster/web typecheck`
- Scoped ESLint/Prettier on the three messaging directories.

Manual acceptance remains incomplete: actual two same-account tabs and another
account; direct/team sends; lost-response and edited retry; older-history anchor
and no scroll theft during focus/refetch; direct links and back/forward; membership
revocation; expired session/logout/account switch during in-flight sends/events;
390/1440 and narrow/keyboard/overflow/reduced-motion review. No browser suite,
screenshots, database tests, container execution or hosted CI are claimed here.
Keep tasks 8.3 and 9.1–9.3 open until their required manual checks pass.
