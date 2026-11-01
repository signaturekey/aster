import type {
  SqlConnection,
  SqlDatabase,
  SqlTransaction,
} from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import { pageOptions, pageResult } from "@api/lib/pagination";
import { createProjectConversation } from "@api/modules/conversations/membership";
import {
  getProfileRows,
  publicProfile,
  requireCompleteProfile,
} from "@api/modules/profiles/service";
import type {
  PageQuery,
  ProjectCatalogueQuery,
  ProjectCreate,
  ProjectPatch,
  PublicMember,
  PublicProject,
} from "@api/modules/projects/schemas";
import { sql } from "kysely";

export const projectSelect = [
  "id",
  "title",
  "description",
  "goal_id as goalId",
  "required_roles as requiredRoles",
  "owner_id as ownerId",
  "recruitment_open as recruitmentOpen",
  "created_at as createdAt",
  "updated_at as updatedAt",
] as const;

function projectQuery(db: SqlConnection) {
  return db.selectFrom("projects").select(projectSelect);
}
type ProjectScalars = Awaited<
  ReturnType<ReturnType<typeof projectQuery>["execute"]>
>[number];
export type ProjectRow = ProjectScalars & {
  requiredSkills: { skillId: string }[];
};

async function hydrateProjects(db: SqlConnection, rows: ProjectScalars[]) {
  if (!rows.length) return [];
  const skills = await db
    .selectFrom("project_skills")
    .select(["project_id as projectId", "skill_id as skillId"])
    .where(
      "project_id",
      "in",
      rows.map(({ id }) => id),
    )
    .orderBy("skill_id")
    .execute();
  const byProject = new Map<string, { skillId: string }[]>();
  for (const { projectId, skillId } of skills) {
    const entries = byProject.get(projectId) ?? [];
    entries.push({ skillId });
    byProject.set(projectId, entries);
  }
  return rows.map((row) => ({
    ...row,
    requiredSkills: byProject.get(row.id) ?? [],
  }));
}

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

export async function projectRow(
  db: SqlConnection,
  id: string,
): Promise<ProjectRow> {
  const row = await projectQuery(db).where("id", "=", id).executeTakeFirst();
  if (!row) throw projectNotFound();
  const [hydrated] = await hydrateProjects(db, [row]);
  if (!hydrated) throw projectNotFound();
  return hydrated;
}

export async function lockProject(tx: SqlTransaction, id: string) {
  // Application and membership mutations need current authorization state, not
  // public fields or skills. Keep their exclusive lock without full hydration.
  const project = await tx
    .selectFrom("projects")
    .select([
      "id",
      "owner_id as ownerId",
      "recruitment_open as recruitmentOpen",
    ])
    .where("id", "=", id)
    .forUpdate()
    .executeTakeFirst();
  if (!project) throw projectNotFound();
  return project;
}

export function requireOwner(ownerId: string, actorId: string) {
  if (ownerId !== actorId)
    throw new ProductError(
      403,
      "OWNER_REQUIRED",
      "Only the owner may do this.",
    );
}

const invalidDictionary = () =>
  new ProductError(
    422,
    "INVALID_DICTIONARY_VALUE",
    "Unsupported project dictionary value.",
  );

async function validateGoal(db: SqlConnection, goalId: string | undefined) {
  if (
    goalId !== undefined &&
    !(await db
      .selectFrom("goals")
      .select("id")
      .where("id", "=", goalId)
      .executeTakeFirst())
  )
    throw invalidDictionary();
}

async function validateDictionaries(tx: SqlTransaction, input: ProjectPatch) {
  await validateGoal(tx, input.goalId);
  if (input.requiredSkillIds !== undefined) {
    const skills = input.requiredSkillIds.length
      ? await tx
          .selectFrom("skills")
          .select("id")
          .where("id", "in", input.requiredSkillIds)
          .execute()
      : [];
    if (skills.length !== input.requiredSkillIds.length)
      throw invalidDictionary();
  }
}

