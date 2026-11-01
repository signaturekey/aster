## Purpose

Let users register, authenticate and maintain professional profiles through real database-backed sessions without leaking account data between people or sessions.

## ADDED Requirements

### Requirement: Real account lifecycle

The application SHALL support email/password registration, sign-in, session restoration and sign-out using the existing database-backed HttpOnly cookie mechanism. It SHALL NOT store passwords or session tokens in application browser storage. The landing and entry forms SHALL be guest-accessible; product views SHALL require authentication.

#### Scenario: Register and reload

- **WHEN** a visitor registers valid credentials and reloads the application
- **THEN** the real account and session survive through the API, and a new incomplete account is directed to onboarding

#### Scenario: Invalid credentials

- **WHEN** registration or sign-in fails
- **THEN** an appropriate Russian error appears without fake success, exposure of internal errors or copying the password into shared state

### Requirement: Session isolation and return navigation

After successful sign-in the application SHALL restore an allowed originally requested internal destination, except for initial onboarding guidance. Expired/revoked sessions and sign-out SHALL stop protected requests and event streams, discard private cached data and drafts, and prevent stale in-flight responses from restoring them.

#### Scenario: Protected deep link

- **WHEN** a guest opens a protected URL and later signs in
- **THEN** navigation returns to the permitted internal destination rather than accepting an external redirect target

#### Scenario: Change account in one browser

- **WHEN** one user signs out or loses their session and another signs in
- **THEN** the second user cannot see the former user's private data or drafts from cache, late requests or event callbacks

### Requirement: Editable professional profile

Users SHALL view and edit their own display name, bio, specialization, experience, skills, goals, portfolio links and discovery opt-in using current API limits and dictionary identifiers. Form errors SHALL be understandable, associated with inputs where possible and preserve entered values. The server SHALL remain authoritative for validation and persistence.

#### Scenario: Save and reload profile

- **WHEN** valid edits are saved successfully and the page reloads
- **THEN** the API returns the saved values and other relevant views refresh without depending on preview state

#### Scenario: Server validation failure

- **WHEN** the server rejects a form whose local checks passed
- **THEN** the rejection is presented without claiming a save or assuming that a generic validation response contains field-level errors

### Requirement: Completeness without blanket lockout

Profile completeness SHALL require a nonblank display name, specialization, at least one skill and at least one goal. Discovery participation SHALL remain separately opt-in. Incomplete profiles SHALL receive onboarding guidance and operation-specific restrictions rather than a blanket ban on all authenticated pages.

#### Scenario: Browse with incomplete profile

- **WHEN** an authenticated user has an incomplete profile
- **THEN** they can reach allowed product views, while discovery or application actions requiring completeness explain the missing prerequisites

### Requirement: Other-user profile privacy

Other people's professional profiles SHALL be authenticated views that expose only public professional fields, not email or private account data. Discovery opt-out SHALL NOT be presented as preventing an authenticated known-ID profile read under the current API contract.

#### Scenario: Open another profile

- **WHEN** an authenticated user opens a permitted known-user profile
- **THEN** professional fields appear without private account data; unavailable IDs and authentication failures receive distinct appropriate treatments
