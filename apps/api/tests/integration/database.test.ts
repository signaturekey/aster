import { expect, test } from "bun:test";
import { dictionaries } from "@api/db/dictionaries";
import { seedDictionaries } from "@api/db/seed";
import { db } from "./helpers";
import { sql } from "kysely";

test("committed migrations run against real PostgreSQL", async () => {
  const result = await sql<{
    database: string;
    version: string;
  }>`select current_database() as database,version() as version`.execute(db);
  expect(result.rows[0]?.database).toBe("aster_test");
  expect(result.rows[0]?.version).toContain("PostgreSQL");
});

test("dictionary seed is idempotent and stable", async () => {
  await seedDictionaries(db);
  await seedDictionaries(db);
  expect(
    await db
      .selectFrom("specializations")
      .select("id")
      .where(
        "id",
        "in",
        dictionaries.specializations.map((item) => item.id),
      )
      .execute(),
  ).toHaveLength(dictionaries.specializations.length);
  expect(await db.selectFrom("skills").select("id").execute()).toHaveLength(
    dictionaries.skills.length,
  );
  expect(
    await db.selectFrom("experience_levels").select("id").execute(),
  ).toHaveLength(dictionaries.experienceLevels.length);
  expect(
    await db
      .selectFrom("goals")
      .select(["id", "label"])
      .orderBy("id")
      .execute(),
  ).toEqual(dictionaries.goals.toSorted((a, b) => a.id.localeCompare(b.id)));
});

test("database primary keys reject duplicate dictionary identifiers", async () => {
  // Bun's rejection assertion is asynchronous despite its void declaration.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(
    db
      .insertInto("goals")
      .values({ id: "startup", label: "Duplicate" })
      .execute(),
  ).rejects.toMatchObject({ code: "23505" });
});
