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
const schema = `foundation_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
await sql`create schema ${sql.id(schema)}`.execute(admin);
const scopedUrl = new URL(url);
scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scopedUrl.toString());
afterAll(async () => {
  await db.destroy();
  await sql`drop schema ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});

test("Kysely initializes the fresh schema once and serializes migration runners", async () => {
  await Promise.all([migrateDatabase(db), migrateDatabase(db)]);
  expect(await migrateDatabase(db)).toEqual([]);
  const history = await sql<{
    name: string;
  }>`select name from kysely_migration`.execute(db);
  expect(history.rows.map((row) => row.name)).toEqual(["001_initial"]);
  const tables = await sql<{
    count: number;
  }>`select count(*)::int as count from information_schema.tables where table_schema = ${schema}`.execute(
    db,
  );
  expect(tables.rows[0]?.count).toBe(22);
});

test("SQL defaults and deferred owner membership work without ORM generation", async () => {
  await db
    .insertInto("users")
    .values({
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      image: null,
    })
    .execute();
  await db
    .insertInto("goals")
    .values({ id: "startup", label: "Startup" })
    .execute();
  const project = await db.transaction().execute(async (tx) => {
    const row = await tx
      .insertInto("projects")
      .values({
        owner_id: "owner",
        title: "Project",
        description: "Description",
        goal_id: "startup",
        required_roles: ["backend"],
      })
      .returning(["id", "created_at", "updated_at", "required_roles"])
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("project_members")
      .values({ project_id: row.id, user_id: "owner" })
      .execute();
    return row;
  });
  expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(project.created_at).toBeInstanceOf(Date);
  expect(project.updated_at).toBeInstanceOf(Date);
  expect(project.required_roles).toEqual(["backend"]);
  const profile = await db
    .insertInto("profiles")
    .values({ user_id: "owner", specialization_id: null, experience_id: null })
    .returning(["portfolio_links", "specialization_id"])
    .executeTakeFirstOrThrow();
  expect(profile).toEqual({ portfolio_links: [], specialization_id: null });
  const invalid = db
    .insertInto("projects")
    .values({
      owner_id: "owner",
      title: "No membership",
      description: "Description",
      goal_id: "startup",
      required_roles: [],
    })
    .execute();
  // Bun types async rejection assertions as void even though they must be awaited.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(invalid).rejects.toMatchObject({ code: "23503" });
});

test("a failed migration rolls back DDL and does not record successful history", async () => {
  const bad = migrateDatabase(db, {
    async getMigrations() {
      return {
        "001_initial": { async up() {} },
        "002_failure": {
          async up(tx) {
            await sql`create table should_rollback (id text)`.execute(tx);
            throw new Error("Injected failure");
          },
        },
      };
    },
  });
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(bad).rejects.toThrow("Database migration failed");
  const row = await sql<{
    exists: boolean;
  }>`select to_regclass(${`${schema}.should_rollback`}) is not null as exists`.execute(
    db,
  );
  expect(row.rows[0]?.exists).toBe(false);
  const history = await sql<{
    name: string;
  }>`select name from kysely_migration`.execute(db);
  expect(history.rows.map((item) => item.name)).toEqual(["001_initial"]);
});
