# Database Lifecycle

## Purpose

Provide reproducible local PostgreSQL initialization and durable application persistence without a platform-specific ORM engine download or legacy database adoption.

## ADDED Requirements

### Requirement: Engine-independent database lifecycle

Installation, API builds, migrations, seed and startup SHALL NOT require a separately downloaded ORM engine executable. Normal container startup SHALL require neither Bun nor Node.js on the host.

#### Scenario: Clean container build

- **WHEN** a clean checkout is built with Docker and package/image registries available
- **THEN** migration and API images build without a preloaded ORM engine cache or requests to the former engine distribution service

### Requirement: Fresh baseline and bounded reset authorization

The replacement SHALL initialize a clean schema from one committed baseline. The one-time reset authorized for the transition SHALL affect only this project's identified local working and disposable test databases. Normal startup and tests SHALL NOT reset the working database or adopt a legacy schema.

#### Scenario: Transition reset

- **WHEN** implementation uses the approved clean-start permission
- **THEN** the exact project-owned targets are verified before deletion and no unrelated database, container or volume is changed

#### Scenario: Incompatible nonempty database

- **WHEN** ordinary startup encounters a legacy or incompatible nonempty schema
- **THEN** migration stops with an actionable safe error instead of silently dropping data, adopting old history or pretending the baseline is applied

### Requirement: Ordered repeatable migrations

Committed migrations SHALL apply once in deterministic order with database-backed coordination across concurrent runners. A failed migration SHALL roll back its schema changes and SHALL NOT be recorded as successfully applied.

#### Scenario: Fresh initialization and rerun

- **WHEN** migrations run twice against an empty disposable database
- **THEN** the first run creates the complete schema and the second makes no duplicate DDL or destructive reset

#### Scenario: Concurrent or failing runners

- **WHEN** two runners target one database or a migration fails partway through
- **THEN** history remains uniquely ordered, only committed migrations count as applied and startup does not proceed after failure

### Requirement: Relational invariant preservation

The new schema and operations SHALL preserve foreign keys, unique keys, check constraints, partial indexes, canonical pair ordering and deferred owner-membership integrity required by current collaboration behavior.

#### Scenario: Concurrent collaboration mutations

- **WHEN** reciprocal decisions, duplicate applications, acceptance and closure, ownership transfers, or message writes and membership revocation race
- **THEN** a valid ordering commits without missed or duplicated matches, partial membership, owner loss, duplicate messages or unauthorized post-revocation access

### Requirement: Public contract and timestamp compatibility

The replacement SHALL preserve current HTTP statuses, public fields, validation, ISO strings, pagination and errors. Product records SHALL receive IDs and creation timestamps without caller input. Modification timestamps SHALL advance explicitly on real changes, not no-op updates or idempotent retries. Profile reads SHALL NOT create rows.

#### Scenario: Default values and no-op updates

- **WHEN** a product record is inserted without an ID/creation timestamp, an existing profile receives an empty PATCH, or an existing operation is retried idempotently
- **THEN** insert defaults populate the required fields while no-op updates and retries preserve the existing modification timestamp

#### Scenario: Profile reads and typed responses

- **WHEN** a registered user without a stored profile reads it or the shared client reads date-like message text and timestamps
- **THEN** the profile is returned as stable public defaults without an insert, and client values remain strings with no database runtime in browser bundles

### Requirement: Dictionary-only seed

Seeding SHALL populate the agreed dictionary identifiers and labels idempotently. Normal initialization SHALL NOT create demo accounts, sessions, projects, applications or messages.

#### Scenario: Repeated seed

- **WHEN** seed runs repeatedly after baseline initialization
- **THEN** dictionary values remain stable without duplicates and no demo collaboration or authentication records appear

### Requirement: Authentication behavior after clean initialization

New accounts and sessions SHALL retain current email/password, HttpOnly cookie, renewal, expiry, sign-out and trusted-origin behavior. No OAuth, delivery, verification, recovery or session cache SHALL be added. Old pre-reset accounts and sessions SHALL NOT be migrated.

#### Scenario: Account and session lifecycle

- **WHEN** a user registers on the fresh schema, signs in, renews their session through JSON/SSE and then signs out
- **THEN** authentication and renewal cookies work with current permissions and the revoked session is subsequently rejected

### Requirement: Isolated database verification

Automated database checks SHALL require explicitly isolated disposable targets and reject the working-database URL before mutations. PostgreSQL tests SHALL retain deterministic authorization and concurrency checks rather than replacing them with mocks or timing sleeps.

#### Scenario: Unsafe test target

- **WHEN** a test harness is configured with the working database or an unsafe target
- **THEN** it refuses before migrating, seeding or changing that database despite the separate one-time transition reset permission

### Requirement: Verified local lifecycle and hosted completion

Completion SHALL require an actual local container build/startup, successful migration and API interaction, graceful stop and restart preserving committed data, plus successful hosted checks for the exact latest pushed commit. Image build or in-process tests alone SHALL NOT count as local runtime verification.

#### Scenario: Local restart

- **WHEN** the ordinary Compose workflow starts, stops and restarts after the one-time transition
- **THEN** migrations precede API startup, authenticated database-backed operations succeed, data survives restart and shutdown releases SSE/database resources

#### Scenario: Unverified check

- **WHEN** any required local or latest-commit hosted check fails or cannot be verified
- **THEN** affected tasks remain open and the migration is not reported complete
