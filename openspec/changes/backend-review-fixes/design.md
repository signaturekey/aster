# Design

## Context

See proposal.md. Existing SSE starts one transaction per notification and overlapping heartbeat, while HTTP awaits all recipients. All chat access takes exclusive source locks. Product schemas permit NUL and malformed UTF-16 strings.

## Goals / Non-Goals

Preserve exact valid text, idempotency, current-state authorization and public inferred contracts. Do not introduce an outbox, new framework, normalization, database resets or reliable SSE guarantees.

## Decisions

- Share a PostgreSQL-safe string schema constraint across product request strings, preserving existing field limits and URL/nonblank rules. Reject NUL and unpaired surrogates rather than silently changing data. Keep API contract imports type-only and run all workspace checks/browser-client builds.
- Bound notification ingress and per-connection pending events at 32, with one active recipient lookup and one active delivery per connection. Coalesce heartbeat work. Close an overloaded connection rather than buffering indefinitely; HTTP history remains authoritative. Recheck closed/replaced connections before acquiring/querying SQL resources and after waits. Already-running SQL may finish, but cannot enqueue after disconnect.
- Enqueue notifications synchronously after commit without awaiting recipients in HTTP. Current session and membership checks still happen transactionally immediately before enqueue.
- Use project FOR SHARE for chat authorization, conflicting with exclusive membership mutations but compatible with other readers. Lock conversation FOR UPDATE separately only for sends to serialize request-id checks/inserts. Direct membership is immutable and needs no authorization lock; direct sends take only the exclusive conversation write lock, avoiding shared-to-exclusive conversion deadlocks.
- Add user-leading membership indexes in a new ordered migration, never edit an applied baseline. Separate locked project authorization state from full hydration for public updates.

## Risks / Trade-offs

- Lossy notifications under overload → close affected streams and recover through HTTP history; no durability promise.
- Running SQL can wait on locks after disconnect → bound active work and skip further queries/enqueue after closure; queued work is cleared.
- Shared lock conversion deadlocks → sends acquire shared project then exclusive conversation in a consistent order; membership mutations retain project-first order.
- Hosted CI requires outward publication → no push without approval; explicitly leave hosted verification open.

## Migration Plan

Apply additive indexes through the normal migrator, including upgrade/rerun tests. Rollback application code does not require dropping harmless indexes. Verify unit, real-PostgreSQL races, formatting/lint/types/builds, Docker build and an isolated local container lifecycle. Never operate on working database containers or volumes.
