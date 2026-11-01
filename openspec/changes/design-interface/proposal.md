# Proposal

## Why

The single swipe-card experiment establishes a visual direction but cannot validate navigation, forms, team workflows or messaging. A coherent local interface is needed before integrating the existing backend.

## Scope and authorization

On 2026-10-31 the user requested all pages, asked for DESIGN.md based on Avel, then explicitly allowed layout work after the document. This proposal captures a local clickable UI interpretation: API integration was not selected and remains excluded. This narrowly extends the earlier backend-only scope for an interface prototype, not production delivery. Planning workflow still requires presenting these artifacts before apply.

## What Changes

- Add an independent multi-page local React/TypeScript/Vite/Motion interface under `prototypes/interface`, preserving `prototypes/swipe-cards` and backend workspaces.
- Apply root DESIGN.md and the actual Avel font stack, responsive navigation, compact forms, cards and accessible dialogs.
- Cover sign-in/register demonstrations, own profile/onboarding, people discovery and public profiles, matches, projects, applications, team management and conversations.
- Use shared fictional in-memory state with functional local interactions and clearly labeled simulation; discard entered passwords rather than storing credentials.
- Distinguish mutual interest between people from application/owner approval for projects.
- Include representative loading, empty, validation, unavailable and access/state-conflict views through a documented local preview mechanism.

## Capabilities

### New Capabilities

- `interface-preview`: Responsive connected page layouts and local demonstration of the Aster collaboration journey.

### Modified Capabilities

None. Existing backend requirements and APIs remain unchanged.

## Impact

New standalone prototype and lockfile, minimal lint/type-project registration if needed, source/start/verification documentation. No API runtime/client imports or requests, database changes, authentication delivery, Docker/deployment, commits or pushes. Exclude production frontend integration, OAuth/recovery/mail, uploads/avatars, notifications/presence/read receipts, social feeds, quotas/invitations and backlog features. Page illustrations use initials and original decoration, not remote personal assets. Exact navigation labels and routes are implementation defaults, not new business behavior.
