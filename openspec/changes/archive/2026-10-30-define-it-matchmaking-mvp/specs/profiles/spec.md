# Profiles

## Purpose

Describe professional collaboration profiles and let people control participation in the discovery deck.

## ADDED Requirements

### Requirement: Editable professional profile

A user SHALL be able to read and edit their own display name, bio, specialization, experience, skills, collaboration goals, and portfolio links. Only that user SHALL be able to edit the profile.

#### Scenario: Profile update

- **WHEN** a user submits a valid update to their own profile
- **THEN** the updated professional fields are returned without private account data

#### Scenario: Invalid profile data

- **WHEN** an update contains invalid links, unsupported dictionary values, or over-limit fields
- **THEN** the API rejects the update without partially changing the profile

### Requirement: Profile completeness

A profile SHALL be complete when it has a nonblank display name, specialization, at least one skill, and at least one collaboration goal. The API SHALL expose completeness and missing fields. Discovery decisions, project creation, and applications SHALL require a complete profile.

#### Scenario: Incomplete onboarding

- **WHEN** a user without skills attempts to submit a discovery decision
- **THEN** the API rejects the action with a stable profile-incomplete error

### Requirement: Explicit discovery visibility

Discovery participation SHALL default to disabled and require both an explicit opt-in and a complete profile. Opting out SHALL prevent new discovery exposure without deleting existing matches or conversations. Opt-out SHALL not imply that an authenticated user cannot access a known profile.

#### Scenario: Opting out

- **WHEN** a discoverable user disables discovery
- **THEN** they are excluded from subsequent discovery responses while existing matches and chat access are preserved

#### Scenario: Known profile outside discovery

- **WHEN** an authenticated user retrieves an opted-out user's profile by a known user ID
- **THEN** the API returns its allowed professional fields without revealing email or private account fields

### Requirement: Collaboration dictionaries

The API SHALL expose supported specializations, skills, experience levels, and collaboration goals for validated profile and discovery input. Goals SHALL include startup, hackathon, side-project, learning, and pair-programming collaboration.

#### Scenario: Shared selection values

- **WHEN** a client requests profile dictionaries
- **THEN** it receives stable identifiers and display labels usable in profile updates and discovery filters
