# PostgreSQL persistence

Kysely with the pg driver owns one pool, released through `destroy()`. Better Auth
borrows the same instance. `types.ts` contains handwritten physical table types;
SQL migrations are schema authority. No code generator or naming plugin is used.

```sh
bun run db:migrate
bun run db:seed
```

Both commands require `DATABASE_URL`. The initial baseline requires an empty
application schema and never adopts or deletes existing tables. Kysely serializes
migration runners and rolls back failed DDL; history is scoped to the current
schema. Append future migrations, never edit a baseline already applied to a DB.
Seed upserts only dictionaries. Product UUID IDs and timestamps use SQL defaults;
mutation code owns `updated_at`, without triggers or writes on reads/no-ops.

Integration tests use explicit disposable `aster_test`, run with per-file module
isolation so each file owns its pool, and use random schemas for focused SQL
checks. Each check drops only its own schema. Normal startup/tests never reset
the working database. The separately approved one-time transition reset is
restricted to Compose project `aster`, volume `aster_postgres-data` / DB `aster`,
and tmpfs test service `test-db` / DB `aster_test`. Never prune unrelated resources.
