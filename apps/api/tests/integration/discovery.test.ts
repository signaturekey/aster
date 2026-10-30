import { expect, test } from "bun:test";
import { encodeCursor } from "@api/lib/pagination";
import { discover } from "@api/modules/discovery/service";
import { type KyselyPlugin } from "kysely";
import { db, register, request } from "./helpers";

async function participant(discoverable = true) {
  const user = await register();
  await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: user.cookie,
    body: {
      displayName: "Dev",
      specializationId: "backend",
      skillIds: ["typescript", "sql"],
      goalIds: ["startup"],
      discoverable,
    },
  });
  return user;
}
const decide = (
  user: Awaited<ReturnType<typeof register>>,
  id: string,
  value = "interested",
) =>
  request(`/api/v1/discovery/decisions/${id}`, {
    method: "PUT",
    cookie: user.cookie,
    body: { value },
  });

test("concurrent reciprocal decisions create one match and direct conversation", async () => {
  const [a, b, outsider] = await Promise.all([
    participant(),
    participant(),
    participant(),
  ]);
  const responses = await Promise.all([
    decide(a, b.id),
    decide(b, a.id),
    decide(a, b.id),
    decide(b, a.id),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
  const pairs = await db
    .selectFrom("matches as m")
    .leftJoin("conversations as c", "c.match_id", "m.id")
    .select(["m.id", "c.id as conversationId"])
    .where((eb) =>
      eb.or([
        eb.and([eb("m.low_id", "=", a.id), eb("m.high_id", "=", b.id)]),
        eb.and([eb("m.low_id", "=", b.id), eb("m.high_id", "=", a.id)]),
      ]),
    )
    .execute();
  expect(pairs).toHaveLength(1);
  const pair = pairs[0];
  if (!pair?.conversationId) throw new Error("Missing match conversation");
  const members = await db
    .selectFrom("conversation_members")
    .select("user_id")
    .where("conversation_id", "=", pair.conversationId)
    .execute();
  expect(members.map((row) => row.user_id).sort()).toEqual([a.id, b.id].sort());
  const match = await (await decide(a, b.id)).json();
  expect(match.match.id).toBe(pairs[0]?.id);
  expect((await decide(a, b.id, "skipped")).status).toBe(409);
  expect(
    (
      await request(`/api/v1/matches/${match.match.id}`, {
        cookie: outsider.cookie,
      })
    ).status,
  ).toBe(404);
  await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: a.cookie,
    body: { discoverable: false, skillIds: [] },
  });
  expect((await decide(a, b.id)).status).toBe(200);
  expect(
    (await request(`/api/v1/matches/${match.match.id}`, { cookie: a.cookie }))
      .status,
  ).toBe(200);
});

test("decisions revise before matching, stay private and reject hidden targets", async () => {
  const [a, b] = await Promise.all([participant(), participant()]);
  expect((await decide(a, b.id, "skipped")).status).toBe(200);
  expect((await (await decide(a, b.id)).json()).match).toBeNull();
  expect(
    await db
      .selectFrom("conversation_members")
      .select("conversation_id")
      .where("user_id", "=", a.id)
      .execute(),
  ).toEqual([]);
  await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: b.cookie,
    body: { discoverable: false },
  });
  expect((await decide(a, b.id, "skipped")).status).toBe(404);
  expect(
    (await request("/api/v1/discovery/incoming", { cookie: b.cookie })).status,
  ).toBe(404);
  const incomplete = await register();
  expect((await decide(incomplete, a.id)).status).toBe(409);
});

test("discovery excludes trim-only Unicode names and includes non-trim whitespace", async () => {
  const viewer = await participant();
  const target = await participant();
  const specializationId = `unicode-${crypto.randomUUID()}`;
  await db
    .insertInto("specializations")
    .values({ id: specializationId, label: "Unicode completeness test" })
    .execute();
  await db
    .updateTable("profiles")
    .set({ specialization_id: specializationId })
    .where("user_id", "=", target.id)
    .execute();
  // FEFF is trimmed by JavaScript but not PostgreSQL's POSIX space class.
  // U+0085 has the inverse behavior: JavaScript does not trim it.
  for (const displayName of [
    "﻿",
    "\u0009\u000a\u000b\u000c\u000d                  　﻿",
    "\u0085",
    "﻿Dev﻿",
  ]) {
    const patched = await request("/api/v1/me/profile", {
      method: "PATCH",
      cookie: target.cookie,
      body: { displayName },
    });
    expect(patched.status).toBe(200);
    const complete = displayName.trim().length > 0;
    expect((await patched.json()).complete).toBe(complete);
    const response = await request(
      `/api/v1/discovery?specializationId=${specializationId}`,
      { cookie: viewer.cookie },
    );
    expect(response.status).toBe(200);
    const page = await response.json();
    expect(page.items.map((item: { userId: string }) => item.userId)).toEqual(
      complete ? [target.id] : [],
    );
    if (complete) expect(page.items[0].complete).toBe(true);
  }
});

