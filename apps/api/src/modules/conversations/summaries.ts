import type { SqlDatabase } from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import { decodeCursor, pageOptions, type PageQuery } from "@api/lib/pagination";
import type { conversationSummarySchema } from "@api/modules/conversations/schemas";
import { sql } from "kysely";

const cursorVersion = "conversation-activity-v1";

type ActivityCursor = { id: string; lastActivityAt: Date };
export function encodeConversationCursor(row: ActivityCursor) {
  return Buffer.from(
    JSON.stringify([cursorVersion, row.lastActivityAt.toISOString(), row.id]),
  ).toString("base64url");
}

export function decodeConversationCursor(value: string | undefined) {
  if (value === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error();
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    );
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 3 ||
      decoded[0] !== cursorVersion
    )
      throw new Error();
    // Reuse the reviewed timestamp/identifier validation, including pg's lower
    // timestamp boundary, without changing any other endpoint's cursor format.
    const tuple = decodeCursor(
      Buffer.from(JSON.stringify(decoded.slice(1))).toString("base64url"),
    );
    if (!tuple) throw new Error();
    const cursor = { id: tuple.id, lastActivityAt: tuple.createdAt };
    if (encodeConversationCursor(cursor) !== value) throw new Error();
    return cursor;
  } catch {
    throw new ProductError(422, "INVALID_CURSOR", "Cursor is invalid");
  }
}

function summaryQuery(db: SqlDatabase, userId: string) {
  return db
    .selectFrom("conversations as c")
    .innerJoin(
      "conversation_members as member",
      "member.conversation_id",
      "c.id",
    )
    .leftJoin("matches as match", "match.id", "c.match_id")
    .leftJoin("projects as project", "project.id", "c.project_id")
    .leftJoin("profiles as peer", (join) =>
      join.onRef(
        "peer.user_id",
        "=",
        sql<string>`case when match.low_id = ${userId} then match.high_id else match.low_id end`,
      ),
    )
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom("messages")
          .select(["id", "sender_id", "text", "created_at"])
          .whereRef("conversation_id", "=", "c.id")
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .limit(1)
          .as("latest"),
      (join) => join.onTrue(),
    )
    .select([
      "c.id",
      "c.match_id as matchId",
      "c.project_id as projectId",
      "c.created_at as createdAt",
      "project.title as projectTitle",
      "latest.id as messageId",
      "latest.sender_id as messageSenderId",
      "latest.text as messageText",
      "latest.created_at as messageCreatedAt",
      sql<
        string | null
      >`case when match.low_id = ${userId} then match.high_id else match.low_id end`.as(
        "peerId",
      ),
      sql<string>`coalesce(peer.display_name, '')`.as("peerDisplayName"),
      sql<Date>`coalesce(latest.created_at, c.created_at)`.as("lastActivityAt"),
    ])
    .where("member.user_id", "=", userId)
    .where((eb) =>
      eb.or([
        eb("c.project_id", "is", null),
        eb.exists(
          eb
            .selectFrom("project_members as roster")
            .select("roster.user_id")
            .whereRef("roster.project_id", "=", "c.project_id")
            .where("roster.user_id", "=", userId),
        ),
      ]),
    );
}

type SummaryRow = Awaited<
  ReturnType<ReturnType<typeof summaryQuery>["execute"]>
>[number];
function serializeSummary(
  row: SummaryRow,
): (typeof conversationSummarySchema)["static"] {
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    latestMessage:
      row.messageId !== null &&
      row.messageSenderId !== null &&
      row.messageText !== null &&
      row.messageCreatedAt !== null
        ? {
            id: row.messageId,
            senderId: row.messageSenderId,
            text: row.messageText,
            createdAt: row.messageCreatedAt.toISOString(),
          }
        : null,
  };
  if (row.matchId !== null && row.peerId !== null) {
    return {
      ...base,
      kind: "direct",
      matchId: row.matchId,
      projectId: null,
      peer: { userId: row.peerId, displayName: row.peerDisplayName },
      project: null,
    };
  }
  if (row.projectId !== null && row.projectTitle !== null) {
    return {
      ...base,
      kind: "project",
      matchId: null,
      projectId: row.projectId,
      peer: null,
      project: { id: row.projectId, title: row.projectTitle },
    };
  }
  throw new Error("Conversation source invariant violated");
}

export async function listConversationSummaries(
  db: SqlDatabase,
  userId: string,
  query: PageQuery,
) {
  const { limit } = pageOptions(
    query.limit === undefined ? {} : { limit: query.limit },
  );
  const cursor = decodeConversationCursor(query.cursor);
  const statement = summaryQuery(db, userId).as("summary");
  // One statement authorizes and projects from the same committed snapshot.
  // The indexed lateral lookup returns at most one message per conversation;
  // no per-row client requests or additional application/database round trips.
  let page = db.selectFrom(statement).selectAll();
  if (cursor) {
    page = page.where(
      sql<boolean>`("lastActivityAt", id) < (${cursor.lastActivityAt}, ${cursor.id})`,
    );
  }
  const rows = await page
    .orderBy("lastActivityAt", "desc")
    .orderBy("id", "desc")
    .limit(limit + 1)
    .execute();
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(serializeSummary),
    nextCursor:
      rows.length > limit && last ? encodeConversationCursor(last) : null,
  };
}

export async function getConversationSummary(
  db: SqlDatabase,
  userId: string,
  conversationId: string,
) {
  const row = await summaryQuery(db, userId)
    .where("c.id", "=", conversationId)
    .executeTakeFirst();
  if (!row) throw new ProductError(404, "NOT_FOUND", "Conversation not found");
  return serializeSummary(row);
}
