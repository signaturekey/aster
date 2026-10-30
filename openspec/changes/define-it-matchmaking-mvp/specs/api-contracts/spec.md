# API Contracts and Acceptance

## Purpose

Keep the backend contract browser-safe and verifiable while delivering a complete local container stack without a frontend.

## ADDED Requirements

### Requirement: Shared typed API client

The backend SHALL expose route-derived request, success, and error types through a shared client package without duplicate DTO interfaces. Workspace type checking SHALL validate the shared client without requiring a frontend application or a separate consumer fixture. Type-only access SHALL NOT bundle server runtime or database code into a browser build.

#### Scenario: Contract changes

- **WHEN** an API response field used by typed client code is incompatibly changed
- **THEN** workspace type checking fails at the incompatible usage

#### Scenario: Browser-target client build

- **WHEN** the shared client entry is built for a browser target
- **THEN** it includes client HTTP code but no API runtime, server startup, or Prisma imports

### Requirement: Validated public contract

Product routes SHALL validate external input and explicitly select public response fields. Product errors SHALL use stable codes, HTTP status, and safe messages without secrets, SQL, or stack traces. Timestamp values SHALL be ISO 8601 strings. Provider-owned auth routes SHALL retain their documented provider contract.

#### Scenario: Invalid product request

- **WHEN** input fails a product route schema
- **THEN** the API returns a documented validation error without performing the mutation

#### Scenario: Serialized date

- **WHEN** a product response contains a timestamp
- **THEN** JSON and client types both represent it as a string, not a JavaScript Date

### Requirement: Bounded collection access

Collection endpoints SHALL support bounded cursor pagination with an explicit next cursor, deterministic tie-breaking, and per-page authorization/filtering. Invalid cursors and out-of-range limits SHALL be rejected.

#### Scenario: Pagination limit exceeded

- **WHEN** a client requests a page beyond the documented maximum
- **THEN** the API rejects the limit rather than returning an unbounded collection

### Requirement: Complete local container stack

The repository SHALL provide an API Dockerfile and Docker Compose configuration for the API, PostgreSQL, and ordered migration startup. An environment prepared from safe documented examples SHALL support `docker compose up --build` without host Bun. Normal startup SHALL preserve database data and SHALL NOT reset schemas.

#### Scenario: First local start

- **WHEN** the documented Compose command is used with Docker available and the required local configuration
- **THEN** PostgreSQL becomes ready, committed migrations apply, and the API starts using that database

#### Scenario: Restart with existing data

- **WHEN** the local stack restarts against its existing volume
- **THEN** committed data remains and startup applies only pending migrations

### Requirement: Automated backend verification

CI SHALL run frozen dependency install, generated-client preparation, lint, type checking, unit tests, real-PostgreSQL migration/integration tests, API build, and Docker image build. Tests SHALL use an isolated database. This goal SHALL NOT require smoke/E2E/browser suites, image publication, or deployment.

#### Scenario: CI integration database

- **WHEN** GitHub Actions runs backend integration tests
- **THEN** migrations apply to a clean test database and authorization, state transitions, and concurrency tests run without browser or external HTTP deployment

### Requirement: Evidence-based completion

Implementation SHALL remain pending until explicit user approval. Afterwards, completion SHALL require all scoped tasks and their checks plus a successful GitHub Actions run for the latest pushed commit. Unavailable access and failed checks SHALL remain reported blockers rather than successful task outcomes.

#### Scenario: Local checks pass but hosted CI fails

- **WHEN** local validation succeeds but the latest hosted run fails or cannot be inspected
- **THEN** the goal is not declared complete and the failure or access limitation is reported
