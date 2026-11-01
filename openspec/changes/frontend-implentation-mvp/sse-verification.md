# Bounded multi-tab SSE — backend tasks 8.1/8.2

## Contract and bounds

The authenticated `GET /api/v1/events` endpoint now keeps independent stream sets for each user instead of replacing an existing stream when another tab opens. Each stream retains its own session identity, authorization work, timer, queue and lifecycle.

Explicit engineering limits:

- **8 open streams per user**, across sessions.
- **128 open streams per API instance**, across users.
- A new connection exceeding either limit receives **HTTP 429**, JSON product error code `SSE_CAPACITY_EXCEEDED`, before an SSE body or heartbeat timer is established. Healthy existing streams are not evicted by a connection attempt. Cancellation/abort frees only that stream's slot; shutdown closes all streams and permanently rejects subsequent connections with HTTP 503.
- **32 pending ingress publications**, with **one active recipient lookup**. Ingress saturation closes connected streams and discards queued publications for HTTP recovery; this is retained overload behavior, not the connection-capacity policy.
- **32 pending events per stream**, with **one active serial delivery**. Queue or readable-buffer saturation closes that stream instead of retaining unbounded work. The readable stream's high-water mark is also **32 frames**.
- **8 globally active delivery transactions**, including disconnected transactions until they settle. There is no waiting semaphore: scheduling additional delivery work at saturation closes the stream requiring that work, without evicting an active stream to admit it. Consequently nine connected recipients are allowed, but a simultaneous nine-stream fan-out can close an excess stream. Connection capacity is not a promise that every connected stream can receive every event.
- **15-second heartbeats**, coalesced rather than accumulating behind blocked authorization. Event authorization also subsumes pending heartbeat work. Abort/cancel removes timers/listeners, discards queued events and prevents further SQL/enqueue after already-running work resumes.

Recipient lookup snapshots individual streams, not mutable sets. Streams opened while lookup is pending recover through HTTP, rather than joining an old publication accidentally. Recipient selection still considers only connected conversation members, once per publication; every intended stream independently rechecks its own current session ownership/expiry and current conversation membership. Session shared locks and project authorization shared locks are retained through frame enqueue to coordinate racing revocations. A project membership denial suppresses that conversation's event without closing streams still authorized for other conversations; session loss closes each affected stream when it next checks authorization.

HTTP message writes retain the existing post-commit, non-awaited publication path. No route change was needed. SSE is a **lossy, single-instance invalidation hint**, not durable history, an outbox, replay, or exactly-once delivery. Clients reconcile through authoritative HTTP history after missing events, disconnect, reconnection or overload and deduplicate message IDs. No presence, typing, read/delivery receipts or new event types were added.

## Focused local verification

Verified on 2026-11-01 in the approved shared frontend worktree using Bun 1.4.4. All PostgreSQL checks below targeted only the supplied disposable `aster_test` database on `localhost:56443`, user `aster_test`. These runs used the existing integration fixtures and did not reset a database, run migrations, or touch the working database. Integration execution was coordinated exclusively; the database was released to the coordinator afterward.

Passed commands:

```sh
bun test apps/api/tests/unit/conversation-streams.test.ts
ASTER_INTEGRATION=1 DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" TEST_DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" bun test --isolate apps/api/tests/integration/conversations.test.ts apps/api/tests/integration/kysely-conversations.test.ts
bun --bun eslint apps/api/src/modules/conversations/streams.ts apps/api/src/modules/conversations/routes.ts apps/api/tests/unit/conversation-streams.test.ts apps/api/tests/integration/conversations.test.ts --max-warnings 0
bun run --filter @aster/api typecheck
bun --bun prettier apps/api/src/modules/conversations/streams.ts apps/api/src/modules/conversations/routes.ts apps/api/tests/unit/conversation-streams.test.ts apps/api/tests/integration/conversations.test.ts openspec/changes/frontend-implentation-mvp/sse-verification.md --check
git diff --check
```

`ISOLATED_TEST_DATABASE_URL` denotes only the provided disposable test connection, not a development database. Unit result: **3 passed, 0 failed, 1252 assertions**. PostgreSQL result: **22 passed, 0 failed, 600 assertions** across two files. The expected `sse.recipients` error diagnostic came from the retained recipient-lookup-failure test; it was not an unexpected test failure. Scoped ESLint and API typecheck passed. An initial API typecheck encountered the concurrent summary implementation's exact-optional-property error; its owner corrected that file, and the subsequent API typecheck passed without SSE-owner edits to it.

New unit coverage proves the ninth user stream and 129th instance stream are refused without SSE or eviction, single-slot cancellation, shared-signal abort of all sets, shutdown sealing, 160 explicit reconnect/cancel cycles, 160 already-aborted connections, and timer cleanup. These lifecycle tests deliberately use an unreachable local SQL URL and perform no database queries; they do not establish authorization invariants.

New/updated real-PostgreSQL coverage proves:

- Eight same-account streams remain usable after a ninth route request receives 429; a canceled slot can be reused.
- Two tabs of each of two sessions receive events independently; both streams of a session racing deletion wait for PostgreSQL authorization locks and close without an event after deletion commits, while the other session remains usable. A mismatched session owner and expired sessions are rejected per stream.
- Multiple same-account streams suppress events after project membership revocation races recipient selection, yet continue receiving events for another authorized conversation.
- Nine connected recipient streams cause exactly eight blocked authorization transactions and one overload closure; the eight admitted streams survive and can receive later hints.
- Explicit reconnect cancellation preserves the prior global bound of eight unfinished detached transactions over forty connection attempts and does not start subsequent authorization queries after disconnect.
- Existing regressions still pass for per-stream queue saturation, coalesced heartbeats under blocked SQL, bounded blocked ingress, slow consumers, session expiry/sign-out, shutdown sealing, recipient query failure, committed-only publication, idempotent retries, and HTTP history recovery. Nonblocking HTTP acknowledgement is established by the existing PostgreSQL test holding recipient authorization paused until after the committed HTTP response, rather than a mock-only unit claim.

At the coordinator's request, the existing conversation-list key assertion was updated for the concurrently implemented summary contract; summary service/schemas were not edited by this task owner.

## Boundaries

This is focused backend verification, not full-repository acceptance. No frontend implementation, manual two-tab browser/proxy exercise, full builds, container startup/restart, hosted CI, commits or pushes were performed by this task owner. The task checklist and main verification record are intentionally untouched. Canonical specs were not synchronized. Frontend task 8.3 and whole-change completion remain outside this assignment.
