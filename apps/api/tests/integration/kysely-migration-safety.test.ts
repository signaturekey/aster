import { afterAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { migrateDatabase } from "@api/db/migrate";
import { sql } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `migration_safety_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
await sql`create schema ${sql.id(schema)}`.execute(admin);
const scoped = new URL(url);
scoped.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scoped.toString());
afterAll(async () => {
  await db.destroy();
  await sql`drop schema ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});

test("incompatible nonempty schema is rejected without adoption or data deletion", async () => {
  await sql`create table existing_data (id text primary key)`.execute(db);
  await sql`insert into existing_data values ('keep-me')`.execute(db);
  // Bun's asynchronous rejection matcher is typed void, but still must be awaited.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(migrateDatabase(db)).rejects.toThrow(
    "Database migration failed",
  );
  expect(
    (await sql<{ id: string }>`select id from existing_data`.execute(db)).rows,
  ).toEqual([{ id: "keep-me" }]);
  expect(
    (await sql`select name from kysely_migration`.execute(db)).rows,
  ).toEqual([]);
  expect(
    (
      await sql<{
        missing: boolean;
      }>`select to_regclass(${`${schema}.users`}) is null as missing`.execute(
        db,
      )
    ).rows[0]?.missing,
  ).toBe(true);
});
