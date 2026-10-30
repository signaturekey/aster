import { afterAll, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { isConversationEvent } from "../../src/events";
import { errorBody, ProductError } from "../../src/lib/errors";
import { conversationRoutes } from "../../src/modules/conversations/routes";
import { createConversationStreams } from "../../src/modules/conversations/streams";
import {
  auth,
  db,
  request as identityRequest,
  origin,
  register,
} from "./helpers";

const app = new Elysia({ normalize: false })
  .onError(({ error, code, status }) => {
    if (error instanceof ProductError)
      return status(error.status, errorBody(error.code, error.message));
    if (code === "VALIDATION" || code === "PARSE")
      return status(422, errorBody("VALIDATION_ERROR", "Request is invalid"));
    return status(500, errorBody("INTERNAL_ERROR", "Unexpected error"));
  })
  .group("/api/v1", (app) => app.use(conversationRoutes(db, auth, [origin])));

afterAll(() => db.$disconnect());

async function request(
  path: string,
  cookie?: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  return app.handle(
    new Request(`${origin}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    }),
  );
}

async function direct(a: string, b: string, createdAt?: Date) {
  const [lowId, highId] = [a, b].sort() as [string, string];
  return db.$transaction(async (tx) => {
    const match = await tx.match.create({ data: { lowId, highId } });
    return tx.conversation.create({
      data: {
        matchId: match.id,
        ...(createdAt ? { createdAt } : {}),
        members: { create: [{ userId: a }, { userId: b }] },
      },
    });
  });
}

async function project(ownerId: string, memberId: string) {
  return db.project.create({
    data: {
      ownerId,
      title: "Conversation test",
      description: "Private discussion",
      goalId: "startup",
      requiredRoles: [],
      members: { create: [{ userId: ownerId }, { userId: memberId }] },
      conversation: {
        create: {
          members: { create: [{ userId: ownerId }, { userId: memberId }] },
        },
      },
    },
    include: { conversation: true },
  });
}

function messages(id: string) {
  return `/conversations/${id}/messages`;
}
async function send(
  id: string,
  cookie: string,
  text = "Hello",
  requestId: string = crypto.randomUUID(),
) {
  return request(messages(id), cookie, { text, requestId });
}

async function stream(cookie: string) {
  const abort = new AbortController();
  const response = await request("/events", cookie, undefined, abort.signal);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  if (!response.body) throw new Error("Missing SSE response body");
  const reader = response.body.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    ": connected\n\n",
  );
  return { abort, reader };
}

async function nextEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const deadline = setTimeout(() => {
    void reader.cancel("event timeout");
  }, 2000);
  try {
    const result = await reader.read();
    expect(result.done).toBe(false);
    const frame = new TextDecoder().decode(result.value);
    const data = frame.split("\n").find((line) => line.startsWith("data: "));
    expect(data).toBeDefined();
    if (!data) throw new Error("Missing SSE data");
    const event: unknown = JSON.parse(data.slice(6));
    expect(isConversationEvent(event)).toBe(true);
    if (!isConversationEvent(event)) throw new Error("Invalid event");
    expect(frame).toContain(`id: ${event.messageId}\n`);
    return event;
  } finally {
    clearTimeout(deadline);
  }
}

test("conversation routes deny anonymous and nonmembers without private fields", async () => {
  const [a, b, other] = await Promise.all([register(), register(), register()]);
  const conversation = await direct(a.id, b.id);
  expect((await request("/conversations")).status).toBe(401);
  expect((await request("/events")).status).toBe(401);
  for (const id of [conversation.id, "missing"]) {
    expect((await request(messages(id), other.cookie)).status).toBe(404);
    expect((await send(id, other.cookie)).status).toBe(404);
  }
  const empty = await (await request("/conversations", other.cookie)).json();
  expect(empty.items).toEqual([]);
  const list = await (await request("/conversations", a.cookie)).json();
  expect(list.items.map((row: { id: string }) => row.id)).toContain(
    conversation.id,
  );
  expect(Object.keys(list.items[0]).sort()).toEqual([
    "createdAt",
    "id",
    "matchId",
    "projectId",
  ]);
  // Existing chats do not require discovery completeness or opt-in.
  expect((await send(conversation.id, a.cookie)).status).toBe(200);
});

test("message validation, exact content, concurrent request deduplication and conflicts", async () => {
  const [a, b] = await Promise.all([register(), register()]);
  const conversation = await direct(a.id, b.id);
  for (const body of [
    { text: " \n\t", requestId: "empty" },
    { text: "x".repeat(4001), requestId: "long" },
    { text: "ok", requestId: "" },
    { text: "ok", requestId: "x".repeat(129) },
    { text: "ok", requestId: "spoof", senderId: b.id },
  ])
    expect(
      (await request(messages(conversation.id), a.cookie, body)).status,
    ).toBe(422);
  const responses = await Promise.all([
    send(conversation.id, a.cookie, "  same  ", "retry"),
    send(conversation.id, a.cookie, "  same  ", "retry"),
  ]);
  for (const response of responses) expect(response.status).toBe(200);
  const [first, second] = await Promise.all(
    responses.map((response) => response.json()),
  );
  expect(first).toEqual(second);
  expect(first.text).toBe("  same  ");
  expect((await send(conversation.id, a.cookie, "same", "retry")).status).toBe(
    409,
  );
  expect(first.senderId).toBe(a.id);
  expect(first.createdAt).toBe(new Date(first.createdAt).toISOString());
  expect(
    (await send(conversation.id, a.cookie, "different", "retry")).status,
  ).toBe(409);
  expect(
    (await send(conversation.id, b.cookie, "other sender", "retry")).status,
  ).toBe(200);
  expect(
    (await send(conversation.id, a.cookie, "x".repeat(4000), "x".repeat(128)))
      .status,
  ).toBe(200);
  expect(
    await db.message.count({
      where: {
        conversationId: conversation.id,
        senderId: a.id,
        requestId: "retry",
      },
    }),
  ).toBe(1);
});

test("history and conversation cursors traverse descending timestamp ties without gaps", async () => {
  const user = await register();
  const peers = await Promise.all([register(), register(), register()]);
  const time = new Date("2026-01-01T00:00:00.000Z");
  const conversations = await Promise.all(
    peers.map((peer) => direct(user.id, peer.id, time)),
  );
  const expected = conversations
    .map((row) => row.id)
    .sort()
    .reverse();
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response = await request(
      `/conversations?limit=1${cursor ? `&cursor=${cursor}` : ""}`,
      user.cookie,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    ids.push(...body.items.map((row: { id: string }) => row.id));
    cursor = body.nextCursor;
  } while (cursor);
  expect(ids).toEqual(expected);
  const conversation = conversations[0];
  if (!conversation) throw new Error("Missing conversation fixture");
  const rows = await Promise.all(
    Array.from({ length: 23 }, (_, index) =>
      db.message.create({
        data: {
          conversationId: conversation.id,
          senderId: user.id,
          text: `${index}`,
          requestId: `${index}`,
          createdAt: time,
        },
      }),
    ),
  );
  const first = await (
    await request(messages(conversation.id), user.cookie)
  ).json();
  expect(first.items).toHaveLength(20);
  const rest = await (
    await request(
      `${messages(conversation.id)}?cursor=${first.nextCursor}`,
      user.cookie,
    )
  ).json();
  expect(
    [...first.items, ...rest.items].map((row: { id: string }) => row.id),
  ).toEqual(
    rows
      .map((row) => row.id)
      .sort()
      .reverse(),
  );
  expect(rest.nextCursor).toBeNull();
  for (const query of [
    "limit=0",
    "limit=51",
    "limit=1.5",
    "cursor=bad",
    "cursor=",
  ])
    expect(
      (await request(`${messages(conversation.id)}?${query}`, user.cookie))
        .status,
    ).toBe(422);
});

test("SSE delivers only committed messages; retries have no duplicate event and reconnect recovers history", async () => {
  const [a, b] = await Promise.all([register(), register()]);
  const conversation = await direct(a.id, b.id);
  const connection = await stream(b.cookie);
  try {
    const response = await send(conversation.id, a.cookie, "live", "live");
    const message = await response.json();
    const event = await nextEvent(connection.reader);
    expect(event.messageId).toBe(message.id);
    expect(
      await db.message.findUnique({ where: { id: event.messageId } }),
    ).not.toBeNull();
    await send(conversation.id, a.cookie, "live", "live");
    const next = await (
      await send(conversation.id, a.cookie, "next", "next")
    ).json();
    expect((await nextEvent(connection.reader)).messageId).toBe(next.id);
  } finally {
    connection.abort.abort();
  }
  expect((await connection.reader.read()).done).toBe(true);
  const offline = await (
    await send(conversation.id, a.cookie, "offline")
  ).json();
  const reconnected = await stream(b.cookie);
  try {
    const history = await (
      await request(messages(conversation.id), b.cookie)
    ).json();
    const byId = new Map(
      history.items.map((row: { id: string }) => [row.id, row]),
    );
    expect(byId.has(offline.id)).toBe(true);
    const current = await (
      await send(conversation.id, a.cookie, "reconnected")
    ).json();
    const event = await nextEvent(reconnected.reader);
    // Same ID from history + SSE is one message, not two arrival-order copies.
    const recovered = await (
      await request(messages(conversation.id), b.cookie)
    ).json();
    for (const row of recovered.items) byId.set(row.id, row);
    expect(byId.has(event.messageId)).toBe(true);
    expect(event.messageId).toBe(current.id);
    expect(byId.size).toBe(recovered.items.length);
  } finally {
    reconnected.abort.abort();
  }
});

test("project revoke serializes racing reads/writes, filters live delivery, and rejoin restores full history", async () => {
  const [owner, member] = await Promise.all([register(), register()]);
  const p = await project(owner.id, member.id);
  if (!p.conversation) throw new Error("Missing project conversation");
  const id = p.conversation.id;
  const d = await direct(owner.id, member.id);
  const earlier = await (
    await send(id, owner.cookie, "before membership changes")
  ).json();
  const connection = await stream(member.cookie);
  let unlock!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const revoke = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${p.id} FOR UPDATE`;
    locked();
    await gate;
    await tx.conversationMember.delete({
      where: {
        conversationId_userId: { conversationId: id, userId: member.id },
      },
    });
    await tx.projectMember.delete({
      where: { projectId_userId: { projectId: p.id, userId: member.id } },
    });
  });
  try {
    await acquired;
    const racingWrite = send(id, member.cookie, "must not commit");
    const racingRead = request(messages(id), member.cookie);
    unlock();
    await revoke;
    expect((await racingWrite).status).toBe(404);
    expect((await racingRead).status).toBe(404);
    await send(id, owner.cookie, "after revocation");
    const permitted = await (
      await send(d.id, owner.cookie, "still direct members")
    ).json();
    expect((await nextEvent(connection.reader)).messageId).toBe(permitted.id);
    const list = await (await request("/conversations", member.cookie)).json();
    expect(list.items.map((row: { id: string }) => row.id)).not.toContain(id);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${p.id} FOR UPDATE`;
      await tx.projectMember.create({
        data: { projectId: p.id, userId: member.id },
      });
      await tx.conversationMember.create({
        data: { conversationId: id, userId: member.id },
      });
    });
    const restored = await (await request(messages(id), member.cookie)).json();
    expect(restored.items.map((row: { id: string }) => row.id)).toContain(
      earlier.id,
    );
    expect(restored.items).toHaveLength(2);
  } finally {
    unlock();
    connection.abort.abort();
  }
});

test("an in-flight event delivery rechecks membership after waiting for a racing revocation", async () => {
  const [owner, member] = await Promise.all([register(), register()]);
  const p = await project(owner.id, member.id);
  if (!p.conversation) throw new Error("Missing project conversation");
  const conversationId = p.conversation.id;
  const directChat = await direct(owner.id, member.id);
  const committed = await (await send(conversationId, owner.cookie)).json();
  const session = await db.session.findFirstOrThrow({
    where: { userId: member.id },
  });
  const streams = createConversationStreams(db);
  const abort = new AbortController();
  const response = streams.connect(member.id, session.id, abort.signal);
  if (!response.body) throw new Error("Missing SSE body");
  const reader = response.body.getReader();
  await reader.read();
  let unlock!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const revoke = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${p.id} FOR UPDATE`;
    locked();
    await gate;
    await tx.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: member.id } },
    });
    await tx.projectMember.delete({
      where: { projectId_userId: { projectId: p.id, userId: member.id } },
    });
  });
  try {
    await acquired;
    const delivery = streams.publish({
      type: "message.created",
      conversationId,
      messageId: committed.id,
    });
    unlock();
    await revoke;
    await delivery;
    const permitted = await (await send(directChat.id, owner.cookie)).json();
    await streams.publish({
      type: "message.created",
      conversationId: directChat.id,
      messageId: permitted.id,
    });
    // If the revoked event leaked it would be first in this same FIFO reader.
    expect((await nextEvent(reader)).messageId).toBe(permitted.id);
  } finally {
    unlock();
    abort.abort();
    streams.close();
  }
});

