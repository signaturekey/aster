import { expect, test } from "bun:test";
import { isConversationEvent } from "@api/events";
import { errorBody, ProductError } from "@api/lib/errors";
import { conversationRoutes } from "@api/modules/conversations/routes";
import { createConversationStreams } from "@api/modules/conversations/streams";
import { Elysia } from "elysia";
import {
  auth,
  db,
  request as identityRequest,
  origin,
  register,
} from "./helpers";
import { isRecipientSelection, observeQueries } from "./query-observer";

const app = new Elysia({ normalize: false })
  .onError(({ error, code, status }) => {
    if (error instanceof ProductError)
      return status(error.status, errorBody(error.code, error.message));
    if (code === "VALIDATION" || code === "PARSE")
      return status(422, errorBody("VALIDATION_ERROR", "Request is invalid"));
    return status(500, errorBody("INTERNAL_ERROR", "Unexpected error"));
  })
  .group("/api/v1", (app) => app.use(conversationRoutes(db, auth, [origin])));

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
  return db.transaction().execute(async (tx) => {
    const match = await tx
      .insertInto("matches")
      .values({ low_id: lowId, high_id: highId })
      .returning("id")
      .executeTakeFirstOrThrow();
    const conversation = await tx
      .insertInto("conversations")
      .values({
        match_id: match.id,
        project_id: null,
        ...(createdAt ? { created_at: createdAt } : {}),
      })
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
    return conversation;
  });
}

