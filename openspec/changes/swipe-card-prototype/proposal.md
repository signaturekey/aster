# Proposal

## Why

Evaluate a warm editorial visual direction and tactile project-card interaction before selecting the main platform frontend architecture.

## Authorization

On 2026-10-31 the user explicitly requested implementation of this standalone local prototype, including a React/TypeScript/Vite/Motion fallback where no UI stack exists, and browser verification. This is a narrowly approved exception to the backend-only scope; it does not authorize the main frontend, deployment, or Git operations. No additional product behavior or backlog work is approved.

## What Changes

- Add one independent local-data prototype under `prototypes/swipe-cards`, outside the backend workspaces and without `apps/web`.
- Present six clearly fictional project cards with drag, save/skip buttons, keyboard control, count, completion and restart.
- Isolate design tokens and motion settings, preserve mobile scrolling, and respect reduced motion.
- Document sources, startup, and actual verification evidence. Do not add a browser/E2E suite to backend CI.

## Capabilities

### New Capabilities

- `swipe-card-prototype`: Local-only visual and interaction experiment.

### Modified Capabilities

None. API, authentication, database, shared client, and implemented backend specs remain unchanged.

## Impact

Standalone React, Motion, Vite and locally bundled open fonts; minimal ESLint scope extension for the prototype's strict TypeScript config. No backend connections, database operations, workspace dependency changes, deployment, commits or pushes.