test("live delivery closes expired and signed-out sessions; replacement and cancellation clean up", async () => {
  const [a, b] = await Promise.all([register(), register()]);
  const conversation = await direct(a.id, b.id);
  const first = await stream(b.cookie);
  const second = await stream(b.cookie);
  expect((await first.reader.read()).done).toBe(true);
  await db.session.updateMany({
    where: { userId: b.id },
    data: { expiresAt: new Date(0) },
  });
  await send(conversation.id, a.cookie);
  expect((await second.reader.read()).done).toBe(true);
  const c = await register();
  const other = await direct(a.id, c.id);
  const signedOut = await stream(c.cookie);
  await identityRequest("/api/auth/sign-out", {
    method: "POST",
    cookie: c.cookie,
    body: {},
  });
  await send(other.id, a.cookie);
  expect((await signedOut.reader.read()).done).toBe(true);
  const d = await register();
  const cancelled = await stream(d.cookie);
  await cancelled.reader.cancel();
  cancelled.abort.abort();
  await send(other.id, a.cookie);
});

test("slow SSE consumers are disconnected at the bounded queue instead of retaining unbounded events", async () => {
  const [a, b] = await Promise.all([register(), register()]);
  const conversation = await direct(a.id, b.id);
  const connection = await stream(b.cookie);
  try {
    for (let i = 0; i < 34; i++)
      expect((await send(conversation.id, a.cookie, `${i}`)).status).toBe(200);
    let count = 0;
    while (!(await connection.reader.read()).done) count++;
    expect(count).toBe(32);
    expect(
      (await (await request(messages(conversation.id), b.cookie)).json()).items,
    ).toHaveLength(20);
  } finally {
    connection.abort.abort();
  }
});

test("shutdown seals the stream registry against requests still authenticating", async () => {
  const user = await register();
  const session = await db.session.findFirstOrThrow({
    where: { userId: user.id },
  });
  const streams = createConversationStreams(db);
  const first = streams.connect(
    user.id,
    session.id,
    new AbortController().signal,
  );
  const reader = first.body?.getReader();
  if (!reader) throw new Error("Missing initial stream");
  await reader.read();
  // Represents an accepted request paused in async session lookup. Its connect
  // continuation must not reopen long-lived responses after shutdown begins.
  const release = Promise.withResolvers<void>();
  const pending = release.promise.then(() =>
    streams.connect(user.id, session.id, new AbortController().signal),
  );
  streams.close();
  expect((await reader.read()).done).toBe(true);
  release.resolve();
  expect((await pending).status).toBe(503);
  expect(
    streams.connect(user.id, session.id, new AbortController().signal).status,
  ).toBe(503);
});
