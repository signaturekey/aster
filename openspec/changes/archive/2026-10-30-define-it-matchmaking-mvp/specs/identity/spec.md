# Identity

## Purpose

Identify users through email/password accounts and database-backed sessions without exposing private account data.

## ADDED Requirements

### Requirement: Local email and password registration

The system SHALL support email/password registration and sign-in without requiring email verification. OAuth, SMTP, verification delivery, and password recovery SHALL NOT be implemented in this local MVP. Registration SHALL NOT claim to have sent mail.

#### Scenario: New local account

- **WHEN** a user submits valid registration data for an available email
- **THEN** the account can sign in without verifying an email and no email delivery is attempted

#### Scenario: Invalid credentials

- **WHEN** sign-in credentials are invalid
- **THEN** the request is rejected without creating an authenticated session or leaking credential data

### Requirement: Database session authorization

The system SHALL use database-backed sessions with an opaque HttpOnly browser cookie and no cookie cache initially. Protected operations SHALL derive the actor from a valid session. Sign-out SHALL revoke the current session. A custom access/refresh JWT protocol SHALL NOT be introduced.

#### Scenario: Missing or expired session

- **WHEN** a caller without a valid session requests a protected product operation
- **THEN** the API returns 401 and performs no mutation

#### Scenario: Sign-out

- **WHEN** a signed-in user signs out and then presents the previous session cookie
- **THEN** protected operations reject the revoked session

### Requirement: Private account information

The system SHALL exclude credentials, session identifiers, email addresses, and private account fields from other users' profile, discovery, project, match, and chat responses. The current-account endpoint SHALL expose private account fields only to their owner.

#### Scenario: Another member reads a profile

- **WHEN** an authenticated member retrieves another member's professional profile
- **THEN** the response contains only the allowed profile fields and never the account email

### Requirement: Browser session protection

The system SHALL protect cookie-authenticated mutations against CSRF and allow credentialed cross-origin access only for configured trusted origins. Cookies SHALL be HttpOnly; Secure SHALL follow HTTPS deployment configuration, permitting local HTTP development.

#### Scenario: Untrusted origin

- **WHEN** a state-changing cookie-authenticated request comes from an untrusted browser origin
- **THEN** it cannot mutate the user's state
