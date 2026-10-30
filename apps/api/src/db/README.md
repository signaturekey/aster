# PostgreSQL persistence

The Kysely port is staged alongside the current Prisma runtime until its modules
and route tests pass. `kysely.ts` owns the new pg pool; `destroy()` releases it.
`types.ts` contains handwritten physical table types; SQL migrations are the
schema authority. There is no code generator or naming plugin.

Run the new migration/seed entrypoints explicitly during the staged port:

```sh
DATABASE_URL=postgresql://... bun apps/api/src/db/commands.ts migrate
DATABASE_URL=postgresql://... bun apps/api/src/db/commands.ts seed
```

The baseline requires an empty application schema and never adopts or deletes
existing tables. Kysely serializes migration runners and rolls back failed DDL.
Append future migrations; do not edit a baseline already applied to a database.
Seed upserts only dictionaries. Product UUID IDs and timestamps use SQL defaults;
mutation code owns `updated_at`, with no triggers or writes on reads/no-ops.

Integration checks use random schemas inside the explicitly disposable
`aster_test` database and drop only schemas they created. Normal startup/tests
must never reset the working database. The user-approved one-time transition
reset is restricted to Compose project `aster`, work volume
`aster_postgres-data`/database `aster`, and tmpfs test service/database
`test-db`/`aster_test`; do not prune unrelated Docker resources.
