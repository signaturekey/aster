# Project Teams

## Purpose

Let collaborators recruit for startups and hackathons, consider private applications, and manage a project team.

## ADDED Requirements

### Requirement: Project recruitment

A complete-profile user SHALL be able to create a project with a title, description, collaboration goal, required roles, and skills. Creation SHALL atomically establish one owner membership and one project conversation. Projects SHALL support open and closed recruitment; only the current owner SHALL edit recruitment data.

#### Scenario: Project created

- **WHEN** an eligible user creates a valid project
- **THEN** the project, its sole owner, and its project conversation become available together

### Requirement: Private applications

A complete-profile nonmember SHALL be able to apply to an open project without a prior match. Applications SHALL be visible only to their applicant and current project owner. Each user/project pair SHALL have at most one pending application, with states pending, accepted, rejected, and withdrawn.

#### Scenario: Closed recruitment

- **WHEN** a user applies to a project whose recruitment is closed
- **THEN** the API rejects the submission without creating an application

#### Scenario: Duplicate pending application

- **WHEN** concurrent submissions create the same applicant's pending application
- **THEN** at most one pending application is persisted

### Requirement: Independent applications and resubmission

Users SHALL be able to apply to multiple projects and join multiple teams without a global quota in this MVP. Only one pending application per user/project pair SHALL be allowed. After rejection, withdrawal, or leaving/removal from a team, an eligible nonmember SHALL be able to submit a new application to an open project; prior applications SHALL remain history.

#### Scenario: Several projects

- **WHEN** a member of project C applies to open projects A and B
- **THEN** one pending application in each of A and B is allowed

#### Scenario: New application after rejection

- **WHEN** an eligible nonmember reapplies to an open project after rejection
- **THEN** a new pending application is created without modifying the previous decision

### Requirement: Project-level recruitment

Required roles and skills SHALL be project fields, not separate recruitment positions with seat quotas. Authenticated users SHALL be able to read the project catalogue, project details, and team rosters. Application content and conversation history SHALL retain their separate access controls.

#### Scenario: Nonmember views a project

- **WHEN** an authenticated nonmember requests a project or its roster
- **THEN** the API returns public project/profile fields without exposing applications or chat messages

### Requirement: Application decisions

Only the owner SHALL accept or reject a pending application; only its applicant SHALL withdraw it. Acceptance into an open project SHALL atomically update the application and grant team and project-chat membership. A failed acceptance SHALL leave all three unchanged.

#### Scenario: Concurrent acceptance and recruitment closure

- **WHEN** acceptance races with closing recruitment
- **THEN** one valid ordering commits and no application is accepted while recruitment is already closed

#### Scenario: Retried acceptance

- **WHEN** an already accepted application's acceptance is retried
- **THEN** no duplicate membership is created and the committed outcome remains unchanged

### Requirement: Ownership and membership

A project SHALL retain exactly one owner. Only the owner SHALL transfer ownership to an existing member or remove a non-owner member. A member SHALL be able to leave; the owner SHALL transfer ownership before leaving. Membership removal SHALL revoke project-conversation access immediately.

#### Scenario: Owner leaves without transfer

- **WHEN** the owner requests to leave without a completed ownership transfer
- **THEN** the API rejects the request and preserves ownership

#### Scenario: Concurrent transfer

- **WHEN** conflicting ownership transfers are attempted concurrently
- **THEN** exactly one owner remains and authorization is based on the committed state

### Requirement: Recruitment closure preserves collaboration

Closing recruitment SHALL stop new applications and acceptances while preserving existing team membership, conversations, and pending applications. Reopening SHALL resume recruitment without recreating team or conversation records.

#### Scenario: Recruitment reopens

- **WHEN** the owner reopens a closed project
- **THEN** existing pending applications can be considered again and the existing conversation is retained
