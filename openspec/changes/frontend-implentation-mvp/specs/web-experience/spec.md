## Purpose

Provide a coherent Russian-language browser experience over real Aster data while preserving the approved visual direction and clear recovery from failures.

## ADDED Requirements

### Requirement: Real Russian application

The application SHALL use Russian interface copy without a language switcher and SHALL perform product operations against the real API. It SHALL NOT provide fixture-backed product data, actor switching, demo reset, simulated service states, artificial latency or fabricated success. Landing illustrations SHALL NOT claim real users, activity or statistics.

#### Scenario: Empty installation

- **WHEN** a user opens the application against a database with dictionaries but no collaboration data
- **THEN** pages show meaningful real empty states rather than substituting preview fixtures

#### Scenario: Public landing

- **WHEN** an unauthenticated visitor opens `/`
- **THEN** the landing explains people matches versus project applications and links to real registration/sign-in or the protected product journey

### Requirement: Visual source ownership

The application SHALL preserve the visual language, typography, layout and motion of repository-root `DESIGN.md` and `prototypes/interface`, without duplicating their design-token catalogue in this specification. These Git-ignored local references SHALL be supplied separately for visual transfer, not required by builds. Product requirements SHALL override their demo-only behavior.

#### Scenario: Transfer visual design

- **WHEN** a page is implemented with the selected component tooling
- **THEN** it is reviewed against the existing references rather than accepted with an unrelated default component theme, with accessibility corrections recorded

#### Scenario: Remove temporary references

- **WHEN** later cleanup proposes deleting a referenced design source
- **THEN** maintained design ownership and live references are resolved before deletion, without leaving competing authorities or broken links

### Requirement: Navigable responsive pages

All agreed product views SHALL have directly addressable routes, consistent active navigation, browser back/forward support and an unknown-route recovery page. Essential controls SHALL remain reachable at phone widths without horizontal page scrolling. Route changes SHALL update titles and manage focus appropriately.

#### Scenario: Open nested route

- **WHEN** a user opens or reloads a project, profile or conversation URL
- **THEN** the correct authorized view loads, or an explicit sign-in/unavailable/not-found treatment appears rather than a blank page

#### Scenario: Review phone and desktop layouts

- **WHEN** pages are inspected at 390px and 1440px, with spot checks at 320px, 768px and a wide desktop
- **THEN** navigation, forms and conversations remain usable and page layout does not overflow horizontally

### Requirement: Accessible interactions

The application SHALL provide visible keyboard focus, labeled controls, accessible names, understandable status/error text, dialog focus containment/return and Escape behavior. Reduced motion SHALL preserve content and actions without spatial effects. Drag interactions SHALL retain native vertical touch scrolling and button/keyboard alternatives.

#### Scenario: Keyboard and reduced motion

- **WHEN** a user navigates without a pointer or enables reduced motion
- **THEN** all essential actions remain available and neither animation completion nor hover alone gates information

### Requirement: Honest errors and destructive confirmations

Loading, empty, validation, network failure, expired session, unavailable resource and state conflict SHALL be distinct. Errors SHALL use actionable Russian copy without exposing raw internal details. Ownership transfer, member removal and leaving a team SHALL require confirmation. Failed/conflicting mutations SHALL NOT display success or be blindly replayed.

#### Scenario: Concurrent role change

- **WHEN** an action fails because recruitment, ownership or membership changed
- **THEN** the application refreshes current state, explains the outcome and retains still-permitted input without claiming success

### Requirement: Memory-only drafts

Unsaved forms and message drafts SHALL remain memory-only and SHALL NOT persist passwords or private drafts in browser storage. Conversation switching SHALL retain per-thread drafts within the tab. Dirty substantial forms SHALL warn before abandonment; failed submissions SHALL preserve recoverable input. Session cleanup SHALL discard account-scoped drafts.

#### Scenario: Switch or reload

- **WHEN** a user switches threads and returns in the same session
- **THEN** the unsent draft remains associated with its thread
- **WHEN** the tab reloads or the session ends
- **THEN** the draft is not restored from persistent browser storage

### Requirement: Explicit non-message refresh

Non-message resources SHALL refresh after relevant local mutations, on relevant navigation, window focus and network recovery, and through an explicit refresh action. The initial application SHALL NOT promise immediate remote match/application/team updates or introduce permanent background polling.

#### Scenario: Remote application change

- **WHEN** another user changes an application while its list remains open
- **THEN** the viewer can explicitly refresh to obtain current state, and returning focus or relevant navigation also refreshes it

### Requirement: Cursor list controls

Paginated lists SHALL expose load-more controls when another cursor is available and SHALL NOT invent total counts or numbered pages. Changes to filters SHALL restart the corresponding paginated result.

#### Scenario: Reach next page

- **WHEN** a user selects load more in a catalogue, match, application or conversation list
- **THEN** the next authorized cursor page is appended without fabricating a total or losing the current filter context
