import { expect, test } from "bun:test";
import { encodeCursor } from "@api/lib/pagination";
import {
  listConversations,
  sendMessage,
} from "@api/modules/conversations/service";
import {
  encodeConversationCursor,
  getConversationSummary,
} from "@api/modules/conversations/summaries";
import { removeMember } from "@api/modules/projects/membership";
import { createProject } from "@api/modules/projects/service";
import { db, register, request } from "./helpers";
import { observeQueries } from "./query-observer";

async function direct(a: string, b: string, createdAt: Date) {
  return db.transaction().execute(async (tx) => {
    const [lowId, highId] = [a, b].sort() as [string, string];
    const match = await tx
      .insertInto("matches")
      .values({ low_id: lowId, high_id: highId })
      .returning("id")
      .executeTakeFirstOrThrow();
    const conversation = await tx
      .insertInto("conversations")
      .values({ match_id: match.id, created_at: createdAt })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("conversation_members")
      .values(
        [a, b].map((user_id) => ({
          conversation_id: conversation.id,
          user_id,
        })),
      )
      .execute();
    return { ...conversation, matchId: match.id };
  });
}

const createdAt = new Date("2020-01-01T00:00:00.000Z");

test("direct summaries expose only public peer context, handle absent profiles and hydrate in one query", async () => {
  const [user, peer, other] = await Promise.all([
    register(),
    register(),
    register(),
  ]);
  const conversation = await direct(user.id, peer.id, createdAt);
  expect(await listConversations(db, other.id, {})).toEqual({
    items: [],
    nextCursor: null,
  });
  let selects = 0;
  const observed = observeQueries(db, {
    before(query) {
      if (query.sql.startsWith("select")) selects++;
    },
  });
  const empty = await listConversations(observed, user.id, {});
  expect(selects).toBe(1);
  expect(empty.items).toEqual([
    {
      id: conversation.id,
      matchId: conversation.matchId,
      projectId: null,
      createdAt: createdAt.toISOString(),
      kind: "direct",
      peer: { userId: peer.id, displayName: "" },
      project: null,
      latestMessage: null,
      lastActivityAt: createdAt.toISOString(),
    },
  ]);
  expect(
    await getConversationSummary(db, peer.id, conversation.id),
  ).toMatchObject({
    peer: { userId: user.id, displayName: "" },
  });
  await db
    .insertInto("profiles")
    .values({ user_id: peer.id, display_name: "Public peer" })
    .execute();
  const sent = await sendMessage(db, peer.id, conversation.id, {
    text: "  Message 🌌  ",
    requestId: "summary",
  });
  selects = 0;
  const summary = await getConversationSummary(
    observed,
    user.id,
    conversation.id,
  );
  expect(selects).toBe(1);
  expect(summary).toMatchObject({
    peer: { userId: peer.id, displayName: "Public peer" },
    latestMessage: {
      id: sent.message.id,
      senderId: peer.id,
      text: "  Message 🌌  ",
      createdAt: sent.message.createdAt,
    },
    lastActivityAt: sent.message.createdAt,
  });
  expect(Object.keys(summary).sort()).toEqual([
    "createdAt",
    "id",
    "kind",
    "lastActivityAt",
    "latestMessage",
    "matchId",
    "peer",
    "project",
    "projectId",
  ]);
  expect(Object.keys(summary.peer ?? {}).sort()).toEqual([
    "displayName",
    "userId",
  ]);
  expect(Object.keys(summary.latestMessage ?? {}).sort()).toEqual([
    "createdAt",
    "id",
    "senderId",
    "text",
  ]);
  expect(JSON.stringify(summary)).not.toContain(peer.email);
  expect(JSON.stringify(summary)).not.toContain("requestId");
  expect(await listConversations(db, user.id, {})).toEqual({
    items: [summary],
    nextCursor: null,
  });
});

test("authorized summary deep links work outside the first page and deny strangers or missing IDs", async () => {
  const [user, peer, secondPeer, outsider] = await Promise.all([
    register(),
    register(),
    register(),
    register(),
  ]);
  const old = await direct(user.id, peer.id, createdAt);
  await direct(user.id, secondPeer.id, new Date("2021-01-01T00:00:00.000Z"));
  expect(
    (await listConversations(db, user.id, { limit: 1 })).items[0]?.id,
  ).not.toBe(old.id);
  const path = `/api/v1/conversations/${old.id}`;
  expect((await request(path)).status).toBe(401);
  const response = await request(path, { cookie: user.cookie });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    await getConversationSummary(db, user.id, old.id),
  );
  for (const id of [old.id, "missing"])
    expect(
      (
        await request(`/api/v1/conversations/${id}`, {
          cookie: outsider.cookie,
        })
      ).status,
    ).toBe(404);
});

