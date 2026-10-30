import type { SqlTransaction } from "@api/db/kysely";

// The caller owns the source operation's transaction and project/pair lock.
// IDs come from SQL defaults and dependent inserts share the same transaction.
export async function createDirectConversation(
  tx: SqlTransaction,
  matchId: string,
  userIds: readonly [string, string],
) {
  const conversation = await tx
    .insertInto("conversations")
    .values({ match_id: matchId, project_id: null })
    .returning("id")
    .executeTakeFirstOrThrow();
  await tx
    .insertInto("conversation_members")
    .values(
      userIds.map((user_id) => ({ conversation_id: conversation.id, user_id })),
    )
    .execute();
  return conversation;
}

export async function createProjectConversation(
  tx: SqlTransaction,
  projectId: string,
  ownerId: string,
) {
  const conversation = await tx
    .insertInto("conversations")
    .values({ project_id: projectId, match_id: null })
    .returning("id")
    .executeTakeFirstOrThrow();
  await tx
    .insertInto("conversation_members")
    .values({ conversation_id: conversation.id, user_id: ownerId })
    .execute();
  return conversation;
}

export async function addProjectConversationMember(
  tx: SqlTransaction,
  projectId: string,
  userId: string,
) {
  const conversation = await tx
    .selectFrom("conversations")
    .select("id")
    .where("project_id", "=", projectId)
    .executeTakeFirstOrThrow();
  return tx
    .insertInto("conversation_members")
    .values({ conversation_id: conversation.id, user_id: userId })
    .returning("user_id")
    .executeTakeFirstOrThrow();
}

export function removeProjectConversationMember(
  tx: SqlTransaction,
  projectId: string,
  userId: string,
) {
  return tx
    .deleteFrom("conversation_members")
    .where("user_id", "=", userId)
    .where(
      "conversation_id",
      "in",
      tx
        .selectFrom("conversations")
        .select("id")
        .where("project_id", "=", projectId),
    )
    .execute();
}
