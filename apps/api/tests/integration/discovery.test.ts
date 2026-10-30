import { expect, test } from "bun:test";
import { encodeCursor } from "../../src/lib/pagination";
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
  const pairs = await db.match.findMany({
    where: {
      OR: [
        { lowId: a.id, highId: b.id },
        { lowId: b.id, highId: a.id },
      ],
    },
    include: { conversation: { include: { members: true } } },
  });
  expect(pairs).toHaveLength(1);
  expect(pairs[0]?.conversation?.members).toHaveLength(2);
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
    await db.conversation.count({
      where: { members: { some: { userId: a.id } } },
    }),
  ).toBe(0);
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
  await db.specialization.create({
    data: { id: specializationId, label: "Isolated discovery test" },
  });
  await db.profile.updateMany({
    where: { userId: { in: [a.id, b.id, hidden.id, decided.id] } },
    data: { specializationId },
  });
  const time = new Date("2099-01-01T00:00:00.000Z");
  await db.profile.updateMany({
    where: { userId: { in: [a.id, b.id] } },
    data: { createdAt: time },
  });
  const filter = `specializationId=${specializationId}&skillIds=typescript&skillIds=sql&goalIds=startup`;
  const expected = await db.profile.findMany({
    where: { userId: { in: [a.id, b.id] } },
    orderBy: { userId: "desc" },
    select: { userId: true },
  });
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
