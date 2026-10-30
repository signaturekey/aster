import type { Database } from "@api/db/client";
import type { Prisma } from "@api/generated/prisma/client";
import { ProductError } from "@api/lib/errors";
import { decodeCursor, encodeCursor } from "@api/lib/pagination";

export type ConversationTransaction = Prisma.TransactionClient;

// Project membership mutations use this same Project row lock. Always acquire it
// before checking membership, including on history reads and live delivery.
export async function requireConversationMember(
  tx: ConversationTransaction,
  userId: string,
  conversationId: string,
) {
  const source = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { projectId: true },
  });
  if (!source) throw notFound();
  if (source.projectId) {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${source.projectId} FOR UPDATE`;
  } else {
    // Also serializes idempotent direct-message writes for this conversation.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`;
  }
  const member = await tx.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { userId: true },
  });
  if (!member) throw notFound();
}

function notFound() {
  return new ProductError(404, "NOT_FOUND", "Conversation not found");
}

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  requestId: true,
  text: true,
  createdAt: true,
} as const;

function before(cursor: ReturnType<typeof decodeCursor>) {
  return cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};
}

const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] as const;
type PageQuery = { limit?: number; cursor?: string };

function page<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}

export async function listConversations(
  db: Database,
  userId: string,
  query: PageQuery,
) {
  const cursor = decodeCursor(query.cursor);
  const limit = query.limit ?? 20;
  const rows = await db.conversation.findMany({
    where: { members: { some: { userId } }, ...before(cursor) },
    select: { id: true, matchId: true, projectId: true, createdAt: true },
    orderBy: [...newestFirst],
    take: limit + 1,
  });
  return page(rows, limit);
}

export async function getMessages(
  db: Database,
  userId: string,
  conversationId: string,
  query: PageQuery,
) {
  const cursor = decodeCursor(query.cursor);
  const limit = query.limit ?? 20;
  return db.$transaction(async (tx) => {
    await requireConversationMember(tx, userId, conversationId);
    const rows = await tx.message.findMany({
      where: { conversationId, ...before(cursor) },
      select: messageSelect,
      orderBy: [...newestFirst],
      take: limit + 1,
    });
    return page(rows, limit);
  });
}

export async function sendMessage(
  db: Database,
  userId: string,
  conversationId: string,
  input: { text: string; requestId: string },
) {
  const text = input.text;
  if (
    !text.trim().length ||
    input.text.length > 4000 ||
    !input.requestId.length ||
    input.requestId.length > 128
  )
    throw new ProductError(422, "VALIDATION_ERROR", "Message is invalid");
  return db.$transaction(async (tx) => {
    await requireConversationMember(tx, userId, conversationId);
    const existing = await tx.message.findUnique({
      where: {
        conversationId_senderId_requestId: {
          conversationId,
          senderId: userId,
          requestId: input.requestId,
        },
      },
      select: messageSelect,
    });
    if (existing) {
      if (existing.text !== text)
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
    const message = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        text,
        requestId: input.requestId,
      },
      select: messageSelect,
    });
    return {
      message: { ...message, createdAt: message.createdAt.toISOString() },
      created: true,
    };
  });
}
