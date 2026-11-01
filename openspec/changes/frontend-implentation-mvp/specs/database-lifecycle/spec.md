## MODIFIED Requirements

### Requirement: Dictionary-only seed

Ordinary seeding SHALL populate the agreed dictionary identifiers and labels idempotently. Normal initialization SHALL NOT create demo accounts, sessions, projects, applications or messages. A separately invoked development-data command SHALL be the only seed workflow allowed to create fictional collaboration records; it SHALL NOT run automatically with migrations or ordinary startup.

#### Scenario: Repeated seed

- **WHEN** ordinary seed runs repeatedly after baseline initialization
- **THEN** dictionary values remain stable without duplicates and no demo collaboration or authentication records appear

#### Scenario: Explicit development seed

- **WHEN** the developer deliberately invokes the documented development-data command against the identified local development database
- **THEN** fictional accounts and collaboration records are inserted as real database data, separately from ordinary initialization

## ADDED Requirements

### Requirement: Non-destructive development data

Development seeding SHALL be explicit, bounded to the identified development database and safe to repeat. It SHALL NOT reset a database, overwrite existing user edits/passwords, restore removed membership or duplicate records. Test credentials SHALL be clearly local-only; passwords SHALL use normal authentication hashing. Unsafe targets or identity collisions SHALL fail safely.

#### Scenario: Repeat after using the product

- **WHEN** a user edits seeded content, leaves a seeded team or changes an application, and development seed runs again
- **THEN** existing progress is preserved rather than overwritten or recreated, with skipped or conflicting work reported

#### Scenario: Existing unrelated identity

- **WHEN** a requested seed account identifier is already occupied by unrelated data
- **THEN** the command refuses to adopt or change that account and reports the conflict without resetting the database

### Requirement: Representative real development scenarios

Development data SHALL cover complete/incomplete and discovery-opted-in/out profiles, undecided people and a real mutual match, open/closed projects, owner/member/applicant roles, application outcomes, and direct/team message history. Seeded records SHALL satisfy ordinary business/database invariants rather than bypass them with fake browser responses.

#### Scenario: Use seeded accounts

- **WHEN** developers sign in with documented seed credentials in separate browser profiles
- **THEN** they can inspect the representative scenarios and perform real API operations without an actor switcher or special fixture mode