export async function createProject(
  db: SqlDatabase,
  actorId: string,
  input: ProjectCreate,
) {
  return db.transaction().execute(async (tx) => {
    await tx
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", actorId)
      .forUpdate()
      .execute();
    await requireCompleteProfile(tx, actorId);
    await validateDictionaries(tx, input);
    // The initially deferred owner-membership FK permits these dependent rows
    // to be established together, with no partially visible owner or chat.
    const row = await tx
      .insertInto("projects")
      .values({
        title: input.title,
        description: input.description,
        goal_id: input.goalId,
        required_roles: input.requiredRoles,
        owner_id: actorId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("project_members")
      .values({ project_id: row.id, user_id: actorId })
      .execute();
    if (input.requiredSkillIds.length)
      await tx
        .insertInto("project_skills")
        .values(
          input.requiredSkillIds.map((skillId) => ({
            project_id: row.id,
            skill_id: skillId,
          })),
        )
        .execute();
    await createProjectConversation(tx, row.id, actorId);
    return publicProject(await projectRow(tx, row.id));
  });
}

export async function getProject(db: SqlDatabase, projectId: string) {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => publicProject(await projectRow(tx, projectId)));
}

function equalStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export async function updateProject(
  db: SqlDatabase,
  actorId: string,
  projectId: string,
  input: ProjectPatch,
) {
  return db.transaction().execute(async (tx) => {
    const authorization = await lockProject(tx, projectId);
    requireOwner(authorization.ownerId, actorId);
    // Full state is needed only for PATCH comparisons and the public response;
    // retain it after authorization so no-op updates preserve their timestamp.
    const project = await projectRow(tx, projectId);
    await validateDictionaries(tx, input);
    const skillIds =
      input.requiredSkillIds && [...input.requiredSkillIds].sort();
    const skillsChanged =
      skillIds !== undefined &&
      !equalStrings(
        skillIds,
        project.requiredSkills.map(({ skillId }) => skillId),
      );
    const fieldsChanged =
      (input.title !== undefined && input.title !== project.title) ||
      (input.description !== undefined &&
        input.description !== project.description) ||
      (input.goalId !== undefined && input.goalId !== project.goalId) ||
      (input.requiredRoles !== undefined &&
        !equalStrings(input.requiredRoles, project.requiredRoles)) ||
      (input.recruitmentOpen !== undefined &&
        input.recruitmentOpen !== project.recruitmentOpen);
    if (!skillsChanged && !fieldsChanged) return publicProject(project);
    await tx
      .updateTable("projects")
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.goalId !== undefined && { goal_id: input.goalId }),
        ...(input.requiredRoles !== undefined && {
          required_roles: input.requiredRoles,
        }),
        ...(input.recruitmentOpen !== undefined && {
          recruitment_open: input.recruitmentOpen,
        }),
        // Evaluate after acquiring the lock; transaction-start time could precede
        // the update of a writer that this operation waited for.
        updated_at: sql<Date>`clock_timestamp()`,
      })
      .where("id", "=", projectId)
      .execute();
    if (skillsChanged) {
      await tx
        .deleteFrom("project_skills")
        .where("project_id", "=", projectId)
        .execute();
      if (skillIds.length)
        await tx
          .insertInto("project_skills")
          .values(
            skillIds.map((skillId) => ({
              project_id: projectId,
              skill_id: skillId,
            })),
          )
          .execute();
    }
    return publicProject(await projectRow(tx, projectId));
  });
}

export async function listProjects(
  db: SqlDatabase,
  query: ProjectCatalogueQuery,
  memberId?: string,
) {
  const { limit, cursor } = pageOptions(query);
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await validateGoal(tx, query.goalId);
      let selection = projectQuery(tx);
      const text = query.q?.trim();
      if (text) {
        // Bind the pattern as data and escape LIKE metacharacters separately:
        // parameterization alone does not make %/_ literal substring characters.
        const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
        selection = selection.where((eb) =>
          eb.or([
            eb("title", "ilike", pattern),
            eb("description", "ilike", pattern),
          ]),
        );
      }
      if (query.goalId !== undefined)
        selection = selection.where("goal_id", "=", query.goalId);
      if (memberId)
        selection = selection.where(
          "id",
          "in",
          tx
            .selectFrom("project_members")
            .select("project_id")
            .where("user_id", "=", memberId),
        );
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
      const page = pageResult(rows, limit, (row) => row);
      const items = await hydrateProjects(tx, page.items);
      return { ...page, items: items.map(publicProject) };
    });
}

export async function listMembers(
  db: SqlDatabase,
  projectId: string,
  query: PageQuery,
) {
  const { limit, cursor } = pageOptions(query);
  // Ownership, membership and profile hydration must describe the same roster
  // even when transfer/removal commits between the separate batched SELECTs.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      const project = await tx
        .selectFrom("projects")
        .select("owner_id as ownerId")
        .where("id", "=", projectId)
        .executeTakeFirst();
      if (!project) throw projectNotFound();
      let selection = tx
        .selectFrom("project_members")
        .select([
          "project_id as projectId",
          "user_id as userId",
          "created_at as createdAt",
        ])
        .where("project_id", "=", projectId);
      if (cursor)
        selection = selection.where((eb) =>
          eb.or([
            eb("created_at", "<", cursor.createdAt),
            eb.and([
              eb("created_at", "=", cursor.createdAt),
              eb("user_id", "<", cursor.id),
            ]),
          ]),
        );
      const rows = await selection
        .orderBy("created_at", "desc")
        .orderBy("user_id", "desc")
        .limit(limit + 1)
        .execute();
      const page = pageResult(rows, limit, (row) => ({
        id: row.userId,
        createdAt: row.createdAt,
      }));
      const profiles = new Map(
        (
          await getProfileRows(
            tx,
            page.items.map(({ userId }) => userId),
          )
        ).map((row) => [row.userId, publicProfile(row)]),
      );
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
    });
}
