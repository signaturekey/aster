## ADDED Requirements

### Requirement: Independent editorial experiment

The prototype SHALL use local fictional data only and SHALL present a warm editorial page with the specified palette, a dominant three-layer deck, responsive composition and no Anthropic branding or backend connection.

#### Scenario: Desktop and phone

- **WHEN** opened at 1440 or 390 px
- **THEN** six clearly demo projects are available, the deck dominates the composition, and mobile content is sequential without horizontal page overflow

#### Scenario: Supporting context without new functionality

- **WHEN** viewed on a wide desktop
- **THEN** static editorial panels flank the horizontally centered deck without offering fake filters, activity or actions
- **WHEN** viewed below the three-column breakpoint
- **THEN** supporting panels follow the deck visually without squeezing the cards or introducing horizontal overflow

### Requirement: Predictable swipe lifecycle

The prototype SHALL follow horizontal pointer movement directly, derive tilt and action-label opacity from displacement, bring following cards forward progressively, decide using distance and velocity, spring back insufficient gestures and finish accepted gestures before advancing exactly once. Settings SHALL be centralized.

#### Scenario: Return and accept

- **WHEN** a short slow gesture is released
- **THEN** the same card returns to rest
- **WHEN** a sufficient-distance gesture or intentional fast flick is released
- **THEN** the card exits in the decision direction and the next card takes its place without a remount jump

#### Scenario: Repeated input

- **WHEN** commands repeat during one exit
- **THEN** only that one card is consumed

### Requirement: Accessible alternate controls

The prototype SHALL offer permanent “Не нравится” (left) and “Нравится” (right) buttons for the skip/save decisions, arrow-key controls, a card counter, completion and restart, native mobile vertical scrolling and reduced-motion alternatives.

#### Scenario: No dragging required

- **WHEN** the user uses arrow keys through the deck
- **THEN** the same decisions occur, completion appears after six decisions and restart restores the original deck

#### Scenario: Motion and scrolling preferences

- **WHEN** reduced motion is enabled or a vertical touch gesture is made
- **THEN** automatic spatial animation is replaced with a brief fade or immediate positioning, and vertical page scrolling remains possible

### Requirement: Explicit demo match preview

The prototype SHALL preview an explicitly fictional match after the first saved project per run, without claiming a real team response, sending notifications or creating a chat. The modal SHALL pause deck input, support Escape and a continue button, place focus within it and respect reduced motion.

#### Scenario: Preview and continue

- **WHEN** the first project is saved in a run
- **THEN** its demo match appears once, the deck cannot advance behind it, and dismissing resumes the already advanced deck without another decision
- **WHEN** the deck is restarted
- **THEN** the first-save preview is available again
