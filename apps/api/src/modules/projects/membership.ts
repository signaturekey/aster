import type { SqlDatabase } from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import { removeProjectConversationMember } from "@api/modules/conversations/membership";
import {
  lockProject,
  publicProject,
  requireOwner,
} from "@api/modules/projects/service";
import { sql } from "kysely";

export async function removeMember(
  db: SqlDatabase,
  actorId: string,
  projectId: string,
  userId: string,
  leave = false,
) {
  return db.transaction().execute(async (tx) => {
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
    const membership = await tx
      .selectFrom("project_members")
      .select("user_id")
      .where("project_id", "=", projectId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (!membership)
      throw new ProductError(404, "MEMBER_NOT_FOUND", "Membership not found.");
    await removeProjectConversationMember(tx, projectId, userId);
    await tx
      .deleteFrom("project_members")
      .where("project_id", "=", projectId)
      .where("user_id", "=", userId)
      .execute();
    return { removed: true as const };
  });
}

export async function transferOwnership(
  db: SqlDatabase,
  actorId: string,
  projectId: string,
  userId: string,
) {
  return db.transaction().execute(async (tx) => {
    const project = await lockProject(tx, projectId);
    requireOwner(project.ownerId, actorId);
    if (
      !(await tx
        .selectFrom("project_members")
        .select("user_id")
        .where("project_id", "=", projectId)
        .where("user_id", "=", userId)
        .executeTakeFirst())
    )
      throw new ProductError(
        409,
        "MEMBER_REQUIRED",
        "The new owner must already be a member.",
      );
    if (project.ownerId === userId) return publicProject(project);
    const updated = await tx
      .updateTable("projects")
      .set({ owner_id: userId, updated_at: sql<Date>`clock_timestamp()` })
      .where("id", "=", projectId)
      .returning("updated_at")
      .executeTakeFirstOrThrow();
    return publicProject({
      ...project,
      ownerId: userId,
      updatedAt: updated.updated_at,
    });
  });
}
