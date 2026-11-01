## Purpose

Make the complete local browser/API/database product reproducibly runnable with one public origin while preserving database safety and honest verification evidence.

## ADDED Requirements

### Requirement: Complete local container stack

A documented Compose command SHALL build and start the web entrypoint, API and PostgreSQL, with successful migrations and dictionary initialization preceding API startup. The browser SHALL access the SPA and API through one loopback HTTP origin. Ordinary container startup SHALL require no Bun/Node installation on the host and SHALL preserve existing database volumes.

#### Scenario: Fresh local start

- **WHEN** a developer follows the documented Compose procedure with Docker and registries available
- **THEN** registration, persisted product operations and messaging work through one browser-facing address without development fixture data unless explicitly seeded

#### Scenario: Restart

- **WHEN** the stack is stopped and restarted normally
- **THEN** accounts, projects and messages survive, migrations rerun safely and no reset or demo reseed occurs

### Requirement: Correct proxy boundaries

The web entrypoint SHALL preserve API paths, statuses, cookies and original request origin, keep auth/CSRF configuration aligned with the external URL and avoid buffering/caching SSE. Unknown API requests SHALL NOT fall through to SPA HTML. Product deep links SHALL load the SPA. Health routing SHALL remain distinct from SPA fallback.

#### Scenario: Deep link and missing API path

- **WHEN** a browser reloads a nested product URL or requests an unknown `/api` path
- **THEN** the former loads the application and the latter retains an API error rather than returning `index.html`

#### Scenario: Cookie and stream through proxy

- **WHEN** a user registers, restores/renews a session and receives a message through the public origin
- **THEN** cookies and origin checks remain valid and SSE notifications arrive without proxy-induced buffering

### Requirement: Development parity

The documented hot-reload workflow SHALL use a local SPA development server with API proxying and consistent public-origin authentication configuration. It SHALL not require disabling origin/CSRF checks or maintaining a second transport contract. The SPA workspace SHALL participate in the existing monorepo install, type checks and builds.

#### Scenario: Develop through proxy

- **WHEN** the application is run in the documented development mode
- **THEN** real API/auth/event calls use the same browser origin and the workflow explains the applicable API base URL and trusted origins

### Requirement: Verified local and hosted boundaries

Acceptance SHALL include workspace formatting/lint, strict type checks, unit tests, real isolated PostgreSQL integration checks for backend changes, API/client/web builds, container image builds and an actual Compose browser journey. Automated smoke/E2E/browser suites SHALL NOT be introduced. Hosted success SHALL require the successful latest authorized pushed commit, not merely local checks.

#### Scenario: Local product acceptance

- **WHEN** local runtime verification is recorded
- **THEN** evidence covers two real accounts, profiles, a mutual match, project application/acceptance, role changes, direct/team messages, multi-tab recovery, reload/restart and phone/desktop layouts, with exact limitations

#### Scenario: No hosted access or push approval

- **WHEN** hosted checks cannot be run or verified
- **THEN** that boundary remains explicitly unverified and its completion task stays open rather than being inferred from local success
