# Backend review fixes

## Why

The 2026-10-31 backend review identified six issues affecting text fidelity, bounded SSE work, chat contention and membership query costs. The user explicitly authorized verification and fixes in a separate worktree with small commits.

## What Changes

- Reject product request strings that PostgreSQL cannot preserve exactly.
- Reject cursor dates outside PostgreSQL's timestamp range with `422 INVALID_CURSOR` before querying (approved Codex follow-up).
- Bound pending SSE work, coalesce heartbeats, stop disconnected work and acknowledge committed HTTP writes without awaiting notification fan-out.
- Use shared authorization locks while preserving exclusive message idempotency and membership revocation ordering.
- Add user-leading membership indexes through an additive migration.
- Avoid full project hydration for locked authorization-only operations.

## Capabilities

### New Capabilities

- `conversation-delivery`: Bounded best-effort notifications and nonblocking committed message acknowledgements.

### Modified Capabilities

- `database-lifecycle`: Explicit persisted product string fidelity and concurrent authorization compatibility.

## Impact

Backend schemas, conversation delivery/services, project authorization, SQL migration and unit/PostgreSQL integration tests. No frontend, deployment, backlog features, working database resets or publication. Existing interface/prototype edits are excluded. Push is not authorized by this request; hosted verification must remain explicitly unverified until a push is separately approved.
