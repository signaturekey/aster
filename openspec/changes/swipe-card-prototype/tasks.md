# Tasks

- [x] Implement independent responsive page, six fictional cards, local fonts, tokens and source/start documentation; verify standalone typecheck/build.
- [x] Implement centralized swipe decisions, stable three-card stack, exit lock, buttons/keys, completion/restart and reduced motion; verify decision unit tests and actual browser interactions.
- [x] Inspect 390/1440 composition against reference, gesture return/flick/distance, rapid commands, end/restart, overflow, touch scroll and reduced motion; record evidence and limitations.
- [x] Run root lint, workspace types, unit tests and API/client build; record results without claiming PostgreSQL/Docker/hosted CI verification.

- [x] Apply requested refinement: slower automatic springs, horizontally centered deck and stronger real font weights; verify 390/1440 layout, motion timing, controls, reduced motion and update captures.

- [x] Refine from news reference: larger readable type, bold sans headings, optically aligned header and release decision lock once the outgoing card clears the viewport; verify responsive content, timing and repeated actions.

- [x] Moderate the oversized type scale while preserving bold weights, alignment and motion; verify desktop/mobile rendering and prototype checks.

- [x] Adapt the user-selected Avel reference: compact type, selective serif introduction, white rounded cards, pill controls and less empty card height; verify all six cards at desktop/mobile and refresh captures.

- [x] Use actual Avel font families, fallback stacks and type rules rather than Manrope/Lora substitutes; vertically align wordmark and header note and verify real rendered fonts plus desktop/mobile layout.

- [x] Correct header optical alignment from measured ink bounds and add an explicit first-save demo-match modal; verify modal focus, Escape, keyboard guard, once-per-run trigger, restart, reduced motion and responsive layout.

- [x] Show action stamps only during pointer drag, skip on the left and save on the right; verify hidden idle/button-exit state and exclusive progressive directional opacity in Chromium.

- [x] Remove permanent action buttons and replace accepted-swipe spring with bounded monotonic travel; verify slow/fast/reversed release, keyboard, repeated input and demo match.

- [x] Refine the sparse page composition with supporting editorial side panels and bounded vertical spacing while preserving the centered deck, fonts and button-free swipe behavior; verify 390/768/1440/2560 layouts, keyboard/match/restart, prototype checks and root lint/format.

- [x] Restore requested dislike/like buttons below the deck with spacing, shared decision lock and existing match/keyboard/swipe behavior; verify responsive controls and repeated actions.

## Execution

2026-10-31: User explicitly requested implementing a standalone prototype in the initial request. Sources and reference inspected before implementation. No Git operations authorized. Backend/database/deployment out of scope. Canonical specs are not synced while the experiment is active.

2026-10-31: Implementation and scoped local verification passed. Evidence: `prototypes/swipe-cards/VERIFICATION.md`; startup and tuning: its `README.md`; reviewed captures: `preview/desktop.png`, `preview/mobile.png`, `preview/completion.png`. Five prototype tests and 34 backend unit tests passed, strict builds/types/lint passed, production preview driven successfully. Native touch emulation and reduced-motion checks passed. No physical-device, screen-reader, PostgreSQL, Docker or hosted Actions verification is claimed. No commits/pushes: hosted completion is unverified and this change remains active, not archived.
