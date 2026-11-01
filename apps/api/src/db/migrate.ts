import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { Migrator, type MigrationProvider } from "kysely/migration";
import type { SqlDatabase } from "@api/db/kysely";

export const migrations: MigrationProvider = {
  async getMigrations() {
    return {
      "001_initial": {
        async up(db) {
          const tables = await sql<{ name: string }>`
            select tablename as name from pg_tables
            where schemaname = current_schema()
              and tablename not in ('kysely_migration', 'kysely_migration_lock')
          `.execute(db);
          if (tables.rows.length)
            throw new Error(
              "Fresh baseline requires an empty application schema; reset only the explicitly approved project database",
            );
          const baseline = await readFile(
            new URL("./migrations/001_initial.sql", import.meta.url),
            "utf8",
          );
          // This is committed SQL, never caller input. The Migrator owns its
          // transaction, history and PostgreSQL migration lock.
          await sql.raw(baseline).execute(db);
        },
      },
      "003_dev_seed": {
        async up(db) {
          const markers = await readFile(
            new URL("./migrations/003_dev_seed.sql", import.meta.url),
            "utf8",
          );
          await sql.raw(markers).execute(db);
        },
      },
      "002_membership_user_indexes": {
        async up(db) {
          const indexes = await readFile(
            new URL(
              "./migrations/002_membership_user_indexes.sql",
              import.meta.url,
            ),
            "utf8",
          );
          await sql.raw(indexes).execute(db);
        },
      },
    };
  },
};

export async function migrateDatabase(db: SqlDatabase, provider = migrations) {
  const current = await sql<{
    schema: string;
  }>`select current_schema() as schema`.execute(db);
  const migrationTableSchema = current.rows[0]?.schema;
  if (!migrationTableSchema) throw new Error("Database has no current schema");
  // Metadata discovery must be scoped too: other test schemas can contain
  // identically named history tables, even when search_path is isolated.
  const migrator = new Migrator({ db, provider, migrationTableSchema });
  const result = await migrator.migrateToLatest();
  if (result.error)
    throw new Error(
      "Database migration failed; verify the target schema and migration history",
      { cause: result.error },
    );
  return result.results ?? [];
}
