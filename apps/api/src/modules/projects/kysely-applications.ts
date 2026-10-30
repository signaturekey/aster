import type { SqlDatabase } from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import { pageOptions, pageResult } from "@api/lib/pagination";
import { addProjectConversationMember } from "@api/modules/conversations/kysely-membership";
import { requireCompleteProfile } from "@api/modules/profiles/kysely-service";
import {
  lockProject,
  requireOwner,
} from "@api/modules/projects/kysely-service";
import type {
  PageQuery,
  PublicApplication,
} from "@api/modules/projects/schemas";
import { sql, type Selectable } from "kysely";
import type { ApplicationTable } from "@api/db/types";

const applicationSelect = [
  "id",
  "project_id",
  "user_id",
  "text",
  "state",
  "created_at",
  "updated_at",
] as const;
function publicApplication(
  row: Selectable<ApplicationTable>,
): PublicApplication {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    text: row.text,
    state: row.state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
const applicationNotFound = () =>
  new ProductError(404, "APPLICATION_NOT_FOUND", "Application not found.");
const recruitmentClosed = () =>
  new ProductError(409, "RECRUITMENT_CLOSED", "Recruitment is closed.");

export async function submitApplication(
  db: SqlDatabase,
  actorId: string,
  projectId: string,
  text: string,
) {
  return db.transaction().execute(async (tx) => {
    const project = await lockProject(tx, projectId);
    if (!project.recruitmentOpen) throw recruitmentClosed();
    await tx
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", actorId)
      .forUpdate()
      .execute();
    await requireCompleteProfile(tx, actorId);
    if (
      await tx
        .selectFrom("project_members")
        .select("user_id")
        .where("project_id", "=", projectId)
        .where("user_id", "=", actorId)
        .executeTakeFirst()
    )
      throw new ProductError(
        409,
        "ALREADY_MEMBER",
        "You already belong to this project.",
      );
    // The project lock serializes the check/insert; the partial unique index
    // additionally protects one pending application per project/applicant.
    if (
      await tx
        .selectFrom("applications")
        .select("id")
        .where("project_id", "=", projectId)
        .where("user_id", "=", actorId)
        .where("state", "=", "pending")
        .executeTakeFirst()
    )
      throw new ProductError(
        409,
        "APPLICATION_PENDING",
        "A pending application already exists.",
      );
    const row = await tx
      .insertInto("applications")
      .values({ project_id: projectId, user_id: actorId, text })
      .returning(applicationSelect)
      .executeTakeFirstOrThrow();
    return publicApplication(row);
  });
}

export async function listApplications(
  db: SqlDatabase,
  actorId: string,
  query: PageQuery,
  projectId?: string,
) {
  const { limit, cursor } = pageOptions(query);
  return db.transaction().execute(async (tx) => {
    // Hold the lock through the page read so ownership cannot change between
    // authorization and disclosure of another applicant's private record.
    if (projectId !== undefined) {
      const project = await lockProject(tx, projectId);
      if (project.ownerId !== actorId) throw applicationNotFound();
    }
    let selection = tx.selectFrom("applications").select(applicationSelect);
    selection =
      projectId === undefined
        ? selection.where("user_id", "=", actorId)
        : selection.where("project_id", "=", projectId);
    if (cursor)
      selection = selection.where((eb) =>
        eb.or([
          eb("created_at", "<", cursor.createdAt),
          eb.and([
            eb("created_at", "=", cursor.createdAt),
            eb("id", "<", cursor.id),
          ]),
        ]),
      );
    const rows = await selection
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute();
    const page = pageResult(rows, limit, (row) => ({
      id: row.id,
      createdAt: row.created_at,
    }));
    return { ...page, items: page.items.map(publicApplication) };
  });
}

export async function transitionApplication(
  db: SqlDatabase,
  actorId: string,
  applicationId: string,
  outcome: "accepted" | "rejected" | "withdrawn",
) {
  return db.transaction().execute(async (tx) => {
    // Discover only the lock key before locking. All authorization uses state
    // reloaded after the project lock, including idempotent terminal retries.
    const reference = await tx
      .selectFrom("applications")
      .select("project_id")
      .where("id", "=", applicationId)
      .executeTakeFirst();
    if (!reference) throw applicationNotFound();
    const project = await lockProject(tx, reference.project_id);
    const application = await tx
      .selectFrom("applications")
      .select(applicationSelect)
      .where("id", "=", applicationId)
      .executeTakeFirst();
    if (!application) throw applicationNotFound();
    if (outcome === "withdrawn") {
      if (application.user_id !== actorId) throw applicationNotFound();
    } else {
      if (project.ownerId !== actorId && application.user_id !== actorId)
        throw applicationNotFound();
      requireOwner(project.ownerId, actorId);
    }
    // An accepted retry is an immutable outcome, never a membership upsert.
    if (application.state === outcome) return publicApplication(application);
    if (application.state !== "pending")
      throw new ProductError(
        409,
        "APPLICATION_DECIDED",
        "Application already has a different outcome.",
      );
    if (outcome === "accepted") {
      if (!project.recruitmentOpen) throw recruitmentClosed();
      await tx
        .insertInto("project_members")
        .values({ project_id: project.id, user_id: application.user_id })
        .execute();
      await addProjectConversationMember(tx, project.id, application.user_id);
    }
    const updated = await tx
      .updateTable("applications")
      .set({ state: outcome, updated_at: sql<Date>`clock_timestamp()` })
      .where("id", "=", applicationId)
      .returning(applicationSelect)
      .executeTakeFirstOrThrow();
    return publicApplication(updated);
  });
}