test("discovery hydration retains the eligibility snapshot across a committed profile mutation", async () => {
  const viewer = await participant();
  const target = await participant();
  const specializationId = `snapshot-${crypto.randomUUID()}`;
  await db
    .insertInto("specializations")
    .values({ id: specializationId, label: "Discovery snapshot test" })
    .execute();
  await db
    .updateTable("profiles")
    .set({ specialization_id: specializationId })
    .where("user_id", "=", target.id)
    .execute();
  let hydrationCalls = 0;
  const selected = new WeakSet<object>();
  const instrumented = db.withPlugin({
    transformQuery({ node, queryId }) {
      if (
        node.kind === "RawNode" &&
        node.sqlFragments.join("").includes('SELECT p.user_id AS "userId"')
      )
        selected.add(queryId);
      return node;
    },
    async transformResult({ queryId, result }) {
      if (selected.has(queryId)) {
        hydrationCalls++;
        expect(result.rows).toHaveLength(1);
        // Commit on a separate connection after selection and before hydration,
        // deterministically reproducing the READ COMMITTED race.
        const response = await request("/api/v1/me/profile", {
          method: "PATCH",
          cookie: target.cookie,
          body: {
            discoverable: false,
            skillIds: [],
            specializationId: "backend",
          },
        });
        expect(response.status).toBe(200);
        expect((await response.json()).discoverable).toBe(false);
      }
      return result;
    },
  } satisfies KyselyPlugin);
  const page = await discover(instrumented, viewer.id, {
    specializationId,
    skillIds: ["typescript", "sql"],
    goalIds: ["startup"],
  });
  expect(hydrationCalls).toBe(1);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    userId: target.id,
    discoverable: true,
    complete: true,
    specializationId,
    skillIds: ["sql", "typescript"],
  });
  // A later request must see the committed opt-out, not the previous snapshot.
  expect((await discover(db, viewer.id, { specializationId })).items).toEqual(
    [],
  );
});

test("discovery conjunction, exclusions, timestamp ties and cursor validation", async () => {
  const viewer = await participant();
  const [a, b, hidden, incomplete, decided] = await Promise.all([
    participant(),
    participant(),
    participant(false),
    register(),
    participant(),
  ]);
  await decide(viewer, decided.id, "skipped");
  const specializationId = `test-${crypto.randomUUID()}`;
  await db
    .insertInto("specializations")
    .values({ id: specializationId, label: "Isolated discovery test" })
    .execute();
  await db
    .updateTable("profiles")
    .set({ specialization_id: specializationId })
    .where("user_id", "in", [a.id, b.id, hidden.id, decided.id])
    .execute();
  const time = new Date("2099-01-01T00:00:00.000Z");
  await db
    .updateTable("profiles")
    .set({ created_at: time })
    .where("user_id", "in", [a.id, b.id])
    .execute();
  const filter = `specializationId=${specializationId}&skillIds=typescript&skillIds=sql&goalIds=startup`;
  const expected = await db
    .selectFrom("profiles")
    .select("user_id as userId")
    .where("user_id", "in", [a.id, b.id])
    .orderBy("user_id", "desc")
    .execute();
  const firstResponse = await request(`/api/v1/discovery?limit=1&${filter}`, {
    cookie: viewer.cookie,
  });
  expect(firstResponse.status).toBe(200);
  const first = await firstResponse.json();
  expect(first.items[0].userId).toBe(expected[0]?.userId);
  const second = await (
    await request(
      `/api/v1/discovery?limit=1&${filter}&cursor=${first.nextCursor}`,
      { cookie: viewer.cookie },
    )
  ).json();
  expect(second.items[0].userId).toBe(expected[1]?.userId);
  expect(first.items[0]).not.toHaveProperty("email");
  const all = await (
    await request(`/api/v1/discovery?limit=50&${filter}`, {
      cookie: viewer.cookie,
    })
  ).json();
  for (const id of [viewer.id, hidden.id, incomplete.id, decided.id])
    expect(all.items.map((p: { userId: string }) => p.userId)).not.toContain(
      id,
    );
  for (const query of [
    "limit=51",
    "limit=0",
    "cursor=not-a-cursor",
    "specializationId=missing",
  ])
    expect(
      (await request(`/api/v1/discovery?${query}`, { cookie: viewer.cookie }))
        .status,
    ).toBe(422);
  const end = encodeCursor({ id: "end", createdAt: new Date(0) });
  for (let i = 0; i < 2; i++)
    expect(
      (
        await (
          await request(`/api/v1/discovery?cursor=${end}`, {
            cookie: viewer.cookie,
          })
        ).json()
      ).items,
    ).toEqual([]);
});

test("same-value pre-match retries survive target opt-out without creating a match", async () => {
  for (const value of ["interested", "skipped"]) {
    const [a, b] = await Promise.all([participant(), participant()]);
    const first = await decide(a, b.id, value);
    expect(first.status).toBe(200);
    const original = await first.json();
    const decision = await db
      .selectFrom("discovery_decisions")
      .selectAll()
      .where("actor_id", "=", a.id)
      .where("target_id", "=", b.id)
      .executeTakeFirstOrThrow();
    await request("/api/v1/me/profile", {
      method: "PATCH",
      cookie: b.cookie,
      body: { discoverable: false },
    });
    const retried = await decide(a, b.id, value);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual(original);
    expect(
      (
        await db
          .selectFrom("discovery_decisions")
          .selectAll()
          .where("actor_id", "=", a.id)
          .where("target_id", "=", b.id)
          .executeTakeFirstOrThrow()
      ).updated_at,
    ).toEqual(decision.updated_at);
    expect(
      (await decide(a, b.id, value === "interested" ? "skipped" : "interested"))
        .status,
    ).toBe(404);
    expect(
      await db
        .selectFrom("conversation_members")
        .select("conversation_id")
        .where("user_id", "=", a.id)
        .execute(),
    ).toEqual([]);
  }
});

test("malformed database cursor IDs return INVALID_CURSOR instead of SQL failure", async () => {
  const user = await participant();
  for (const id of ["\u0000", "\ud800"]) {
    const cursor = encodeCursor({
      id,
      createdAt: new Date("2026-10-30T00:00:00.000Z"),
    });
    for (const collection of [
      "discovery",
      "matches",
      "projects",
      "conversations",
      "me/applications",
    ]) {
      const response = await request(`/api/v1/${collection}?cursor=${cursor}`, {
        cookie: user.cookie,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_CURSOR", message: "Cursor is invalid" },
      });
    }
  }
});
