# Proposal

## Why

Aster helps IT people find collaborators for startups, hackathons, and side projects through discovery and mutual interest. A locally runnable backend needs explicit collaboration rules and verification before autonomous implementation.

## What Changes

- Implement the agreed backend scope: email/password accounts, professional profiles, discovery decisions, mutual matches, projects/applications/teams, and direct/project text chats.
- Use Bun workspaces (`apps/api`, `packages/api-client`), a modular monolith, Elysia/TypeBox + Eden, PostgreSQL + Prisma, and Better Auth database sessions.
- Run the full local API/database stack through Docker Compose with reviewed migrations; use HTTP writes/history and SSE updates.
- Add GitHub Actions early: frozen install, Prisma generation, lint, types, unit/integration tests, migrations, API build, and Docker image build.
- Use small Conventional Commits on `main` and push to `https://github.com/signaturekey/aster` during the approved implementation run.
- Preserve `/health`. Track deferred ideas in `docs/backlog.md` rather than expanding the goal.

Following the requirements interview and documentation review, the user explicitly approved implementation through Claude Code `/goal` on 2026-10-30. Scoped implementation, verification, commits, and pushes to the agreed repository are authorized; deployment remains excluded.

## Capabilities

### New Capabilities

- `identity`: Email/password registration, database-backed sessions, and private account data.
- `profiles`: Professional profiles, completeness, dictionaries, and explicit discovery opt-in.
- `discovery-matches`: Private decisions, filtered cards, and atomic mutual matching.
- `project-teams`: Recruitment, repeatable applications, ownership, and membership.
- `conversations`: Match-only direct and membership-bound project text conversations with live events.
- `api-contracts`: Shared typed client, validated public data, local container startup, and automated acceptance.

### Modified Capabilities

None. The implemented `health` contract remains unchanged.

## Impact

Future work changes the package layout, database schema, authentication, API, tests, Docker setup, CI, and development documentation. This revision changes documentation only; implementation tasks remain open.

Excluded: frontend/mobile apps, OAuth, email verification/recovery/SMTP, avatars/uploads, blocking/reporting/unmatching, account deletion, message editing/deletion, social feed, standalone group chats, presence/read receipts, Redis/Socket.IO, smoke/E2E suites, commitlint/hooks, image publication, and deployment. Public-launch safety and data lifecycle work is deferred explicitly, not assumed unnecessary.
