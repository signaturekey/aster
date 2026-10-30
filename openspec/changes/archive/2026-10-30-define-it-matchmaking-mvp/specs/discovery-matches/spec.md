# Discovery and Matches

## Purpose

Help IT collaborators discover professional profiles and establish private mutual interest before direct communication.

## ADDED Requirements

### Requirement: Eligible discovery deck

The system SHALL provide authenticated, cursor-paginated discovery for complete, opted-in users. Results SHALL exclude self, incomplete or opted-out profiles, profiles the viewer has already decided on, and existing matches. Order SHALL be newest-first by creation time with an ID tie-breaker.

#### Scenario: Filtered discovery

- **WHEN** an eligible user requests discovery with specialization, skills, and goals
- **THEN** every result satisfies the specialization filter, all selected skills, and at least one selected goal, ANDed across categories

#### Scenario: Discovery exhausted

- **WHEN** no eligible profiles remain
- **THEN** the API returns an empty page rather than resetting prior decisions

### Requirement: Persisted and revisable decisions

A complete, opted-in user SHALL be able to set `interested` or `skipped` for another complete, opted-in user before matching. An existing decision SHALL NOT prevent explicit revision by target ID, even though it excludes that target from the deck. Same-value retries SHALL be idempotent; skips SHALL NOT expire automatically.

#### Scenario: Prior skip revised before matching

- **WHEN** a user sets interest by ID for a still-complete and opted-in target they previously skipped
- **THEN** the decision replaces the skip and mutuality is reevaluated despite the target's absence from the deck

#### Scenario: Target no longer participates

- **WHEN** a new or changed pre-match decision targets a user who is incomplete or opted out
- **THEN** the API rejects the decision without creating a match

### Requirement: Private one-sided interest

One-sided interest SHALL remain private. The system SHALL NOT expose an incoming-interest list or create a direct conversation without reciprocal interest.

#### Scenario: One-sided interest

- **WHEN** A records interest in B and B has not reciprocated
- **THEN** no direct conversation is created and B cannot enumerate A's one-sided interest

### Requirement: Atomic mutual matching

Reciprocal interest SHALL atomically establish one match per unordered user pair and one direct conversation containing exactly those users. Concurrent writes and retries SHALL NOT create duplicates or miss a committed reciprocal pair. A rejected transaction SHALL NOT leave a partial match.

#### Scenario: Concurrent reciprocal decisions

- **WHEN** both users submit reciprocal interest concurrently or repeat the requests
- **THEN** exactly one match and one direct conversation exist and both users can retrieve them

### Requirement: Match persistence and participant access

Only participants SHALL list or retrieve a match. Matches and direct conversations SHALL survive discovery opt-out or later profile incompleteness. Replaying an existing interested decision after matching SHALL return the committed outcome; changing it to skipped SHALL return 409. Unmatching is outside this MVP.

#### Scenario: Matched decision retried

- **WHEN** a participant retries the interested decision after the match exists
- **THEN** the existing match is returned without creating a second conversation

#### Scenario: Unauthorized match lookup

- **WHEN** a third user requests another pair's match
- **THEN** the API returns 404 without revealing match data
