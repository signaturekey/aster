import { afterAll, expect, test } from "bun:test";
import { dictionaries } from "../../prisma/dictionaries";
import { createDatabase } from "../../src/db/client";
import { seedDictionaries } from "../../src/db/seed";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
) {
  throw new Error(
    "Run integration tests through bun run test:integration against aster_test",
  );
}
const db = createDatabase(url);
afterAll(() => db.$disconnect());

test("committed migrations run against real PostgreSQL", async () => {
  const result = await db.$queryRaw<{ database: string; version: string }[]>`
    SELECT current_database() AS database, version() AS version
  `;
  expect(result[0]?.database).toBe("aster_test");
  expect(result[0]?.version).toContain("PostgreSQL");
});

test("dictionary seed is idempotent and stable", async () => {
  await seedDictionaries(db);
  await seedDictionaries(db);
  expect(await db.specialization.count()).toBe(
    dictionaries.specializations.length,
  );
  expect(await db.skill.count()).toBe(dictionaries.skills.length);
  expect(await db.experienceLevel.count()).toBe(
    dictionaries.experienceLevels.length,
  );
  expect(await db.goal.findMany({ orderBy: { id: "asc" } })).toEqual(
    dictionaries.goals.toSorted((a, b) => a.id.localeCompare(b.id)),
  );
});

test("database primary keys reject duplicate dictionary identifiers", async () => {
  await expect(
    Promise.resolve(
      db.goal.create({ data: { id: "startup", label: "Duplicate" } }),
    ),
  ).rejects.toMatchObject({ code: "P2002" });
});
