## ADDED Requirements

### Requirement: Explicit local preview boundary

The interface SHALL identify itself as a local fictional demonstration, SHALL make no backend or external data requests, and SHALL NOT persist credentials or claim real registration, notifications, team responses or message delivery. A visible reset SHALL restore the original fictional state.

#### Scenario: Enter demonstration

- **WHEN** the visitor uses the sign-in or registration demonstration
- **THEN** clearly labeled local navigation opens the demo workspace without a server account/session and without retaining the entered password

#### Scenario: Reset

- **WHEN** the visitor resets the demonstration or reloads the page
- **THEN** local edits and decisions are discarded and original fixtures return

### Requirement: Connected responsive page coverage

The interface SHALL provide directly addressable, navigable views for sign-in, registration, onboarding/profile editing, own/public professional profiles, people discovery, matches, project catalogue/detail/create/edit, my projects, my applications, owner application/team management, conversation list and direct/team threads. Nested tabs or dialogs MAY cover owner management. Unknown routes SHALL display a recovery action.

#### Scenario: Navigate across the journey

- **WHEN** the visitor uses navigation, links or browser back/forward
- **THEN** the corresponding page and active navigation state agree, and local edits remain consistent until reset

#### Scenario: Phone navigation

- **WHEN** viewed at 390px
- **THEN** every in-scope view remains reachable without horizontal page scrolling or desktop-only essential controls

### Requirement: Professional profile demonstration

The interface SHALL show name, bio, specialization, experience, skills, goals, portfolio links and a distinct opt-in visibility control. Completeness SHALL require a nonblank name, specialization, at least one skill and goal. Other users' professional pages SHALL omit email/private account data.

#### Scenario: Save profile

- **WHEN** a visitor edits valid profile fields and saves
- **THEN** the own profile and relevant local views reflect the edit, with explicit missing-field feedback and no implied public visibility before opt-in

### Requirement: People discovery and matches

The discovery deck SHALL contain people rather than projects, offer filters, direct drag, left dislike/right like buttons, keyboard alternatives, a counter, empty/incomplete/opt-out states and explicit local match celebration. Decisions SHALL advance once despite rapid repeats; a matched-person view SHALL link to a local direct thread. Restarting an exhausted deck SHALL NOT be presented as a supported production reset; only global demo reset restores decisions.

#### Scenario: Filter and decide

- **WHEN** the visitor changes specialization, experience, skills or goals and acts on an eligible card
- **THEN** filtered local results follow AND categories/ALL skills/ANY goals, and that person's decision is recorded once without inventing a project-team acceptance

#### Scenario: Local mutual interest

- **WHEN** a like encounters a fixture with simulated reciprocal interest
- **THEN** a labeled demo match appears and a local match/direct conversation becomes available

### Requirement: Project application and team journey

Projects SHALL expose title, description, goal, roles, skills, recruitment status and roster. A complete-profile nonmember SHALL be able to apply to an open project without a prior people match. Application history SHALL expose pending/accepted/rejected/withdrawn outcomes, withdrawal and resubmission after rejected/withdrawn outcomes.

#### Scenario: Apply and withdraw

- **WHEN** an eligible demo visitor submits an application
- **THEN** one pending application appears in their history and duplicate submission is unavailable
- **WHEN** they withdraw it
- **THEN** its state becomes withdrawn and a new submission is possible

### Requirement: Owner and membership demonstration

Owner-only views SHALL demonstrate accept/reject, edit, recruitment close/reopen, nonowner removal and ownership transfer. Nonowners SHALL be able to leave. Closing recruitment SHALL preserve pending applications, roster and thread while blocking new submission/acceptance. Owner leave SHALL require prior ownership transfer.

#### Scenario: Closed recruitment

- **WHEN** the owner closes recruitment
- **THEN** new applications and acceptance are unavailable while pending applications, existing members and team history remain visible

#### Scenario: Manage local team

- **WHEN** the demo owner accepts a pending application on an open project
- **THEN** the applicant joins the roster and the local team thread, without being described as a people match
- **WHEN** the owner transfers ownership to an existing member
- **THEN** owner actions move to the new owner and the former owner can leave

### Requirement: Conversation layouts and local messaging

The interface SHALL display direct and project conversations, full local text history, a composer and a local sending/error treatment. Nonblank text up to 4000 characters SHALL be accepted without remote delivery claims. Only current fixture members SHALL access a thread; removed membership SHALL show an unavailable state. No online/typing/read/unread or attachment functionality SHALL be invented.

#### Scenario: Compose locally

- **WHEN** the visitor submits valid message text
- **THEN** it appears once in the selected local thread and the composer clears without a network request

### Requirement: Inspectable states and accessible design

The interface SHALL follow DESIGN.md, provide labeled previews of loading, empty, network error, expired-session, unavailable-resource, state-conflict and validation states, and support keyboard focus, dialog Escape/focus containment, reduced motion and native vertical touch scrolling. Preview controls SHALL be separate from product actions and SHALL NOT pretend a real service failure occurred.

#### Scenario: Inspect state

- **WHEN** the reviewer selects a documented preview state
- **THEN** the relevant treatment appears with a meaningful recovery action and a clear demo indicator

#### Scenario: Reduced motion and modal focus

- **WHEN** reduced motion is enabled or a dialog opens
- **THEN** spatial effects are reduced and modal controls remain reachable without advancing the background deck

### Requirement: Public motion landing preview

The root route SHALL present an original Aster landing page with the restored text wordmark, product explanation, people/project distinction, fictional previews and functional links to demo discovery, registration and sign-in. Motion SHALL support the narrative without scroll hijacking; reduced motion SHALL preserve all content and navigation without parallax or spatial reveals.

#### Scenario: Visit the root

- **WHEN** a visitor opens `/`
- **THEN** the landing appears instead of a discovery redirect and its calls to action lead to existing local routes

#### Scenario: Explore with motion preferences

- **WHEN** a visitor scrolls or enables reduced motion at desktop/mobile widths
- **THEN** the page remains vertically scrollable, content is reachable without animation completion, and animated artwork does not cause horizontal document overflow
