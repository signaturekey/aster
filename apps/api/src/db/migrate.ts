import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { Migrator, type MigrationProvider } from "kysely/migration";
import type { SqlDatabase } from "@api/db/kysely";

export const migrations: MigrationProvider = {
  async getMigrations() {
    return {
      "001_initial": {
        async up(db) {
          const baseline = await readFile(
            new URL("./migrations/001_initial.sql", import.meta.url),
            "utf8",
          );
          // This is committed SQL, never caller input. The Migrator owns its
          // transaction, history and PostgreSQL migration lock.
          await sql.raw(baseline).execute(db);
        },
      },
    };
  },
};

export async function migrateDatabase(db: SqlDatabase, provider = migrations) {
  const migrator = new Migrator({ db, provider });
  const result = await migrator.migrateToLatest();
  if (result.error)
    throw new Error(
      "Database migration failed; verify the target schema and migration history",
      { cause: result.error },
    );
  return result.results ?? [];
}
