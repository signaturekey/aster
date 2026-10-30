import type { SqlDatabase, SqlTransaction } from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import { pageOptions, pageResult, type PageQuery } from "@api/lib/pagination";
import { sql } from "kysely";
import { lockProjectRow } from "@api/modules/projects/coordination";

export async function requireConversationMember(
  tx: SqlTransaction,
  userId: string,
  conversationId: string,
) {
  const source = await tx
    .selectFrom("conversations")
    .select("project_id")
    .where("id", "=", conversationId)
    .executeTakeFirst();
  const notFound = () =>
    new ProductError(404, "NOT_FOUND", "Conversation not found");
  if (!source) throw notFound();
  if (source.project_id) {
    // Same source row as recruitment, ownership and membership mutations.
    if (!(await lockProjectRow(tx, source.project_id))) throw notFound();
  } else {
    await tx
      .selectFrom("conversations")
      .select("id")
      .where("id", "=", conversationId)
      .forUpdate()
      .execute();
  }
  const member = await tx
    .selectFrom("conversation_members")
    .select("user_id")
    .where("conversation_id", "=", conversationId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!member) throw notFound();
}

const messageColumns = [
  "id",
  "conversation_id as conversationId",
  "sender_id as senderId",
  "request_id as requestId",
  "text",
  "created_at as createdAt",
] as const;
function serializePage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
) {
  const page = pageResult(rows, limit, (row) => row);
  return {
    ...page,
    items: page.items.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function listConversations(
  db: SqlDatabase,
  userId: string,
  query: PageQuery,
) {
  const { cursor, limit } = pageOptions(query);
  let statement = db
    .selectFrom("conversations as c")
    .innerJoin("conversation_members as m", "m.conversation_id", "c.id")
    .select([
      "c.id",
      "c.match_id as matchId",
      "c.project_id as projectId",
      "c.created_at as createdAt",
    ])
    .where("m.user_id", "=", userId);
  if (cursor)
    statement = statement.where(
      sql<boolean>`(c.created_at,c.id) < (${cursor.createdAt},${cursor.id})`,
    );
  const rows = await statement
    .orderBy("c.created_at", "desc")
    .orderBy("c.id", "desc")
    .limit(limit + 1)
    .execute();
  return serializePage(rows, limit);
}

export async function getMessages(
  db: SqlDatabase,
  userId: string,
  conversationId: string,
  query: PageQuery,
) {
  const { cursor, limit } = pageOptions(query);
  return db.transaction().execute(async (tx) => {
    await requireConversationMember(tx, userId, conversationId);
    let statement = tx
      .selectFrom("messages")
      .select(messageColumns)
      .where("conversation_id", "=", conversationId);
    if (cursor)
      statement = statement.where(
        sql<boolean>`(created_at,id) < (${cursor.createdAt},${cursor.id})`,
      );
    return serializePage(
      await statement
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(limit + 1)
        .execute(),
      limit,
    );
  });
}

export async function sendMessage(
  db: SqlDatabase,
  userId: string,
  conversationId: string,
  input: { text: string; requestId: string },
) {
  if (
    !input.text.trim() ||
    input.text.length > 4000 ||
    !input.requestId.length ||
    input.requestId.length > 128
  )
    throw new ProductError(422, "VALIDATION_ERROR", "Message is invalid");
  return db.transaction().execute(async (tx) => {
    await requireConversationMember(tx, userId, conversationId);
    const existing = await tx
      .selectFrom("messages")
      .select(messageColumns)
      .where("conversation_id", "=", conversationId)
      .where("sender_id", "=", userId)
      .where("request_id", "=", input.requestId)
      .executeTakeFirst();
    if (existing) {
      if (existing.text !== input.text)
        throw new ProductError(
          409,
          "REQUEST_ID_CONFLICT",
          "Request ID was already used for different text",
        );
      return {
        message: { ...existing, createdAt: existing.createdAt.toISOString() },
        created: false,
      };
    }
    const message = await tx
      .insertInto("messages")
      .values({
        conversation_id: conversationId,
        sender_id: userId,
        request_id: input.requestId,
        text: input.text,
      })
      .returning(messageColumns)
      .executeTakeFirstOrThrow();
    return {
      message: { ...message, createdAt: message.createdAt.toISOString() },
      created: true,
    };
  });
}
