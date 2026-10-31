## ADDED Requirements

### Requirement: Persisted product string fidelity

Product request schemas SHALL reject NUL and unpaired UTF-16 surrogates with validation errors before persistence. Valid Unicode and whitespace SHALL retain their existing behavior without normalization.

#### Scenario: Invalid persisted text

- **WHEN** a message, request identifier, profile or project input contains NUL or an unpaired surrogate
- **THEN** the API returns a validation error rather than a database error or silently changed text

#### Scenario: Valid supplementary characters

- **WHEN** persisted text contains a valid surrogate pair
- **THEN** it is stored and returned unchanged, including an idempotent message retry

### Requirement: Database-safe cursor dates

Pagination SHALL reject canonical cursors whose dates fall outside PostgreSQL's timestamp range with `422 INVALID_CURSOR` before executing page queries. Representable extended ISO dates SHALL remain valid.

#### Scenario: Too-early cursor date

- **WHEN** a canonical cursor contains `-005000-01-01T00:00:00.000Z`
- **THEN** the API returns `422 INVALID_CURSOR` rather than a database error

#### Scenario: Representable cursor boundaries

- **WHEN** a cursor contains a date at PostgreSQL's lower boundary or JavaScript's upper date boundary
- **THEN** decoding succeeds and PostgreSQL accepts the page query

### Requirement: Compatible concurrent chat authorization

Independent chat authorization reads SHALL proceed concurrently while coordinating with exclusive project membership mutations. Concurrent duplicate message writes SHALL retain a single stored result.

#### Scenario: Concurrent authorization and revocation

- **WHEN** multiple chat reads or notifications authorize access while membership removal races
- **THEN** reads do not exclusively serialize with one another and no access is granted from membership state older than a committed removal
