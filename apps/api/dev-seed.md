# Explicit local development data

This is an optional, **local-only** fixture set stored as ordinary database data.
Normal migrations and `bun run db:seed` remain dictionary-only. Startup never
creates these users or automatically reseeds them. There is no reset command.
Do not expose this known-password data on a shared/public installation.

## Run deliberately

First initialize the normal local stack (`docker compose up --build -d`). Once
its migration service has completed, use its tools image; no host Bun is needed:

```sh
docker compose run --rm --no-deps migrate bun run db:seed:dev --acknowledge-local-aster=db:5432/aster
```

This command reuses the migration service's development database URL. It does
not run a migration, create a session, or alter the Compose lifecycle. If needed,
build that service first with `docker compose build migrate`.

Alternatively, with host Bun and your existing local `DATABASE_URL` exported:

```sh
bun run db:migrate
bun run db:seed
bun run db:seed:dev --acknowledge-local-aster=127.0.0.1:55432/aster
```

The acknowledgement must exactly match the URL host, explicit port and `/aster`.
Use `localhost` instead of `127.0.0.1` if that is your URL host, and your actual
mapped port if different. The CLI permits only loopback hosts or Compose
`db:5432`, database `aster`, schema `public`, and `NODE_ENV` unset or
`development`. It refuses URL query/hash options, remote hosts, test/production
looking usernames, other databases (including `aster_test`), missing/wrong
acknowledgements, extra flags, and test/production environments. A local tunnel
is still the operator's responsibility: do not forward production databases to
an acknowledged local endpoint. Neither the URL nor passwords are logged.

## Fictional credentials and scenarios

All eight accounts use the deliberately public local password
`Aster-local-only-2026!`. Sign in normally; use separate browser profiles to keep
cookies independent. There is no actor switcher or fixture-only permission.

| Email                    | Profile and initial scenario                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `anna@aster.local.test`  | Анна: complete, discovery on; owns open **Карта городских инициатив**, mutual match/direct chat with Борис, team chat |
| `boris@aster.local.test` | Борис: complete, discovery on; accepted applicant/member of Анна's project, direct/team histories; not owner          |
| `vera@aster.local.test`  | Вера: complete, discovery on; undecided discovery candidate, pending application                                      |
| `gleb@aster.local.test`  | Глеб: complete, discovery off; owns closed **Архив хакатона: Добрый город**, retained team history                    |
| `dina@aster.local.test`  | Дина: complete, discovery on; rejected application, no team membership                                                |
| `egor@aster.local.test`  | Егор: complete, discovery on; withdrawn application, no team membership                                               |
| `nina@aster.local.test`  | Нина: incomplete, discovery off; profile-completion flow                                                              |
| `ilya@aster.local.test`  | Илья: incomplete, opted in but ineligible until completed                                                             |

From Анна/Борис, inspect the real match and both conversations, send ordinary
messages, edit a profile/project, or have Борис leave the team. From Анна,
inspect/accept/reject Вера's pending application. Other applicants can inspect
their own outcomes. Глеб can inspect a closed project and its conversation.
Нина/Илья can complete their profiles normally. These are real API operations;
closed recruitment, incomplete profiles and unauthorized histories remain
subject to the same rules as newly registered accounts.

## Repeat, conflict and failure policy

The command serializes runs with a PostgreSQL transaction advisory lock and
creates the entire graph plus versioned `dev_seed_markers` provenance in one
transaction. Passwords use Better Auth's normal `hashPassword` implementation,
computed before that transaction. Product IDs/timestamps use database defaults;
transaction-aware profile/membership helpers and database constraints preserve
match, owner, accepted-applicant and conversation invariants. HTTP services
which own their own transaction are not nested: this new-graph-only insertion
keeps auth and collaboration atomic and does not emit fake live events.

A rerun reports all previously applied scenario groups as skipped and leaves
them **untouched**. It does not restore deleted records/memberships, overwrite
passwords/content, reset outcomes, or add duplicate history. Group markers have
no foreign keys, intentionally surviving deletion. They are provenance, not
application authorization; do not delete/edit them to force a reseed.

An unrelated occupied seed email (including case variants), an incomplete
provenance ledger, or partial/ambiguous credentials for a still-existing seeded
user causes refusal, never adoption or password repair. A first-run SQL failure
rolls back accounts, profiles, scenarios and markers together. CLI errors are
sanitized rather than exposing database rows or credentials. Inspect conflicts
locally; there is no automatic repair/reset. A seed-owned user that was fully
deleted remains deleted. The fixed `frontend-mvp-v1` groups are not a mechanism
for reconciling ongoing product state.

## Focused verification

`apps/api/tests/integration/dev-seed.test.ts` runs through the isolated
integration runner, with a private random schema per test and cleanup of only
that schema. It covers dictionary-only initialization; first/repeat/concurrent
seed; injected late failure and retry; email/provenance/partial-auth conflicts;
preserved profile/project/password/application edits, leave and deleted records;
normal sign-in for every credential; API discovery/match/application privacy;
and authorized direct/team history and writes. The core accepts a scoped test
connection without weakening the CLI target guard.

Automated PostgreSQL/API evidence does not establish browser/Compose acceptance.
The complete browser journey, proxy behavior and runtime verification are
tracked separately in the active change.
