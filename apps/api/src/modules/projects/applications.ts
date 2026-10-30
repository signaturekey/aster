import type { Database } from "@api/db/client";
import type { Prisma } from "@api/generated/prisma/client";
import { ProductError } from "@api/lib/errors";
import { requireCompleteProfile } from "@api/modules/profiles/service";
import type {
  PageQuery,
  PublicApplication,
} from "@api/modules/projects/schemas";
import {
  beforeCursor,
  lockProject,
  pageOptions,
  pageResult,
  requireOwner,
} from "@api/modules/projects/service";

const applicationSelect = {
  id: true,
  projectId: true,
  userId: true,
  text: true,
  state: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ApplicationSelect;
type ApplicationRow = Prisma.ApplicationGetPayload<{
  select: typeof applicationSelect;
}>;

function publicApplication(row: ApplicationRow): PublicApplication {
  const state = row.state;
  if (
    state !== "pending" &&
    state !== "accepted" &&
    state !== "rejected" &&
    state !== "withdrawn"
  )
    throw new Error("Unexpected application state");
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    text: row.text,
    state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const applicationNotFound = () =>
  new ProductError(404, "APPLICATION_NOT_FOUND", "Application not found.");
const recruitmentClosed = () =>
  new ProductError(409, "RECRUITMENT_CLOSED", "Recruitment is closed.");

export async function submitApplication(
  db: Database,
  actorId: string,
  projectId: string,
  text: string,
) {
  return db.$transaction(async (tx) => {
    const project = await lockProject(tx, projectId);
    if (!project.recruitmentOpen) throw recruitmentClosed();
    await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId" = ${actorId} FOR UPDATE`;
    await requireCompleteProfile(tx, actorId);
    if (
      await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actorId } },
        select: { userId: true },
      })
    )
      throw new ProductError(
        409,
        "ALREADY_MEMBER",
        "You already belong to this project.",
      );
    if (
      await tx.application.findFirst({
        where: { projectId, userId: actorId, state: "pending" },
        select: { id: true },
      })
    )
      throw new ProductError(
        409,
        "APPLICATION_PENDING",
        "A pending application already exists.",
      );
    return publicApplication(
      await tx.application.create({
        data: { projectId, userId: actorId, text },
        select: applicationSelect,
      }),
    );
  });
}

export async function listApplications(
  db: Database,
  actorId: string,
  query: PageQuery,
  projectId?: string,
) {
  const { limit, cursor } = pageOptions(query);
  return db.$transaction(async (tx) => {
    // Holding the project lock through the read makes owner authorization and
    // page contents one operation with respect to concurrent ownership transfer.
    if (projectId !== undefined) {
      const project = await lockProject(tx, projectId);
      if (project.ownerId !== actorId) throw applicationNotFound();
    }
    const rows = await tx.application.findMany({
      where: {
        ...(projectId === undefined ? { userId: actorId } : { projectId }),
        ...beforeCursor(cursor),
      },
      select: applicationSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = pageResult(rows, limit, (row) => row);
    return { ...page, items: page.items.map(publicApplication) };
  });
}

export async function transitionApplication(
  db: Database,
  actorId: string,
  applicationId: string,
  outcome: "accepted" | "rejected" | "withdrawn",
) {
  return db.$transaction(async (tx) => {
    // This lookup only discovers the coordination key. Never authorize from
    // state read before the project lock or leak another applicant's record.
    const reference = await tx.application.findUnique({
      where: { id: applicationId },
      select: { projectId: true },
    });
    if (!reference) throw applicationNotFound();
    const project = await lockProject(tx, reference.projectId);
    const application = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: applicationSelect,
    });
    if (outcome === "withdrawn") {
      if (application.userId !== actorId) throw applicationNotFound();
    } else {
      // Applications are private even to non-owner project members.
      if (project.ownerId !== actorId && application.userId !== actorId)
        throw applicationNotFound();
      requireOwner(project.ownerId, actorId);
    }
    // Authenticate and authorize against the CURRENT owner before a retry.
    // An old acceptance is an immutable outcome, not a membership upsert.
    if (application.state === outcome) return publicApplication(application);
    if (application.state !== "pending")
      throw new ProductError(
        409,
        "APPLICATION_DECIDED",
        "Application already has a different outcome.",
      );
    if (outcome === "accepted") {
      if (!project.recruitmentOpen) throw recruitmentClosed();
      const conversation = await tx.conversation.findUnique({
        where: { projectId: project.id },
        select: { id: true },
      });
      if (!conversation) throw new Error("Project conversation is missing");
      await tx.projectMember.create({
        data: { projectId: project.id, userId: application.userId },
        select: { userId: true },
      });
      await tx.conversationMember.create({
        data: { conversationId: conversation.id, userId: application.userId },
        select: { userId: true },
      });
    }
    return publicApplication(
      await tx.application.update({
        where: { id: applicationId },
        data: { state: outcome },
        select: applicationSelect,
      }),
    );
  });
}
