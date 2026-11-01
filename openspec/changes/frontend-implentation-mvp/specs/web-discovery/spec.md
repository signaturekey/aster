## Purpose

Connect the people discovery and match interfaces to real eligible profiles and persisted mutual decisions, preserving the approved swipe interaction without simulated outcomes.

## ADDED Requirements

### Requirement: Eligible filtered people

Discovery SHALL load people from the API, with specialization, experience, skill and goal filters represented in the URL. Filtering SHALL preserve current AND-between-categories, ALL-skills and ANY-goals semantics. Incomplete, opted-out, exhausted, empty-result and failed-load states SHALL explain real conditions rather than substitute fixture cards.

#### Scenario: Filter and reload

- **WHEN** a user changes filters or reloads a filtered discovery URL
- **THEN** the API receives the selected identifiers, pagination restarts on changes and the resulting cards correspond to that filter context

### Requirement: Once-only persisted decisions

Like/skip SHALL persist through the API and support drag, buttons and keyboard alternatives. Repeated input during one pending decision SHALL NOT submit several decisions or consume several people. Failed decisions SHALL remain recoverable without a false success or automatic blind mutation retry. Deck reset/undo SHALL NOT be invented.

#### Scenario: Rapid decision input

- **WHEN** a user repeats the same gesture, button or key while a decision is unresolved
- **THEN** only one person's decision is attempted, and progression or recovery follows the authoritative result

#### Scenario: Exhaustion survives reload

- **WHEN** the user has decided on all eligible people and reloads
- **THEN** persisted decisions remain effective and the interface does not silently restore the deck

### Requirement: Real mutual matches

A match celebration SHALL appear only for a server-confirmed people match. Match lists SHALL load persisted matches and link the correct person/profile and existing direct conversation. A like alone SHALL NOT promise reciprocity, create arbitrary direct chats or imply project-team acceptance.

#### Scenario: Reciprocal decisions

- **WHEN** two eligible users express mutual interest through real accounts
- **THEN** the server-confirmed match and its conversation become reachable, including after reload, without requiring incoming-like lists or fixture reciprocity

#### Scenario: One-sided interest

- **WHEN** a user likes a person who has not reciprocated
- **THEN** no fabricated match celebration or direct chat is created by the browser
