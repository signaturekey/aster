import { afterAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { migrateDatabase } from "@api/db/migrate";
import { createDirectConversation } from "@api/modules/conversations/kysely-membership";
import {
  getMessages,
  sendMessage,
} from "@api/modules/conversations/kysely-service";
import { createConversationStreams } from "@api/modules/conversations/kysely-streams";
import { sql } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `chat_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
await sql`create schema ${sql.id(schema)}`.execute(admin);
const scoped = new URL(url);
scoped.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scoped.toString());
await migrateDatabase(db);
const streams = createConversationStreams(db);
afterAll(async () => {
  streams.close();
  await db.destroy();
  await sql`drop schema ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});

async function direct() {
  const ids = [crypto.randomUUID(), crypto.randomUUID()].sort();
  const a = ids[0],
    b = ids[1];
  if (!a || !b) throw Error("Missing fixture IDs");
  await db
    .insertInto("users")
    .values(
      [a, b].map((id) => ({
        id,
        name: "Test",
        email: `${id}@example.test`,
        image: null,
      })),
    )
    .execute();
  const convo = await db.transaction().execute(async (tx) => {
    const match = await tx
      .insertInto("matches")
      .values({ low_id: a, high_id: b })
      .returning("id")
      .executeTakeFirstOrThrow();
    return createDirectConversation(tx, match.id, [a, b]);
  });
  return { a, b, id: convo.id };
}

test("Kysely message writes preserve exact content and deduplicate concurrent requests", async () => {
  const c = await direct(),
    input = { text: "  hello  ", requestId: crypto.randomUUID() };
  const sent = await Promise.all([
    sendMessage(db, c.a, c.id, input),
    sendMessage(db, c.a, c.id, input),
  ]);
  expect(sent[0]?.message.id).toBe(sent[1]?.message.id);
  expect(sent[0]?.message.text).toBe(input.text);
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(
    sendMessage(db, c.a, c.id, { ...input, text: "hello" }),
  ).rejects.toMatchObject({ status: 409 });
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(getMessages(db, "outsider", c.id, {})).rejects.toMatchObject({
    status: 404,
  });
  expect((await getMessages(db, c.b, c.id, {})).items).toHaveLength(1);
});

test("Kysely SSE rechecks current session membership and seals shutdown", async () => {
  const c = await direct(),
    sessionId = crypto.randomUUID();
  await db
    .insertInto("sessions")
    .values({
      id: sessionId,
      user_id: c.b,
      token: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 60000),
      ip_address: null,
      user_agent: null,
    })
    .execute();
  const abort = new AbortController();
  const response = streams.connect(c.b, sessionId, abort.signal),
    reader = response.body?.getReader();
  if (!reader) throw Error("No stream");
  await reader.read();
  const sent = await sendMessage(db, c.a, c.id, {
    text: "committed",
    requestId: crypto.randomUUID(),
  });
  await streams.publish({
    type: "message.created",
    conversationId: c.id,
    messageId: sent.message.id,
  });
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    sent.message.id,
  );
  await db
    .deleteFrom("conversation_members")
    .where("conversation_id", "=", c.id)
    .where("user_id", "=", c.b)
    .execute();
  await streams.publish({
    type: "message.created",
    conversationId: c.id,
    messageId: sent.message.id,
  });
  streams.close();
  expect((await reader.read()).done).toBe(true);
  expect(streams.connect(c.b, sessionId, abort.signal).status).toBe(503);
  abort.abort();
});
