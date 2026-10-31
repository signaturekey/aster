## Purpose

Provide bounded best-effort conversation notifications without delaying acknowledgement of durable HTTP message writes.

## ADDED Requirements

### Requirement: Bounded notification work

The API SHALL bound queued notification and authorization work, coalesce pending heartbeats and discard queued work on disconnect. Overloaded streams SHALL close rather than accumulate unbounded work. HTTP history SHALL remain authoritative.

#### Scenario: Blocked consumer authorization

- **WHEN** authorization is blocked while events and heartbeats arrive
- **THEN** pending work remains bounded and disconnect prevents further queued authorization or delivery

#### Scenario: Replacing blocked connections

- **WHEN** repeated reconnects replace streams whose authorization is still blocked
- **THEN** globally active delivery work remains bounded, including the disconnected streams' unfinished work

### Requirement: Independent message acknowledgement

A committed message write SHALL return its HTTP result without waiting for notification recipients. Delivery SHALL still recheck current session validity and membership under locks that coordinate revocation before enqueue.

#### Scenario: Blocked recipient

- **WHEN** a recipient's authorization is blocked after message commit
- **THEN** the sender receives the committed message without waiting for that recipient

#### Scenario: Revocation before delivery

- **WHEN** membership or session revocation commits before delivery authorization
- **THEN** no unauthorized event is enqueued
