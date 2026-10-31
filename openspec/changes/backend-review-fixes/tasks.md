# Tasks

## 1. Text fidelity

- [x] 1.1 Reject unsafe persisted product strings; verify schema/unit and HTTP PostgreSQL regressions including exact valid Unicode retries.

## 2. Conversation authorization and delivery

- [x] 2.1 Use compatible shared authorization locks with separate send serialization; verify PostgreSQL concurrent authorization, revocation and idempotency tests.
- [x] 2.2 Bound pending SSE work, coalesce heartbeats and discard disconnected work; verify deterministic blocked-query and overload tests.
- [x] 2.3 Return committed HTTP sends without awaiting fan-out; verify blocked-recipient HTTP regression and existing SSE tests.

## 3. Membership query costs

- [x] 3.1 Add user-leading membership indexes in an additive migration; verify upgrade, rerun and catalog tests.
- [x] 3.2 Load only locked authorization state outside public project updates; verify query observations and existing project behavior tests.

## 4. Integrated verification

- [x] 4.1 Pass root check, typecheck, unit, isolated PostgreSQL integration and API/client build commands; record exact results.
- [x] 4.2 Verify Docker build and isolated local startup/migrations, authenticated operation, persistent restart and graceful shutdown; record evidence without changing working services.
- [ ] 4.3 Verify GitHub Actions for the latest pushed commit after separate push approval; until then report hosted verification blocked.

## 5. Codex cursor follow-up

- [x] 5.1 Reject cursor dates outside the PostgreSQL timestamp range before queries; verify boundary unit tests, HTTP PostgreSQL 422 regressions and workspace checks/builds.

## Execution history

- 2026-10-31: User approved reviewing and fixing peer findings in a separate worktree with small commits. Peer supplied six findings; implementation and tests must independently verify them. No push authorized.
- 2026-10-31: User approved the remaining Codex cursor-range finding in the same worktree. Implemented in `53ba29b`; all local checks and actual container HTTP boundary verification passed. Hosted CI still awaits push approval.
