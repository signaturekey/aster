## Purpose

Provide a real searchable project catalogue and complete application/team workflows with current database permissions rather than fixture-derived ownership or membership.

## ADDED Requirements

### Requirement: Server-side project search

The authenticated catalogue SHALL search title or description by a case-insensitive literal substring and optionally filter by one dictionary goal. Text and goal conditions SHALL combine with AND, apply before cursor pagination and be reflected in the URL. Empty text SHALL mean no text condition. Results SHALL retain deterministic newest-created ordering, not invented relevance ranking.

#### Scenario: Match outside the first page

- **WHEN** a matching project exists beyond the default unfiltered page and the user searches for it
- **THEN** the API returns it through filtered pagination rather than searching only browser-loaded records

#### Scenario: Literal wildcard and goal

- **WHEN** search text contains SQL wildcard characters and a goal is selected
- **THEN** characters are treated literally and only projects satisfying the text and goal conditions appear

### Requirement: Real project views and editing

The application SHALL provide catalogue, detail/roster, my-projects, create and owner-edit views backed by the API. Title, description, goal, required roles/skills and recruitment state SHALL use current constraints. Saved changes SHALL propagate through affected views and survive reload. Project membership SHALL NOT require a prior people match.

#### Scenario: Create a project

- **WHEN** an authenticated user successfully creates a valid project
- **THEN** its persisted detail and owner actions are available and its real team conversation is reachable without inventing a separate arbitrary-chat operation

#### Scenario: Nonowner edit

- **WHEN** a nonowner reaches an edit URL or submits a stale owner operation
- **THEN** the application respects the current server denial instead of applying local ownership assumptions

### Requirement: Application lifecycle

A complete-profile nonmember SHALL be able to apply to an open project. Users SHALL see their paginated application history, withdraw pending applications and resubmit after rejection/withdrawal where the API permits. Duplicate pending submissions SHALL be prevented by server constraints as well as pending-action UI.

#### Scenario: Submit and revisit

- **WHEN** a user submits an application and reloads their history
- **THEN** the real pending record appears once and remains distinct from a people match

#### Scenario: Withdraw and reapply

- **WHEN** a pending application is successfully withdrawn and the user applies again while eligible
- **THEN** the old outcome remains withdrawn and a new permitted submission can be created

### Requirement: Recruitment and owner decisions

Only the current owner SHALL manage pending applications and close/reopen recruitment. Closure SHALL block new applications and acceptance while preserving pending applications, members and team history. Acceptance SHALL create current membership; rejection SHALL not. UI outcomes SHALL follow the committed server result during races.

#### Scenario: Acceptance races closure

- **WHEN** owner acceptance and recruitment closure occur concurrently
- **THEN** the UI displays the valid committed outcome or conflict and refreshes state without fabricating partial membership

### Requirement: Current team and ownership

The application SHALL support roster views, confirmed nonowner removal, ownership transfer to an existing member and nonowner leave. Owners SHALL transfer before leaving. Previously accepted applications SHALL NOT be treated as proof of current membership after removal/leave. Access and actions SHALL follow current server state.

#### Scenario: Transfer then leave

- **WHEN** an owner confirms a permitted transfer and then leaves
- **THEN** owner controls move to the new owner and the former owner loses membership-dependent access after leaving

#### Scenario: Remove an accepted applicant

- **WHEN** an accepted applicant is later removed from the team
- **THEN** the historical accepted outcome does not restore roster membership or team conversation access
