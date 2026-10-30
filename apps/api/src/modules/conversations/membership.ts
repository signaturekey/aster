import type { Prisma } from "@api/generated/prisma/client";

// These operations run inside the source operation's transaction: mutual match
// creation, project creation, or a project mutation holding lockProjectRow.
export function createDirectConversation(
  tx: Prisma.TransactionClient,
  matchId: string,
  userIds: readonly [string, string],
) {
  return tx.conversation.create({
    data: {
      matchId,
      members: { create: userIds.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });
}

export function createProjectConversation(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerId: string,
) {
  return tx.conversation.create({
    data: {
      projectId,
      members: { create: { userId: ownerId } },
    },
    select: { id: true },
  });
}

export async function addProjectConversationMember(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
) {
  const conversation = await tx.conversation.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!conversation) throw new Error("Project conversation is missing");
  return tx.conversationMember.create({
    data: { conversationId: conversation.id, userId },
    select: { userId: true },
  });
}

export function removeProjectConversationMember(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
) {
  return tx.conversationMember.deleteMany({
    where: { userId, conversation: { projectId } },
  });
}
