import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { seedSqlDictionaries } from "@api/db/kysely-seed";
import { migrateDatabase } from "@api/db/migrate";
import {
  getDictionaries,
  getProfile,
  getProfileRows,
  publicProfile,
  requireCompleteProfile,
  updateProfile,
} from "@api/modules/profiles/service";
import type { ProfilePatch } from "@api/modules/profiles/schemas";
import {
  dictionariesSchema,
  profileSchema,
} from "@api/modules/profiles/schemas";
import { TypeCompiler } from "elysia/type-system";
import {
  sql,
  TableNode,
  type KyselyPlugin,
  type RootOperationNode,
} from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `profiles_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
const scopedUrl = new URL(url);
scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scopedUrl.toString());

beforeAll(async () => {
  await sql`create schema ${sql.id(schema)}`.execute(admin);
  await migrateDatabase(db);
  await seedSqlDictionaries(db);
});
afterAll(async () => {
  await db.destroy();
  await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});

const complete = {
  displayName: "Engineer",
  specializationId: "backend",
  skillIds: ["typescript", "sql"],
  goalIds: ["startup", "hackathon"],
  portfolioLinks: ["https://example.test/work"],
  discoverable: true,
};

async function createUser() {
  const id = crypto.randomUUID();
  return db
    .insertInto("users")
    .values({
      id,
      name: "Private account name",
      email: `${id}@example.test`,
      image: "https://example.test/private-image",
    })
    .returning(["id", "created_at as createdAt"])
    .executeTakeFirstOrThrow();
}

function observeQueries(
  onQuery: (node: RootOperationNode) => void,
): KyselyPlugin {
  return {
    transformQuery({ node }) {
      onQuery(node);
      return node;
    },
    async transformResult({ result }) {
      return result;
    },
  };
}

async function storedProfile(userId: string) {
  return db
    .selectFrom("profiles")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

test("Kysely defaults and completeness guards are stable read-only public projections", async () => {
  const user = await createUser();
  const queries: RootOperationNode[] = [];
  const observed = db.withPlugin(observeQueries((node) => queries.push(node)));
  const initial = await getProfile(observed, user.id);
  expect(initial).toEqual({
    userId: user.id,
    displayName: "",
    bio: "",
    specializationId: null,
    experienceId: null,
    skillIds: [],
    goalIds: [],
    portfolioLinks: [],
    discoverable: false,
    complete: false,
    missingFields: ["displayName", "specializationId", "skillIds", "goalIds"],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.createdAt.toISOString(),
  });
  expect(await getProfile(observed, user.id)).toEqual(initial);
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(
    observed.transaction().execute((tx) => requireCompleteProfile(tx, user.id)),
  ).rejects.toMatchObject({ status: 409, code: "PROFILE_INCOMPLETE" });
  expect(await storedProfile(user.id)).toBeUndefined();
  expect(queries.every((node) => node.kind === "SelectQueryNode")).toBe(true);
  const serializedQueries = JSON.stringify(queries);
  for (const privateField of ["email", "name", "image", "accounts", "sessions"])
    expect(serializedQueries).not.toContain(`"name":"${privateField}"`);
  expect(TypeCompiler.Compile(profileSchema).Check(initial)).toBe(true);
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(getProfile(db, "missing")).rejects.toMatchObject({
    status: 404,
    code: "PROFILE_NOT_FOUND",
  });
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(updateProfile(db, "missing", {})).rejects.toMatchObject({
    status: 404,
    code: "PROFILE_NOT_FOUND",
  });
});

test("Kysely patches preserve completeness, opt-out, nulls, and default database timestamps", async () => {
  const user = await createUser();
  const initialized = await updateProfile(db, user.id, {});
  const stored = await storedProfile(user.id);
  if (!stored) throw new Error("Expected initialized profile");
  expect(stored.created_at).toBeInstanceOf(Date);
  expect(initialized.createdAt).toBe(stored.created_at.toISOString());
  expect(initialized.updatedAt).toBe(initialized.createdAt);
  const profile = await updateProfile(db, user.id, {
    ...complete,
    bio: "Biography",
    experienceId: "senior",
  });
  expect(profile).toMatchObject({
    ...complete,
    skillIds: ["sql", "typescript"],
    goalIds: ["hackathon", "startup"],
    complete: true,
    bio: "Biography",
    experienceId: "senior",
    createdAt: initialized.createdAt,
  });
  const row = await db
    .transaction()
    .execute((tx) => requireCompleteProfile(tx, user.id, { discovery: true }));
  expect(publicProfile(row)).toEqual(profile);
  const optedOut = await updateProfile(db, user.id, { discoverable: false });
  expect(optedOut.complete).toBe(true);
  expect((await requireCompleteProfile(db, user.id)).discoverable).toBe(false);
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(
    requireCompleteProfile(db, user.id, { discovery: true }),
  ).rejects.toMatchObject({ code: "DISCOVERY_DISABLED" });
  expect(await getProfile(db, user.id)).toEqual(optedOut);
  const cleared = await updateProfile(db, user.id, {
    displayName: " \t\n ",
    specializationId: null,
    experienceId: null,
    skillIds: [],
    goalIds: [],
    portfolioLinks: [],
  });
  expect(cleared).toMatchObject({
    bio: "Biography",
    experienceId: null,
    discoverable: false,
    complete: false,
    missingFields: ["displayName", "specializationId", "skillIds", "goalIds"],
    skillIds: [],
    goalIds: [],
    portfolioLinks: [],
  });
});

test("Kysely empty and same-value patches do not issue UPDATEs or change updated_at", async () => {
  const user = await createUser();
  await updateProfile(db, user.id, complete);
  const oldTimestamp = new Date("2020-01-01T00:00:00.000Z");
  await db
    .updateTable("profiles")
    .set({ updated_at: oldTimestamp })
    .where("user_id", "=", user.id)
    .execute();
  const queries: RootOperationNode[] = [];
  const observed = db.withPlugin(observeQueries((node) => queries.push(node)));
  for (const input of [
    {},
    complete,
    {
      ...complete,
      skillIds: ["sql", "typescript"],
      goalIds: ["hackathon", "startup"],
      bio: "",
      experienceId: null,
    },
  ]) {
    const profile = await updateProfile(observed, user.id, input);
    expect(profile.updatedAt).toBe(oldTimestamp.toISOString());
  }
  expect(queries.some((node) => node.kind === "UpdateQueryNode")).toBe(false);
  expect(queries.some((node) => node.kind === "DeleteQueryNode")).toBe(false);
  const changed = await updateProfile(db, user.id, { skillIds: ["python"] });
  expect(changed.updatedAt > oldTimestamp.toISOString()).toBe(true);
  expect(changed.skillIds).toEqual(["python"]);
});

test("Kysely dictionary validation and late failures roll back first and existing patches", async () => {
  const user = await createUser();
  const invalidPatches: ProfilePatch[] = [
    { specializationId: "unknown" },
    { experienceId: "unknown" },
    { skillIds: ["typescript", "unknown"] },
    { goalIds: ["unknown"] },
    { skillIds: ["typescript", "typescript"] },
    { goalIds: ["startup", "startup"] },
  ];
  for (const input of invalidPatches) {
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(
      updateProfile(db, user.id, { displayName: "Must not persist", ...input }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_DICTIONARY_VALUE" });
    expect(await storedProfile(user.id)).toBeUndefined();
  }
  const failing = db.withPlugin(
    observeQueries((node) => {
      if (
        node.kind === "InsertQueryNode" &&
        node.into?.table.identifier.name === "profile_skills"
      )
        throw new Error("Injected join insert failure");
    }),
  );
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(updateProfile(failing, user.id, complete)).rejects.toThrow(
    "Injected join insert failure",
  );
  expect(await storedProfile(user.id)).toBeUndefined();
  const initial = await updateProfile(db, user.id, complete);
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(
    updateProfile(failing, user.id, {
      displayName: "Must roll back",
      skillIds: ["python"],
      goalIds: ["learning"],
    }),
  ).rejects.toThrow("Injected join insert failure");
  expect(await getProfile(db, user.id)).toEqual(initial);
  for (const input of invalidPatches) {
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(updateProfile(db, user.id, input)).rejects.toMatchObject({
      code: "INVALID_DICTIONARY_VALUE",
    });
    expect(await getProfile(db, user.id)).toEqual(initial);
  }
});

test("Kysely concurrent first patches initialize once and retain independent fields", async () => {
  const user = await createUser();
  await Promise.all([
    updateProfile(db, user.id, complete),
    updateProfile(db, user.id, { bio: "Concurrent biography" }),
  ]);
  const profile = await getProfile(db, user.id);
  expect(profile).toMatchObject({
    displayName: "Engineer",
    bio: "Concurrent biography",
    skillIds: ["sql", "typescript"],
    goalIds: ["hackathon", "startup"],
    complete: true,
  });
  expect(
    await db
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", user.id)
      .execute(),
  ).toHaveLength(1);
});

test("Kysely deterministic overlapping collection replacements serialize at the profile lock", async () => {
  const user = await createUser();
  await updateProfile(db, user.id, complete);
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const lockQueries = new WeakSet<object>();
  let paused = false;
  const first = db.withPlugin({
    transformQuery({ node, queryId }) {
      if (
        !paused &&
        node.kind === "SelectQueryNode" &&
        node.endModifiers?.some((modifier) => modifier.modifier === "ForUpdate")
      ) {
        paused = true;
        lockQueries.add(queryId);
      }
      return node;
    },
    async transformResult({ result, queryId }) {
      if (lockQueries.has(queryId)) {
        locked.resolve();
        await release.promise;
      }
      return result;
    },
  });
  const second = db.withPlugin(
    observeQueries((node) => {
      if (node.kind === "InsertQueryNode") secondStarted.resolve();
    }),
  );
  const firstPatch = updateProfile(first, user.id, {
    skillIds: ["python", "rust"],
    goalIds: ["learning"],
  });
  const secondPatch = (async () => {
    await locked.promise;
    return updateProfile(second, user.id, {
      skillIds: ["go"],
      goalIds: ["side-project"],
      bio: "Second writer",
    });
  })();
  try {
    await secondStarted.promise;
  } finally {
    release.resolve();
  }
  await Promise.all([firstPatch, secondPatch]);
  expect(await getProfile(db, user.id)).toMatchObject({
    skillIds: ["go"],
    goalIds: ["side-project"],
    bio: "Second writer",
    displayName: "Engineer",
  });
});

test("Kysely batch hydration is bounded, ordered and never loads private user fields", async () => {
  const users = await Promise.all(
    Array.from({ length: 24 }, () => createUser()),
  );
  const first = users[0];
  if (!first) throw new Error("Expected profile fixture");
  await updateProfile(db, first.id, complete);
  const queries: RootOperationNode[] = [];
  const observed = db.withPlugin(observeQueries((node) => queries.push(node)));
  expect(await getProfileRows(observed, [])).toEqual([]);
  expect(queries).toHaveLength(0);
  const ids = users.map(({ id }) => id).reverse();
  const rows = await getProfileRows(observed, [...ids, "missing", first.id]);
  expect(rows.map(({ userId }) => userId)).toEqual(ids);
  expect(queries).toHaveLength(4);
  expect(queries.every((node) => node.kind === "SelectQueryNode")).toBe(true);
  const serializedQueries = JSON.stringify(queries);
  for (const privateField of ["email", "name", "image", "accounts", "sessions"])
    expect(serializedQueries).not.toContain(`"name":"${privateField}"`);
  expect(rows.find(({ userId }) => userId === first.id)?.skills).toEqual([
    { skillId: "sql" },
    { skillId: "typescript" },
  ]);
  for (const row of rows) {
    expect(TypeCompiler.Compile(profileSchema).Check(publicProfile(row))).toBe(
      true,
    );
    expect(row).not.toHaveProperty("email");
  }
  expect(
    await db
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "in", ids)
      .execute(),
  ).toHaveLength(1);
});

test("Kysely dictionary reads expose only sorted agreed IDs and labels", async () => {
  const dictionaries = await getDictionaries(db);
  expect(TypeCompiler.Compile(dictionariesSchema).Check(dictionaries)).toBe(
    true,
  );
  expect(dictionaries.goals.map(({ id }) => id)).toContain("pair-programming");
  for (const values of Object.values(dictionaries)) {
    expect(values.map(({ id }) => id)).toEqual(
      values.map(({ id }) => id).sort(),
    );
    for (const value of values)
      expect(Object.keys(value).sort()).toEqual(["id", "label"]);
  }
});

test("ordinary profile reads keep scalar fields and collections in one committed snapshot", async () => {
  const user = await createUser();
  const before = await updateProfile(db, user.id, complete);
  let changed = false;
  const scalarQueries = new Set<object>();
  const observed = db.withPlugin({
    transformQuery({ node, queryId }) {
      if (
        node.kind === "SelectQueryNode" &&
        node.from?.froms.some(
          (from) =>
            TableNode.is(from) && from.table.identifier.name === "profiles",
        )
      )
        scalarQueries.add(queryId);
      return node;
    },
    async transformResult({ result, queryId }) {
      if (scalarQueries.delete(queryId) && !changed) {
        changed = true;
        await updateProfile(db, user.id, {
          displayName: "After",
          specializationId: "frontend",
          skillIds: ["react"],
          goalIds: ["learning"],
        });
      }
      return result;
    },
  });
  expect(await getProfile(observed, user.id)).toEqual(before);
  expect(changed).toBe(true);
  expect(await getProfile(db, user.id)).toMatchObject({
    displayName: "After",
    specializationId: "frontend",
    skillIds: ["react"],
    goalIds: ["learning"],
  });
});
