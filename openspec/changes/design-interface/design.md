# Design

## Context

See proposal.md for motivation and the interface-preview delta for the observable scope. Current implementation is a modular backend and standalone swipe experiment; root DESIGN.md records user-selected Avel fonts, restrained typography, warm palette and the refined motion behavior. Actual profile/project/discovery/conversation schemas and project routes were inspected. Product main specs currently cover health/database lifecycle only; archived product specs are historical, not new authorization.

The user requested layout, not live integration. This design therefore provides a connected local preview rather than treating backend-shaped fixtures as real authentication or network operations. It is cross-cutting across all product areas, so a design artifact is necessary.

## Goals / Non-Goals

**Goals:** reusable visual language, discoverable navigation, coherent local transitions and inspectable error/empty/role states, without losing the refined deck behavior.

**Non-Goals:** backend/API changes, real login, storage, server events, infrastructure, production frontend decisions or a new browser test suite in backend CI.

## Decisions

### Isolated prototype rather than apps/web

Use `prototypes/interface` with its own package.json, Bun lockfile and self-contained strict tsconfig. React/TypeScript/Vite/Motion and actual Fontsource families match the proven prototype. Do not convert the existing deck in place or add a root workspace: preserving it avoids regressions and does not silently commit to the production application boundary. ESLint already includes `prototypes/*/tsconfig.json` and TSX.

No API imports, backend type graph or generated DTOs. Local view-model types describe presentation fixtures, not duplicated public transport contracts. No backend aliases propagate into this package. Browser bundles must remain server-runtime-free. Real transport validation and Eden integration belong to a later change. Existing schema field limits guide local form validation; no Zod layer is introduced.

### Route-oriented pages with shared local state

Use React Router with BrowserRouter for explicit URLs and back/forward support. This dependency is justified by nested project/conversation routes and predictable navigation; hand-written hash parsing would duplicate route matching and focus handling. Vite provides local history fallback.

Suggested routes:

- `/sign-in`, `/sign-up`, `/onboarding`
- `/discover`, `/people/:personId`, `/matches`
- `/profile`, `/profile/edit`
- `/projects`, `/projects/new`, `/projects/:projectId`, `/projects/:projectId/edit`, `/projects/:projectId/manage`
- `/my-projects`, `/applications`
- `/messages`, `/messages/:conversationId`
- fallback not-found view

Provide a compact app header/nav, active section, mobile navigation and a persistent demo indicator. Route changes update document title and primary-content focus when appropriate. Reuse page headers, cards, badges, form fields, state panels and dialogs rather than a large all-page component.

Use a small Context + reducer for fictional profiles, decisions, matches, projects, applications, memberships and messages. No generic repository/event bus/store framework. Separate pure transition helpers allow Bun unit tests. Do not store password input in shared state or local/session storage. All state resets on reload and through a demo-reset action.

### Representative fixtures and role inspection

Seed enough fictional people/projects/threads to show meaningful lists, filters, empty results and member/owner scenarios. The default actor can own one project and participate in another. A clearly marked preview-only actor/state control may inspect owner/applicant roles; it is not impersonation or a product admin feature. No seed requests to the real backend.

Transitions use the existing business shape: people matches only; project application acceptance grants membership; close blocks submit/accept but preserves pending/team/chat; current owner alone manages; owner transfers before leaving. Avoid a second backend implementation: model just these necessary local transitions and show unsupported/conflict actions explicitly.

Use fixture reciprocal interest to demonstrate people matches, not a guaranteed first-save match for all people. Preserve the original project-demo match only in the untouched swipe experiment. No incoming-like lists, arbitrary direct chat creation, unmatch or deck-reset UI; global demo reset is clearly distinct.

### Visual system and interaction reuse

Follow root DESIGN.md. Extract/adapt the proven drag mechanics into a people deck in the new prototype: stable keyed cards, direct x tracking, progressive depth, distance/velocity decisions, bounded 180–380ms accepted exits, spring return, once guard, reduced-motion fade. Keep left dislike/right like buttons with measured clearance under rotated layers. Do not use large typography as a substitute for font weight.

Native dialog or an equivalent accessible existing implementation handles focus and Escape. Keep actual Avel fallback stacks and acknowledge platform Cyrillic differences. Use initials/original art, not personal-image downloads or uploads. On mobile, navigation/forms/threads remain primary; avoid duplicate editorial copy below every page.

### State preview without fake service behavior

A documented preview panel/query selects representative loading, empty, error, expired, unavailable, conflict or invalid-input treatments for the current view. Label them as design states. Normal local actions are synchronous unless a short explicit local sending treatment is useful; no manufactured network success. Recovery buttons return to normal preview or preserve form drafts as appropriate.

### Checks and infrastructure boundaries

Standalone scripts: dev on loopback port 5175 (5173 remains the original prototype), typecheck, test, build, preview. Root backend commands remain stable; documentation must explicitly distinguish prototype and backend checks. Root lint/format includes new files.

Use one-off Chromium inspection at 390/1440 and wider/narrower breakpoints, not a new committed E2E suite. Unit-test local transitions/validation, and run strict build plus root regression checks as appropriate. No migrations, Docker or deployment changes; existing Compose startup remains unaffected. Hosted CI cannot be claimed without an authorized push and successful latest run. No Git operations are authorized.

## Risks / Trade-offs

- Local demo mistaken for functional product → persistent demo label, no auth/delivery claims, no backend requests, no credential persistence.
- Large page scope turning into static disconnected mockups → shared fixtures/reducer, route links and a documented clickable journey for each slice.
- Local transition model drifting from backend → use inspected schemas/routes and scope transitions narrowly; defer real races/authorization guarantees to integration, do not claim a reducer proves server invariants.
- Typography differs across platforms → preserve explicit Avel stack, inspect real Cyrillic rendering and report device limitations.
- Too much abstraction or one oversized page component → small shared visual primitives and feature page modules; no generic infrastructure.
- Preview-state controls pollute product design → segregate and label them, no fake admin/notification controls.

## Migration Plan

No migration or deployment. Add the isolated package, retain the original prototype and backend commands, document both URLs. Rollback means removing only the new package and its tracking changes after inspecting user edits; no data or database changes are involved.

### Approved landing extension

User explicitly requested a landing with polished motion and resource research. Root `/` becomes a standalone public demo landing; `/discover` and existing routes retain their behavior. Apple iPhone page was inspected in Chromium at 1440/390, including scroll and screenshots: large product focal point, chapter composition, restrained controls and generous but bounded spacing. OpenAI and Tesla returned HTTP 403 and were not visually studied. Motion useScroll/accessibility docs were retrieved. Adapt principles, never copy brand layouts/assets. Use local original card artwork, scroll-linked transform/opacity, a narrative people-to-project sequence, real local CTA links and existing fonts/palette. No autoplay video, WebGL, scroll interception, fake testimonials/activity or backend claims. Reduced motion renders complete static artwork; CSS and motion settings remain page-scoped. No new dependencies.