async function project(ownerId: string, memberId: string) {
  return db.transaction().execute(async (tx) => {
    const project = await tx
      .insertInto("projects")
      .values({
        owner_id: ownerId,
        title: "Conversation test",
        description: "Private discussion",
        goal_id: "startup",
        required_roles: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("project_members")
      .values(
        [ownerId, memberId].map((user_id) => ({
          project_id: project.id,
          user_id,
        })),
      )
      .execute();
    const conversation = await tx
      .insertInto("conversations")
      .values({ project_id: project.id, match_id: null })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("conversation_members")
      .values(
        [ownerId, memberId].map((user_id) => ({
          conversation_id: conversation.id,
          user_id,
        })),
      )
      .execute();
    return { ...project, conversation };
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
    Number(
      (
        await db
          .selectFrom("messages")
          .select(db.fn.countAll<string>().as("count"))
          .where("conversation_id", "=", conversation.id)
          .where("sender_id", "=", a.id)
          .where("request_id", "=", "retry")
          .executeTakeFirstOrThrow()
      ).count,
    ),
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
      db
        .insertInto("messages")
        .values({
          conversation_id: conversation.id,
          sender_id: user.id,
          text: `${index}`,
          request_id: `${index}`,
          created_at: time,
        })
        .returning("id")
        .executeTakeFirstOrThrow(),
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
      await db
        .selectFrom("messages")
        .select("id")
        .where("id", "=", event.messageId)
        .executeTakeFirst(),
    ).toBeDefined();
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

test("publishing selects only connected conversation members before session transactions", async () => {
  const [a, b, other] = await Promise.all([register(), register(), register()]);
  const conversation = await direct(a.id, b.id);
  const committed = await (await send(conversation.id, a.cookie)).json();
  const sessions = await db
    .selectFrom("sessions")
    .select(["id", "user_id as userId"])
    .where("user_id", "in", [a.id, b.id, other.id])
    .execute();
  const sessionIds = new Map(sessions.map((row) => [row.userId, row.id]));
  // If an unrelated connection reaches deliver, its expired session closes it.
  await db
    .updateTable("sessions")
    .set({ expires_at: new Date(0) })
    .where("user_id", "=", other.id)
    .execute();
  const sessionLookups: string[] = [];
  let transactions = 0;
  let selections = 0;
  const instrumented = observeQueries(db, {
    before(query) {
      if (isRecipientSelection(query)) {
        selections++;
        expect(query.sql).toBe(
          'select "user_id" as "userId" from "conversation_members" where "conversation_id" = $1 and "user_id" in ($2, $3, $4)',
        );
        expect(query.parameters).toEqual([
          conversation.id,
          a.id,
          b.id,
          other.id,
        ]);
      }
      if (query.sql === "begin") transactions++;
      // Count the session read, not its separate FOR SHARE coordination lock.
      if (
        query.sql.startsWith(
          'select "user_id" as "userId", "expires_at" as "expiresAt" from "sessions"',
        )
      ) {
        const sessionId = query.parameters[0];
        if (typeof sessionId !== "string")
          throw new Error("Missing session query ID");
        sessionLookups.push(sessionId);
      }
    },
  });
  const streams = createConversationStreams(instrumented);
  const abort = new AbortController();
  const readers = await Promise.all(
    [a, b, other].map(async (user) => {
      const sessionId = sessionIds.get(user.id);
      if (!sessionId) throw new Error("Missing session fixture");
      const response = streams.connect(user.id, sessionId, abort.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing SSE body");
      await reader.read();
      return reader;
    }),
  );
  const [aReader, bReader, otherReader] = readers;
  if (!aReader || !bReader || !otherReader)
    throw new Error("Missing stream fixture");
  let unrelatedSettled = false;
  const unrelatedRead = otherReader.read().then((result) => {
    unrelatedSettled = true;
    return result;
  });
  try {
    await streams.publish({
      type: "message.created",
      conversationId: conversation.id,
      messageId: committed.id,
    });
    expect(selections).toBe(1);
    expect(transactions).toBe(2);
    expect(sessionLookups.sort()).toEqual(
      sessions
        .filter((session) => session.userId === a.id || session.userId === b.id)
        .map((session) => session.id)
        .sort(),
    );
    expect((await nextEvent(aReader)).messageId).toBe(committed.id);
    expect((await nextEvent(bReader)).messageId).toBe(committed.id);
    // No frame and no close: even an invalid unrelated session stays untouched
    // until its own heartbeat, rather than being processed for every message.
    expect(unrelatedSettled).toBe(false);
  } finally {
    abort.abort();
    streams.close();
  }
  expect((await unrelatedRead).done).toBe(true);
});

test("recipient lookup failure does not fail a committed HTTP send or close streams", async () => {
  const [a, b, other] = await Promise.all([register(), register(), register()]);
  const conversation = await direct(a.id, b.id);
  const instrumented = observeQueries(db, {
    before(query) {
      if (isRecipientSelection(query)) {
        throw new Error("Recipient lookup unavailable");
      }
    },
  });
  const streams = createConversationStreams(instrumented);
  const isolatedApp = new Elysia({ normalize: false }).group("/api/v1", (app) =>
    app.use(conversationRoutes(db, auth, [origin], streams)),
  );
  const abort = new AbortController();
  const reads = await Promise.all(
    [b, other].map(async (user) => {
      const session = await db
        .selectFrom("sessions")
        .select("id")
        .where("user_id", "=", user.id)
        .executeTakeFirstOrThrow();
      const response = streams.connect(user.id, session.id, abort.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing SSE body");
      await reader.read();
      const state = { settled: false };
      const pending = reader.read().then((result) => {
        state.settled = true;
        return result;
      });
      return { state, pending };
    }),
  );
  try {
    const response = await isolatedApp.handle(
      new Request(`${origin}/api/v1${messages(conversation.id)}`, {
        method: "POST",
        headers: {
          origin,
          cookie: a.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: "persist despite SSE failure",
          requestId: "lookup-failure",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const message = await response.json();
    expect(
      await db
        .selectFrom("messages")
        .select("id")
        .where("id", "=", message.id)
        .executeTakeFirst(),
    ).toBeDefined();
    for (const { state } of reads) expect(state.settled).toBe(false);
  } finally {
    abort.abort();
    streams.close();
  }
  for (const { pending } of reads) expect((await pending).done).toBe(true);
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
  const revoke = db.transaction().execute(async (tx) => {
    await tx
      .selectFrom("projects")
      .select("id")
      .where("id", "=", p.id)
      .forUpdate()
      .execute();
    locked();
    await gate;
    await tx
      .deleteFrom("conversation_members")
      .where("conversation_id", "=", id)
      .where("user_id", "=", member.id)
      .execute();
    await tx
      .deleteFrom("project_members")
      .where("project_id", "=", p.id)
      .where("user_id", "=", member.id)
      .execute();
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
    await db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("projects")
        .select("id")
        .where("id", "=", p.id)
        .forUpdate()
        .execute();
      await tx
        .insertInto("project_members")
        .values({ project_id: p.id, user_id: member.id })
        .execute();
      await tx
        .insertInto("conversation_members")
        .values({ conversation_id: id, user_id: member.id })
        .execute();
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
  const session = await db
    .selectFrom("sessions")
    .select("id")
    .where("user_id", "=", member.id)
    .executeTakeFirstOrThrow();
  const selected = Promise.withResolvers<void>();
  const instrumented = observeQueries(db, {
    after(query) {
      if (isRecipientSelection(query)) selected.resolve();
    },
  });
  const streams = createConversationStreams(instrumented);
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
  const revoke = db.transaction().execute(async (tx) => {
    await tx
      .selectFrom("projects")
      .select("id")
      .where("id", "=", p.id)
      .forUpdate()
      .execute();
    locked();
    await gate;
    await tx
      .deleteFrom("conversation_members")
      .where("conversation_id", "=", conversationId)
      .where("user_id", "=", member.id)
      .execute();
    await tx
      .deleteFrom("project_members")
      .where("project_id", "=", p.id)
      .where("user_id", "=", member.id)
      .execute();
  });
  try {
    await acquired;
    const delivery = streams.publish({
      type: "message.created",
      conversationId,
      messageId: committed.id,
    });
    // Ensure preselection includes the still-visible member before revocation
    // commits; only the final locked membership check can suppress this event.
    await selected.promise;
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
  await db
    .updateTable("sessions")
    .set({ expires_at: new Date(0) })
    .where("user_id", "=", b.id)
    .execute();
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
  const session = await db
    .selectFrom("sessions")
    .select("id")
    .where("user_id", "=", user.id)
    .executeTakeFirstOrThrow();
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
