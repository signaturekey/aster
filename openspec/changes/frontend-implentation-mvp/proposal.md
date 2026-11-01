# Proposal

## Why

Aster has a real collaboration backend and a React-based local interface preview, but no browser application that connects the two. The agreed goal is a locally runnable Russian-language product where real accounts can discover collaborators, build teams and exchange messages through the API, without frontend fixtures or simulated success.

## What Changes

- Add `@aster/web` at `apps/web` to the existing Bun monorepo and root lockfile: React/TypeScript/Vite/React Router SPA, Tailwind CSS, selectively adopted shadcn/ui, Motion, React Hook Form and TanStack Query.
- Use the existing Eden client for product HTTP calls. Do not add Axios or Zod initially; Eden supplies inferred transport types, not runtime validation. Add Zustand only for a demonstrated shared client-state need.
- Implement lightweight `app/pages/features/entities/shared` organization, with no mandatory widgets/processes, generic repositories or separate UI workspace.
- Preserve the visual system and motion of root `DESIGN.md` and `prototypes/interface`, including the landing. Reference those sources instead of duplicating their tokens. Remove demo controls and fixture-driven business behavior from the real application, not from the preserved preview.
- Connect registration/session/logout, onboarding and profiles, people discovery/matches, projects/applications/team ownership, and direct/project conversations to real API state and permissions. Use Russian copy without i18n or SSR.
- Add server-side project title/description substring search and a goal filter. **BREAKING:** change conversation-list ordering from creation order to last-activity order, with enriched authorized summaries and a corresponding cursor contract. Existing public fields remain; consumers must restart conversation pagination after upgrade.
- Support bounded simultaneous SSE connections for multiple tabs without user-level replacement, retaining HTTP-authoritative history, idempotent message retries and bounded best-effort delivery. Reconcile with `backend-review-fixes`; do not undo its queue, concurrency or text-fidelity safeguards.
- Add a same-origin local HTTP Caddy/static-SPA service to Compose, preserving separate API/PostgreSQL/migration services and a Vite proxy for development. Build and run without host Bun.
- Add an explicit development-data seed command using real database records and normal password hashing. Keep ordinary startup/dictionary seeding free of demo accounts; do not reset existing data.
- Extend existing local/CI checks for the workspace, API additions and images, with documented manual browser/Compose acceptance, not automated smoke/E2E/browser suites.

## Capabilities

### New Capabilities

- `web-experience`: Russian responsive navigation, visual-source ownership, state boundaries, form/error behavior and session-scoped client data.
- `web-identity-profiles`: Real cookie-authenticated entry, onboarding and own/other professional profile views.
- `web-discovery`: Real people decisions, mutual matches and directly linked conversations.
- `web-projects`: Searchable project catalogue, project/application/team workflows and server-authoritative permissions.
- `web-conversations`: Authorized conversation summaries, paginated history, safe sending, multi-tab SSE and HTTP recovery.
- `local-app-runtime`: Same-origin container/development startup and reproducible verification boundaries.

### Modified Capabilities

- `database-lifecycle`: Clarify dictionary-only ordinary seed versus explicitly invoked, non-destructive development collaboration seed.

## Impact

New web workspace and dependencies; root lockfile, lint/typecheck/unit/build scripts, browser-safe client/type propagation, API query/schema/service changes, optional reviewed additive migrations, development seed tooling, Docker/Caddy/Compose, GitHub Actions and concise startup/verification documentation. No canonical spec synchronization until implementation and verification.

Planning was explicitly requested after grilling on 2026-10-31; implementation still requires a new approval after these artifacts are reviewed. Later implementation must use a separate worktree and preserve unrelated edits. `DESIGN.md` and previews are Git-ignored local references, not committed application inputs; copy the needed references safely into that worktree. Builds must not depend on their presence, and ignoring does not authorize deletion. Commits, pushes, publication, destructive database operations and deployment are not authorized.

Excluded: frontend API fixtures, actor switching/demo reset/state simulators, artificial latency, fabricated activity, OAuth/recovery/mail, uploads, attachments, unread/read/presence/typing, dedicated search infrastructure, Socket.IO/Redis, durable event delivery, non-message live updates/polling, persistent drafts, i18n, SSR, dark theme, mobile apps and other backlog items. Decorative landing examples are illustrations, not purported real users or statistics. Deferred ideas are recorded locally in `docs/backlog.md`, which is not required to exist in fresh clones.
