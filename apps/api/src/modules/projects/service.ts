import type { Database } from "@api/db/client";
import type { Prisma } from "@api/generated/prisma/client";
import { ProductError } from "@api/lib/errors";
import { beforeCursor, pageOptions, pageResult } from "@api/lib/pagination";
import {
  profileSelect,
  publicProfile,
  requireCompleteProfile,
} from "@api/modules/profiles/service";
import type {
  PageQuery,
  ProjectCreate,
  ProjectPatch,
  PublicMember,
  PublicProject,
} from "@api/modules/projects/schemas";

export const projectSelect = {
  id: true,
  title: true,
  description: true,
  goalId: true,
  requiredRoles: true,
  requiredSkills: { select: { skillId: true }, orderBy: { skillId: "asc" } },
  ownerId: true,
  recruitmentOpen: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

export function publicProject(row: ProjectRow): PublicProject {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    goalId: row.goalId,
    requiredRoles: [...row.requiredRoles],
    requiredSkillIds: row.requiredSkills.map(({ skillId }) => skillId),
    ownerId: row.ownerId,
    recruitmentOpen: row.recruitmentOpen,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const projectNotFound = () =>
  new ProductError(404, "PROJECT_NOT_FOUND", "Project not found.");

// All project mutations, application transitions, and project message writes
// coordinate on this row. Read state only after acquiring the lock.
export async function lockProject(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Project" WHERE "id" = ${id} FOR UPDATE
  `;
  if (!rows.length) throw projectNotFound();
  return tx.project.findUniqueOrThrow({
    where: { id },
    select: projectSelect,
  });
}

export function requireOwner(ownerId: string, actorId: string) {
  if (ownerId !== actorId)
    throw new ProductError(
      403,
      "OWNER_REQUIRED",
      "Only the owner may do this.",
    );
}

async function validateDictionaries(
  tx: Prisma.TransactionClient,
  input: ProjectPatch,
) {
  if (
    (input.goalId !== undefined &&
      !(await tx.goal.findUnique({
        where: { id: input.goalId },
        select: { id: true },
      }))) ||
    (input.requiredSkillIds !== undefined &&
      (await tx.skill.count({
        where: { id: { in: input.requiredSkillIds } },
      })) !== input.requiredSkillIds.length)
  )
    throw new ProductError(
      422,
      "INVALID_DICTIONARY_VALUE",
      "Unsupported project dictionary value.",
    );
}

export async function createProject(
  db: Database,
  actorId: string,
  input: ProjectCreate,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId" = ${actorId} FOR UPDATE`;
    await requireCompleteProfile(tx, actorId);
    await validateDictionaries(tx, input);
    // The deferred owner-membership FK permits the project and sole owner
    // membership to be established together, never exposed partially.
    const project = await tx.project.create({
      data: {
        title: input.title,
        description: input.description,
        goalId: input.goalId,
        requiredRoles: input.requiredRoles,
        ownerId: actorId,
        recruitmentOpen: true,
        requiredSkills: {
          create: input.requiredSkillIds.map((skillId) => ({ skillId })),
        },
        members: { create: { userId: actorId } },
        conversation: {
          create: { members: { create: { userId: actorId } } },
        },
      },
      select: projectSelect,
    });
    return publicProject(project);
  });
}

export async function getProject(db: Database, projectId: string) {
  const row = await db.project.findUnique({
    where: { id: projectId },
    select: projectSelect,
  });
  if (!row) throw projectNotFound();
  return publicProject(row);
}

export async function updateProject(
  db: Database,
  actorId: string,
  projectId: string,
  input: ProjectPatch,
) {
  return db.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    requireOwner(project.ownerId, actorId);
    await validateDictionaries(tx, input);
    const { requiredSkillIds, ...fields } = input;
    const data: Prisma.ProjectUpdateInput = { ...fields };
    if (requiredSkillIds !== undefined)
      data.requiredSkills = {
        deleteMany: {},
        create: requiredSkillIds.map((skillId) => ({ skillId })),
      };
    if (!Object.keys(data).length) return publicProject(project);
    return publicProject(
      await tx.project.update({
        where: { id: projectId },
        data,
        select: projectSelect,
      }),
    );
  });
}

export async function listProjects(
  db: Database,
  query: PageQuery,
  memberId?: string,
) {
  const { limit, cursor } = pageOptions(query);
  const rows = await db.project.findMany({
    where: {
      ...beforeCursor(cursor),
      ...(memberId ? { members: { some: { userId: memberId } } } : {}),
    },
    select: projectSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = pageResult(rows, limit, (row) => row);
  return { ...page, items: page.items.map(publicProject) };
}

export async function listMembers(
  db: Database,
  projectId: string,
  query: PageQuery,
) {
  const { limit, cursor } = pageOptions(query);
  return db.$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      });
      if (!project) throw projectNotFound();
      const rows = await tx.projectMember.findMany({
        where: {
          projectId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, userId: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: { projectId: true, userId: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { userId: "desc" }],
        take: limit + 1,
      });
      const page = pageResult(rows, limit, (row) => ({
        id: row.userId,
        createdAt: row.createdAt,
      }));
      if (!page.items.length) return { ...page, items: [] };
      const userIds = page.items.map((row) => row.userId);
      const profiles = new Map(
        (
          await tx.profile.findMany({
            where: { userId: { in: userIds } },
            select: profileSelect,
          })
        ).map((row) => [row.userId, publicProfile(row)]),
      );
      const missingIds = userIds.filter((userId) => !profiles.has(userId));
      if (missingIds.length) {
        // Preserve lazy profile creation for legacy members without issuing
        // per-member reads or writes. Normal create/apply flows already have profiles.
        await tx.profile.createMany({
          data: missingIds.map((userId) => ({ userId })),
          skipDuplicates: true,
        });
        const created = await tx.profile.findMany({
          where: { userId: { in: missingIds } },
          select: profileSelect,
        });
        for (const row of created) profiles.set(row.userId, publicProfile(row));
      }
      const items: PublicMember[] = page.items.map((row) => {
        const profile = profiles.get(row.userId);
        if (!profile)
          throw new ProductError(
            404,
            "PROFILE_NOT_FOUND",
            "Profile not found.",
          );
        return {
          projectId: row.projectId,
          userId: row.userId,
          role: row.userId === project.ownerId ? "owner" : "member",
          createdAt: row.createdAt.toISOString(),
          profile,
        };
      });
      return { ...page, items };
    },
    // Ownership, membership, and public profiles must describe one roster,
    // even if ownership transfers and the former owner leaves between reads.
    { isolationLevel: "RepeatableRead" },
  );
}
