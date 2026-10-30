import type { Database } from "../../db/client";
import { ProductError } from "../../lib/errors";
import {
  lockProject,
  projectSelect,
  publicProject,
  requireOwner,
} from "./service";

export async function removeMember(
  db: Database,
  actorId: string,
  projectId: string,
  userId: string,
  leave = false,
) {
  return db.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    if (!leave) requireOwner(project.ownerId, actorId);
    else if (userId !== actorId)
      throw new ProductError(
        403,
        "FORBIDDEN",
        "You may only leave as yourself.",
      );
    if (project.ownerId === userId)
      throw new ProductError(
        409,
        "OWNER_CANNOT_LEAVE",
        "Transfer ownership before leaving.",
      );
    const membership = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
    if (!membership)
      throw new ProductError(404, "MEMBER_NOT_FOUND", "Membership not found.");
    await tx.conversationMember.deleteMany({
      where: { userId, conversation: { projectId } },
    });
    await tx.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
    return { removed: true as const };
  });
}

export async function transferOwnership(
  db: Database,
  actorId: string,
  projectId: string,
  userId: string,
) {
  return db.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    requireOwner(project.ownerId, actorId);
    if (
      !(await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { userId: true },
      }))
    )
      throw new ProductError(
        409,
        "MEMBER_REQUIRED",
        "The new owner must already be a member.",
      );
    if (project.ownerId === userId) return publicProject(project);
    return publicProject(
      await tx.project.update({
        where: { id: projectId },
        data: { ownerId: userId },
        select: projectSelect,
      }),
    );
  });
}
