import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { seedSqlDictionaries } from "@api/db/kysely-seed";
import { migrateDatabase } from "@api/db/migrate";
import { ProductError } from "@api/lib/errors";
import { encodeCursor } from "@api/lib/pagination";
import {
  discover,
  getMatch,
  listMatches,
  setDecision,
} from "@api/modules/discovery/kysely-service";
import {
  decisionResultSchema,
  discoveryPageSchema,
  matchPageSchema,
  matchSchema,
} from "@api/modules/discovery/schemas";
import { updateProfile } from "@api/modules/profiles/kysely-service";
import type { ProfilePatch } from "@api/modules/profiles/schemas";
import { TypeCompiler } from "elysia/type-system";
import { sql, type KyselyPlugin, type RootOperationNode } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `discovery_${crypto.randomUUID().replaceAll("-", "")}`;
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

async function user(id: string = crypto.randomUUID()) {
  await db
    .insertInto("users")
    .values({
      id,
      name: "Private account name",
      email: `${crypto.randomUUID()}@example.test`,
      image: "https://example.test/private-image",
    })
    .execute();
  return id;
}
async function participant(input: ProfilePatch = {}, id?: string) {
  const userId = await user(id);
  await updateProfile(db, userId, {
    displayName: "Engineer",
    specializationId: "backend",
    experienceId: "middle",
    skillIds: ["typescript", "sql"],
    goalIds: ["startup"],
    discoverable: true,
    ...input,
  });
  return userId;
}
async function specialization() {
  const id = `test-${crypto.randomUUID()}`;
  await db
    .insertInto("specializations")
    .values({ id, label: "Discovery test" })
    .execute();
  return id;
}
async function productError(
  operation: Promise<unknown>,
  code: string,
  status: number,
) {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(ProductError);
    expect(error).toMatchObject({ code, status });
    return;
  }
  throw new Error(`Expected ${code}`);
}
function observe(onQuery: (node: RootOperationNode) => void): KyselyPlugin {
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
const savedDecision = (actorId: string, targetId: string) =>
  db
    .selectFrom("discovery_decisions")
    .selectAll()
    .where("actor_id", "=", actorId)
    .where("target_id", "=", targetId)
    .executeTakeFirstOrThrow();

test("Kysely concurrent reciprocal decisions create one canonical private match and conversation", async () => {
  // Mixed case catches locale-sensitive pair ordering; non-BMP IDs catch UTF-16 ordering.
  for (const pair of [
    ["Z", "a"],
    ["\u{10000}", ""],
  ]) {
    const prefix = crypto.randomUUID();
    const [left, right] = pair;
    if (!left || !right) throw new Error("Missing pair fixture");
    const a = await participant({}, `${prefix}${left}`);
    const b = await participant({}, `${prefix}${right}`);
    const outsider = await participant();
    const results = await Promise.all([
      setDecision(db, a, b, "interested"),
      setDecision(db, b, a, "interested"),
      setDecision(db, a, b, "interested"),
      setDecision(db, b, a, "interested"),
    ]);
    for (const result of results)
      expect(TypeCompiler.Compile(decisionResultSchema).Check(result)).toBe(
        true,
      );
    const matched = await setDecision(db, a, b, "interested");
    if (!matched.match) throw new Error("Missing mutual match");
    const expectedPair = [a, b].sort((x, y) =>
      Buffer.compare(Buffer.from(x), Buffer.from(y)),
    );
    expect(matched.match.participantIds).toEqual(expectedPair);
    expect(matched.match.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(matched.match.conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(TypeCompiler.Compile(matchSchema).Check(matched.match)).toBe(true);
    const matches = await db
      .selectFrom("matches")
      .selectAll()
      .where("low_id", "in", [a, b])
      .execute();
    expect(matches).toHaveLength(1);
    const conversations = await db
      .selectFrom("conversations")
      .selectAll()
      .where("match_id", "=", matched.match.id)
      .execute();
    expect(conversations).toHaveLength(1);
    const members = await db
      .selectFrom("conversation_members")
      .select("user_id")
      .where("conversation_id", "=", matched.match.conversationId)
      .execute();
    expect(members.map((row) => row.user_id).sort()).toEqual([a, b].sort());
    expect(await getMatch(db, a, matched.match.id)).toEqual(matched.match);
    expect(await getMatch(db, b, matched.match.id)).toEqual(matched.match);
    await productError(
      getMatch(db, outsider, matched.match.id),
      "MATCH_NOT_FOUND",
      404,
    );
    expect((await listMatches(db, outsider, {})).items).toEqual([]);
    await updateProfile(db, a, { discoverable: false, skillIds: [] });
    expect(await setDecision(db, a, b, "interested")).toEqual(matched);
    expect(await getMatch(db, a, matched.match.id)).toEqual(matched.match);
    await productError(
      setDecision(db, a, b, "skipped"),
      "ALREADY_MATCHED",
      409,
    );
  }
});

test("Kysely decisions revise privately and same-value eligible retries preserve timestamps", async () => {
  const a = await participant();
  const b = await participant();
  expect(await setDecision(db, a, b, "skipped")).toEqual({
    value: "skipped",
    match: null,
  });
  // A fixed old timestamp makes update/no-op assertions independent of clock granularity.
  const old = new Date("2001-01-01T00:00:00.000Z");
  await db
    .updateTable("discovery_decisions")
    .set({ updated_at: old })
    .where("actor_id", "=", a)
    .execute();
  await setDecision(db, a, b, "skipped");
  expect((await savedDecision(a, b)).updated_at).toEqual(old);
  const revised = await setDecision(db, a, b, "interested");
  expect(revised).toEqual({ value: "interested", match: null });
  const saved = await savedDecision(a, b);
  expect(saved.updated_at.getTime()).toBeGreaterThan(old.getTime());
  await setDecision(db, a, b, "interested");
  expect((await savedDecision(a, b)).updated_at).toEqual(saved.updated_at);
  expect((await listMatches(db, b, {})).items).toEqual([]);
  expect(
    await db
      .selectFrom("conversation_members")
      .select("user_id")
      .where("user_id", "in", [a, b])
      .execute(),
  ).toEqual([]);
  // Neither the deck nor matches expose incoming-interest or account fields.
  const specializationId = await specialization();
  await updateProfile(db, a, { specializationId });
  const page = await discover(db, b, { specializationId });
  expect(page.items.map((row) => row.userId)).toEqual([a]);
  expect(Object.keys(page.items[0] ?? {}).sort()).toEqual(
    Object.keys(discoveryPageSchema.properties.items.items.properties).sort(),
  );
  const serialized = JSON.stringify(page);
  for (const secret of [
    "email",
    "Private account name",
    "private-image",
    "actor_id",
    "interested",
  ])
    expect(serialized).not.toContain(secret);
  expect(TypeCompiler.Compile(discoveryPageSchema).Check(page)).toBe(true);
  await productError(setDecision(db, a, a, "interested"), "SELF_DECISION", 409);
});

test("Kysely saved decisions retry unchanged after actor or target opt-out/incompleteness", async () => {
  for (const value of ["interested", "skipped"] as const) {
    for (const changedSide of ["actor", "target"] as const) {
      const a = await participant();
      const b = await participant();
      const first = await setDecision(db, a, b, value);
      const saved = await savedDecision(a, b);
      await updateProfile(db, changedSide === "actor" ? a : b, {
        discoverable: false,
        skillIds: [],
      });
      expect(await setDecision(db, a, b, value)).toEqual(first);
      expect(await savedDecision(a, b)).toEqual(saved);
      await productError(
        setDecision(
          db,
          a,
          b,
          value === "interested" ? "skipped" : "interested",
        ),
        changedSide === "actor" ? "PROFILE_INCOMPLETE" : "PROFILE_UNAVAILABLE",
        changedSide === "actor" ? 409 : 404,
      );
      expect((await listMatches(db, a, {})).items).toEqual([]);
      expect(
        await db
          .selectFrom("conversation_members")
          .select("user_id")
          .where("user_id", "=", a)
          .execute(),
      ).toEqual([]);
    }
  }
});

test("Kysely rejects hidden, missing and incomplete targets and ineligible actors without writes", async () => {
  const a = await participant();
  const hidden = await participant({ discoverable: false });
  const incomplete = await participant({ goalIds: [] });
  const absent = await user();
  for (const target of [hidden, incomplete, absent, "missing-user"])
    await productError(
      setDecision(db, a, target, "interested"),
      "PROFILE_UNAVAILABLE",
      404,
    );
  await productError(
    setDecision(db, hidden, a, "interested"),
    "DISCOVERY_DISABLED",
    409,
  );
  await productError(
    setDecision(db, incomplete, a, "interested"),
    "PROFILE_INCOMPLETE",
    409,
  );
  await productError(discover(db, absent, {}), "PROFILE_INCOMPLETE", 409);
  await productError(discover(db, hidden, {}), "DISCOVERY_DISABLED", 409);
  expect(
    await db
      .selectFrom("discovery_decisions")
      .selectAll()
      .where("actor_id", "=", a)
      .execute(),
  ).toEqual([]);
  expect(
    await db
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", absent)
      .execute(),
  ).toEqual([]);
});

test("Kysely discovery applies all skills/any goals with category conjunctions, exclusions and tied cursors", async () => {
  const specializationId = await specialization();
  const viewer = await participant({ specializationId });
  const a = await participant({ specializationId, goalIds: ["startup"] });
  const b = await participant({ specializationId, goalIds: ["hackathon"] });
  const excluded = await Promise.all([
    participant({ specializationId, discoverable: false }),
    participant({ specializationId, skillIds: [] }),
    participant({ specializationId, goalIds: [] }),
    participant({ specializationId, displayName: "﻿" }),
    participant({ specializationId, skillIds: ["typescript"] }),
    participant({ specializationId, goalIds: ["learning"] }),
    participant({ specializationId, experienceId: "senior" }),
    participant({ specializationId: "frontend" }),
  ]);
  const decided = await participant({ specializationId });
  const matched = await participant({ specializationId });
  await setDecision(db, viewer, decided, "skipped");
  await setDecision(db, viewer, matched, "interested");
  await setDecision(db, matched, viewer, "interested");
  // Remove decisions to prove the match exclusion independently of prior decisions.
  await db
    .deleteFrom("discovery_decisions")
    .where("actor_id", "=", viewer)
    .where("target_id", "=", matched)
    .execute();
  const time = new Date("2099-01-01T00:00:00.000Z");
  await db
    .updateTable("profiles")
    .set({ created_at: time })
    .where("user_id", "in", [a, b])
    .execute();
  const filter = {
    specializationId,
    experienceId: "middle",
    skillIds: ["sql", "typescript"],
    goalIds: ["startup", "hackathon"],
  };
  const expected = await db
    .selectFrom("profiles")
    .select("user_id")
    .where("user_id", "in", [a, b])
    .orderBy("user_id", "desc")
    .execute();
  const first = await discover(db, viewer, { ...filter, limit: 1 });
  expect(first.items.map((row) => row.userId)).toEqual(
    expected.slice(0, 1).map((row) => row.user_id),
  );
  if (!first.nextCursor) throw new Error("Expected tied cursor");
  const second = await discover(db, viewer, {
    ...filter,
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(second.items.map((row) => row.userId)).toEqual(
    expected.slice(1, 2).map((row) => row.user_id),
  );
  expect(second.nextCursor).toBeNull();
  const all = await discover(db, viewer, filter);
  expect(all.items.map((row) => row.userId)).toEqual(
    expected.map((row) => row.user_id),
  );
  for (const id of [viewer, decided, matched, ...excluded])
    expect(all.items.map((row) => row.userId)).not.toContain(id);
  const end = encodeCursor({ id: "end", createdAt: new Date(0) });
  for (let i = 0; i < 2; i++)
    expect(await discover(db, viewer, { ...filter, cursor: end })).toEqual({
      items: [],
      nextCursor: null,
    });
  // Optional empty lists impose no restriction and never compile IN ().
  expect(
    (
      await discover(db, viewer, {
        specializationId,
        skillIds: [],
        goalIds: [],
      })
    ).items.length,
  ).toBeGreaterThan(2);
});

test("Kysely discovery completeness exactly matches ECMAScript trim", async () => {
  const viewer = await participant();
  const specializationId = await specialization();
  const target = await participant({ specializationId });
  for (const displayName of [
    "﻿",
    "\u0009\u000a\u000b\u000c\u000d                  　﻿",
    "\u0085",
    "﻿Dev﻿",
  ]) {
    await updateProfile(db, target, { displayName });
    const page = await discover(db, viewer, { specializationId });
    expect(page.items.map((row) => row.userId)).toEqual(
      displayName.trim() ? [target] : [],
    );
    for (const row of page.items) expect(row.complete).toBe(true);
  }
});

test("Kysely discovery snapshot survives committed mutation between bounded selection and hydration", async () => {
  const specializationId = await specialization();
  const viewer = await participant();
  const target = await participant({ specializationId });
  const candidates = new WeakSet<object>();
  let selections = 0;
  const observed = db.withPlugin({
    transformQuery({ node, queryId }) {
      if (
        node.kind === "RawNode" &&
        node.sqlFragments.join("").includes('SELECT p.user_id AS "userId"')
      )
        candidates.add(queryId);
      return node;
    },
    async transformResult({ queryId, result }) {
      if (candidates.has(queryId)) {
        selections++;
        expect(result.rows).toHaveLength(1);
        // Commits on another pool connection after selection but before hydration.
        await updateProfile(db, target, {
          discoverable: false,
          skillIds: [],
          goalIds: [],
          specializationId: "backend",
        });
      }
      return result;
    },
  } satisfies KyselyPlugin);
  const page = await discover(observed, viewer, {
    specializationId,
    skillIds: ["sql", "typescript"],
    goalIds: ["startup"],
  });
  expect(selections).toBe(1);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    userId: target,
    discoverable: true,
    complete: true,
    specializationId,
    skillIds: ["sql", "typescript"],
    goalIds: ["startup"],
  });
  expect((await discover(db, viewer, { specializationId })).items).toEqual([]);
});

test("Kysely discovery hydrates only limit+1 candidates with constant query count", async () => {
  const specializationId = await specialization();
  const viewer = await participant();
  await Promise.all(
    Array.from({ length: 12 }, () => participant({ specializationId })),
  );
  const read = async (limit: number) => {
    let queries = 0;
    let selected = 0;
    const candidates = new WeakSet<object>();
    const observed = db.withPlugin({
      transformQuery({ node, queryId }) {
        queries++;
        if (
          node.kind === "RawNode" &&
          node.sqlFragments.join("").includes('SELECT p.user_id AS "userId"')
        )
          candidates.add(queryId);
        return node;
      },
      async transformResult({ queryId, result }) {
        if (candidates.has(queryId)) selected = result.rows.length;
        return result;
      },
    } satisfies KyselyPlugin);
    const page = await discover(observed, viewer, { specializationId, limit });
    expect(page.items).toHaveLength(limit);
    expect(selected).toBe(limit + 1);
    return queries;
  };
  expect(await read(1)).toBe(await read(8));
  expect(await read(1)).toBeLessThanOrEqual(10);
});

test("Kysely profile locks serialize an opt-out before decision authorization", async () => {
  const a = await participant();
  const b = await participant();
  const reachedLock = Promise.withResolvers<void>();
  const observed = db.withPlugin(
    observe((node) => {
      if (
        node.kind === "SelectQueryNode" &&
        node.endModifiers?.some((modifier) => modifier.modifier === "ForUpdate")
      )
        reachedLock.resolve();
    }),
  );
  let decision: Promise<unknown> | undefined;
  await db.transaction().execute(async (tx) => {
    await tx
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", b)
      .forUpdate()
      .execute();
    await tx
      .updateTable("profiles")
      .set({ discoverable: false })
      .where("user_id", "=", b)
      .execute();
    decision = productError(
      setDecision(observed, a, b, "interested"),
      "PROFILE_UNAVAILABLE",
      404,
    );
    await reachedLock.promise;
  });
  if (!decision) throw new Error("Decision was not started");
  await decision;
  expect(
    await db
      .selectFrom("discovery_decisions")
      .selectAll()
      .where("actor_id", "=", a)
      .execute(),
  ).toEqual([]);
});

test("Kysely match transaction rolls back decision, match and conversation on membership failure", async () => {
  const a = await participant();
  const b = await participant();
  await setDecision(db, a, b, "interested");
  const failing = db.withPlugin(
    observe((node) => {
      if (
        node.kind === "InsertQueryNode" &&
        node.into?.table.identifier.name === "conversation_members"
      )
        throw new Error("Injected membership failure");
    }),
  );
  try {
    await setDecision(failing, b, a, "interested");
    throw new Error("Expected rollback");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("message", "Injected membership failure");
  }
  expect(
    await db
      .selectFrom("discovery_decisions")
      .select("value")
      .where("actor_id", "=", b)
      .execute(),
  ).toEqual([]);
  expect((await listMatches(db, a, {})).items).toEqual([]);
  expect(
    await db
      .selectFrom("conversations as c")
      .innerJoin("matches as m", "m.id", "c.match_id")
      .select("c.id")
      .where((eb) => eb.or([eb("m.low_id", "=", a), eb("m.high_id", "=", a)]))
      .execute(),
  ).toEqual([]);
  expect((await setDecision(db, b, a, "interested")).match).not.toBeNull();
});

test("Kysely match lists paginate tied timestamps, restrict participants and validate cursors/limits", async () => {
  const a = await participant();
  const b = await participant();
  const c = await participant();
  await setDecision(db, a, b, "interested");
  await setDecision(db, a, c, "interested");
  const one = await setDecision(db, b, a, "interested");
  const two = await setDecision(db, c, a, "interested");
  if (!one.match || !two.match) throw new Error("Missing matches");
  const ids = [one.match.id, two.match.id];
  const time = new Date("2099-01-01T00:00:00.000Z");
  await db
    .updateTable("matches")
    .set({ created_at: time })
    .where("id", "in", ids)
    .execute();
  const expected = await db
    .selectFrom("matches")
    .select("id")
    .where("id", "in", ids)
    .orderBy("id", "desc")
    .execute();
  let queries = 0;
  const observed = db.withPlugin(
    observe(() => {
      queries++;
    }),
  );
  const first = await listMatches(observed, a, { limit: 1 });
  expect(queries).toBe(1);
  expect(first.items.map((row) => row.id)).toEqual(
    expected.slice(0, 1).map((row) => row.id),
  );
  if (!first.nextCursor) throw new Error("Missing cursor");
  const second = await listMatches(db, a, {
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(second.items.map((row) => row.id)).toEqual(
    expected.slice(1, 2).map((row) => row.id),
  );
  expect(second.nextCursor).toBeNull();
  expect(TypeCompiler.Compile(matchPageSchema).Check(first)).toBe(true);
  expect((await listMatches(db, b, {})).items.map((row) => row.id)).toEqual([
    one.match.id,
  ]);
  await productError(getMatch(db, a, "missing-match"), "MATCH_NOT_FOUND", 404);
  for (const limit of [0, 51, 1.5]) {
    await productError(discover(db, a, { limit }), "INVALID_LIMIT", 422);
    await productError(listMatches(db, a, { limit }), "INVALID_LIMIT", 422);
  }
  for (const cursor of [
    "not-a-cursor",
    encodeCursor({ id: "\u0000", createdAt: time }),
    encodeCursor({ id: "\ud800", createdAt: time }),
  ]) {
    await productError(discover(db, a, { cursor }), "INVALID_CURSOR", 422);
    await productError(listMatches(db, a, { cursor }), "INVALID_CURSOR", 422);
  }
  for (const filter of [
    { specializationId: "missing" },
    { experienceId: "missing" },
    { skillIds: ["sql", "missing"] },
    { goalIds: ["startup", "missing"] },
  ])
    await productError(
      discover(db, a, filter),
      "INVALID_DICTIONARY_VALUE",
      422,
    );
});
