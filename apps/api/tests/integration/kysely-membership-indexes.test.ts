import { afterAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { migrateDatabase, migrations } from "@api/db/migrate";
import { sql } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `membership_indexes_${crypto.randomUUID().replaceAll("-", "")}`;
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

test("membership indexes upgrade a populated baseline once without changing rows", async () => {
  // Recreate a database that already applied the baseline, rather than testing
  // only fresh startup where both migrations would run in one transaction.
  const baseline = (await migrations.getMigrations())["001_initial"];
  if (!baseline) throw new Error("Missing committed baseline");
  await migrateDatabase(db, {
    async getMigrations() {
      return { "001_initial": baseline };
    },
  });
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
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto("projects")
      .values({
        id: "project",
        owner_id: "owner",
        title: "Existing project",
        description: "Preserve during upgrade",
        goal_id: "startup",
        required_roles: [],
      })
      .execute();
    await tx
      .insertInto("project_members")
      .values({ project_id: "project", user_id: "owner" })
      .execute();
    await tx
      .insertInto("conversations")
      .values({ id: "conversation", project_id: "project", match_id: null })
      .execute();
    await tx
      .insertInto("conversation_members")
      .values({ conversation_id: "conversation", user_id: "owner" })
      .execute();
  });
  const before = {
    project: await db.selectFrom("projects").selectAll().execute(),
    members: await db.selectFrom("project_members").selectAll().execute(),
    chatMembers: await db
      .selectFrom("conversation_members")
      .selectAll()
      .execute(),
  };
  const results = await Promise.all([migrateDatabase(db), migrateDatabase(db)]);
  expect(results.flat()).toEqual([
    {
      migrationName: "002_membership_user_indexes",
      direction: "Up",
      status: "Success",
    },
    {
      migrationName: "003_dev_seed",
      direction: "Up",
      status: "Success",
    },
  ]);
  expect(await migrateDatabase(db)).toEqual([]);
  expect(await db.selectFrom("projects").selectAll().execute()).toEqual(
    before.project,
  );
  expect(await db.selectFrom("project_members").selectAll().execute()).toEqual(
    before.members,
  );
  expect(
    await db.selectFrom("conversation_members").selectAll().execute(),
  ).toEqual(before.chatMembers);

  const indexes = await sql<{ indexname: string; indexdef: string }>`
    select indexname, indexdef from pg_indexes
    where schemaname = ${schema}
      and indexname in (
        'conversation_members_user_id_conversation_id_idx',
        'project_members_user_id_project_id_idx'
      )
    order by indexname
  `.execute(db);
  expect(indexes.rows).toHaveLength(2);
  expect(indexes.rows[0]?.indexdef).toContain(
    "USING btree (user_id, conversation_id)",
  );
  expect(indexes.rows[1]?.indexdef).toContain(
    "USING btree (user_id, project_id)",
  );
  expect(
    (await sql`select name from kysely_migration order by name`.execute(db))
      .rows,
  ).toEqual([
    { name: "001_initial" },
    { name: "002_membership_user_indexes" },
    { name: "003_dev_seed" },
  ]);
});