test("project summaries include project display context and disappear after current membership revocation", async () => {
  const [owner, member, outsider] = await Promise.all([
    register(),
    register(),
    register(),
  ]);
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto("profiles")
      .values({
        user_id: owner.id,
        display_name: "Owner",
        specialization_id: "backend",
      })
      .execute();
    await tx
      .insertInto("profile_skills")
      .values({ user_id: owner.id, skill_id: "typescript" })
      .execute();
    await tx
      .insertInto("profile_goals")
      .values({ user_id: owner.id, goal_id: "startup" })
      .execute();
  });
  const project = await createProject(db, owner.id, {
    title: "Public team title",
    description: "Team",
    goalId: "startup",
    requiredRoles: [],
    requiredSkillIds: [],
  });
  const conversation = await db
    .selectFrom("conversations")
    .select("id")
    .where("project_id", "=", project.id)
    .executeTakeFirstOrThrow();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto("project_members")
      .values({ project_id: project.id, user_id: member.id })
      .execute();
    await tx
      .insertInto("conversation_members")
      .values({ conversation_id: conversation.id, user_id: member.id })
      .execute();
  });
  const summary = await getConversationSummary(db, member.id, conversation.id);
  expect(summary).toMatchObject({
    kind: "project",
    matchId: null,
    projectId: project.id,
    peer: null,
    project: { id: project.id, title: "Public team title" },
    latestMessage: null,
  });
  expect(summary.lastActivityAt).toBe(summary.createdAt);
  await sendMessage(db, owner.id, conversation.id, {
    text: "Team preview",
    requestId: "team",
  });
  expect(
    (await getConversationSummary(db, member.id, conversation.id)).latestMessage
      ?.text,
  ).toBe("Team preview");
  expect(
    await getConversationSummary(db, outsider.id, conversation.id).catch(
      (error: unknown) => error,
    ),
  ).toMatchObject({ status: 404 });
  await removeMember(db, owner.id, project.id, member.id);
  expect((await listConversations(db, member.id, {})).items).toEqual([]);
  expect(
    await getConversationSummary(db, member.id, conversation.id).catch(
      (error: unknown) => error,
    ),
  ).toMatchObject({ status: 404 });
  // Even a stale conversation membership must not restore revoked roster access.
  await db
    .insertInto("conversation_members")
    .values({ conversation_id: conversation.id, user_id: member.id })
    .execute();
  expect((await listConversations(db, member.id, {})).items).toEqual([]);
  expect(
    await getConversationSummary(db, member.id, conversation.id).catch(
      (error: unknown) => error,
    ),
  ).toMatchObject({ status: 404 });
  expect(
    (await getConversationSummary(db, owner.id, conversation.id)).latestMessage
      ?.text,
  ).toBe("Team preview");
});

test("activity ties traverse multiple pages and a new message moves an old thread on restart", async () => {
  const user = await register();
  const peers = await Promise.all(Array.from({ length: 5 }, () => register()));
  const conversations = await Promise.all(
    peers.map((peer) => direct(user.id, peer.id, createdAt)),
  );
  const expected = conversations
    .map((row) => row.id)
    .sort()
    .reverse();
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await listConversations(db, user.id, {
      limit: 2,
      ...(cursor ? { cursor } : {}),
    });
    ids.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  expect(ids).toEqual(expected);
  const oldestId = expected.at(-1);
  if (!oldestId) throw new Error("Missing conversation");
  const messageTime = new Date("2022-01-01T00:00:00.000Z");
  await db
    .insertInto("messages")
    .values([
      {
        id: `summary-a-${crypto.randomUUID()}`,
        conversation_id: oldestId,
        sender_id: user.id,
        request_id: "a",
        text: "first tie",
        created_at: messageTime,
      },
      {
        id: `summary-z-${crypto.randomUUID()}`,
        conversation_id: oldestId,
        sender_id: user.id,
        request_id: "z",
        text: "latest tie",
        created_at: messageTime,
      },
    ])
    .execute();
  const refreshed = await listConversations(db, user.id, { limit: 2 });
  expect(refreshed.items[0]).toMatchObject({
    id: oldestId,
    latestMessage: { text: "latest tie" },
    lastActivityAt: messageTime.toISOString(),
  });
  const sent = await sendMessage(db, user.id, oldestId, {
    text: "Newest committed",
    requestId: "newest",
  });
  const latest = await listConversations(db, user.id, { limit: 2 });
  expect(latest.items[0]).toMatchObject({
    id: oldestId,
    latestMessage: { id: sent.message.id },
    lastActivityAt: sent.message.createdAt,
  });
});

test("conversation HTTP rejects creation, wrong-version, malformed and unsafe activity cursors", async () => {
  const user = await register();
  for (const cursor of [
    encodeCursor({ id: "old", createdAt }),
    Buffer.from(
      JSON.stringify([
        "conversation-activity-v0",
        createdAt.toISOString(),
        "id",
      ]),
    ).toString("base64url"),
    encodeConversationCursor({ id: "nul\u0000", lastActivityAt: createdAt }),
    encodeConversationCursor({
      id: "date",
      lastActivityAt: new Date("-005000-01-01T00:00:00.000Z"),
    }),
    "invalid",
  ]) {
    const response = await request(`/api/v1/conversations?cursor=${cursor}`, {
      cookie: user.cookie,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_CURSOR" },
    });
  }
});
