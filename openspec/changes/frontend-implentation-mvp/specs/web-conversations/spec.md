## Purpose

Provide authorized direct and team conversations with useful summaries, reliable persisted message actions and bounded multi-tab best-effort updates recovered through HTTP history.

## ADDED Requirements

### Requirement: Authorized conversation summaries

Conversation pages SHALL contain a usable title source, latest-message summary and last-activity timestamp without per-row client hydration. Direct summaries SHALL identify the other person's public professional data; team summaries SHALL identify the project. Only current authorized members SHALL receive summaries, previews or history, and other people's private account data SHALL be excluded.

#### Scenario: Direct and team list

- **WHEN** a user loads their conversation list
- **THEN** each row can render from the list response, including a defined empty-conversation state, without fetching each participant and last message separately

#### Scenario: Membership revoked

- **WHEN** a former member refreshes a list, reads history or attempts a write after revocation
- **THEN** the server denies unauthorized access and the client removes inaccessible thread data and disables sending when the denial is observed

### Requirement: Activity-ordered cursor pagination

Conversations SHALL be ordered newest activity first, with creation time used for empty threads and an ID tie-breaker. Pagination SHALL use the same ordering tuple. The client SHALL restart and deduplicate loaded list pages after activity invalidation. Cursors from the former creation-order contract SHALL be rejected rather than silently reinterpreted.

#### Scenario: Old conversation receives a message

- **WHEN** a new message is committed to an older conversation and the list refreshes
- **THEN** that conversation moves according to its last activity and a fresh cursor chain follows the same ordering

#### Scenario: Old cursor after upgrade

- **WHEN** a caller supplies a cursor from the former conversation-list contract
- **THEN** an actionable invalid-cursor response requires restarting pagination

### Requirement: Paginated readable history

Threads SHALL show real HTTP history in chronological display order, with older pages loaded upwards without jumping away from the visible reading position. Direct links SHALL resolve authorized thread context without requiring prior list navigation. Sending and history failures SHALL be distinct from a genuinely empty thread.

#### Scenario: Load older messages

- **WHEN** a user requests older history
- **THEN** older messages are prepended without duplicates while the visible reading position is preserved

### Requirement: Idempotent sending and retry

Messages SHALL accept nonblank text up to the existing 4000-character limit. A local pending item SHALL be clearly marked as sending until HTTP confirmation. Failure SHALL retain recoverable text and allow retry with the same request ID and text. Confirmed and pending entries SHALL reconcile without duplicates; edited content SHALL NOT reuse an ID tied to a different payload.

#### Scenario: Response lost after commit

- **WHEN** a message commits but the sender loses its HTTP response and retries
- **THEN** retry uses the original request ID and payload, resolves to the same persisted message and does not display two copies

#### Scenario: Duplicate signal and response

- **WHEN** an HTTP acknowledgement and an event-triggered refresh both reveal the sent message
- **THEN** the pending item becomes one confirmed entry without claiming delivered/read status

### Requirement: Bounded multi-tab message events

The SSE transport SHALL permit simultaneous authenticated tabs without replacing an existing stream merely because another opens. Connection counts, pending delivery work and queues SHALL remain bounded. Exceeding capacity SHALL have an explicit non-evicting refusal/closure policy. Delivery SHALL recheck session validity and current membership, and HTTP writes SHALL NOT wait for fan-out.

#### Scenario: Two tabs

- **WHEN** two authorized tabs for the same account subscribe and a relevant message commits
- **THEN** both can receive its notification without reconnect-driven mutual eviction

#### Scenario: Capacity or revoked access

- **WHEN** connection/work capacity is exceeded or authorization is revoked
- **THEN** work remains bounded, unauthorized events are not delivered and capacity handling does not repeatedly replace healthy existing streams

### Requirement: HTTP recovery from lossy events

Message events SHALL be treated as invalidation hints, not durable history. The application SHALL validate event payloads and refresh relevant HTTP history/summaries after events, reconnection, focus and network recovery. Reconnection SHALL be bounded/backed off and cease on confirmed session loss or sign-out. Unavailable streams SHALL have an understandable recovery treatment.

#### Scenario: Missed message while disconnected

- **WHEN** a message commits during disconnection and connectivity returns
- **THEN** HTTP reconciliation retrieves the missed persisted history even if no event is replayed

### Requirement: No unsupported messaging claims

The interface SHALL NOT invent attachments, arbitrary direct-chat creation, unread/read indicators, delivery receipts, online presence or typing status. A persisted message SHALL mean saved to the service, not read by or delivered to the recipient's device.

#### Scenario: Message confirmed

- **WHEN** the API acknowledges a message
- **THEN** the sending state clears without adding an unsupported receipt or activity indicator
