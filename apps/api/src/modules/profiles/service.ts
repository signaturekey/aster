import type { SqlConnection, SqlDatabase } from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import type {
  ProfilePatch,
  PublicProfile,
} from "@api/modules/profiles/schemas";
import { sql } from "kysely";

function loadProfileScalars(db: SqlConnection, ids: readonly string[]) {
  // Explicit public projection: no user/account/session data enters hydration.
  return db
    .selectFrom("profiles")
    .select([
      "user_id as userId",
      "display_name as displayName",
      "bio",
      "specialization_id as specializationId",
      "experience_id as experienceId",
      "portfolio_links as portfolioLinks",
      "discoverable",
      "created_at as createdAt",
      "updated_at as updatedAt",
    ])
    .where("user_id", "in", ids)
    .execute();
}

type ProfileScalars = Awaited<ReturnType<typeof loadProfileScalars>>[number];
export type ProfileRow = ProfileScalars & {
  skills: { skillId: string }[];
  goals: { goalId: string }[];
};

export function defaultProfile(user: {
  id: string;
  createdAt: Date;
}): ProfileRow {
  return {
    userId: user.id,
    displayName: "",
    bio: "",
    specializationId: null,
    experienceId: null,
    portfolioLinks: [],
    discoverable: false,
    skills: [],
    goals: [],
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
  };
}

export function publicProfile(row: ProfileRow): PublicProfile {
  const skillIds = row.skills.map(({ skillId }) => skillId).sort();
  const goalIds = row.goals.map(({ goalId }) => goalId).sort();
  const missingFields: PublicProfile["missingFields"] = [];
  if (!row.displayName.trim()) missingFields.push("displayName");
  if (!row.specializationId) missingFields.push("specializationId");
  if (!skillIds.length) missingFields.push("skillIds");
  if (!goalIds.length) missingFields.push("goalIds");

  return {
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    specializationId: row.specializationId,
    experienceId: row.experienceId,
    skillIds,
    goalIds,
    portfolioLinks: [...row.portfolioLinks],
    discoverable: row.discoverable,
    complete: missingFields.length === 0,
    missingFields,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// At most four SELECTs, independent of roster size. A root read needs one
// snapshot across scalar/collection hydration; transaction callers retain their
// existing lock/isolation boundary instead of starting a nested transaction.
// Missing users are omitted; existing users without profiles get read-only defaults.
export async function getProfileRows(
  db: SqlConnection,
  ids: readonly string[],
): Promise<ProfileRow[]> {
  if (!db.isTransaction)
    return db
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute((tx) => getProfileRows(tx, ids));
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];
  const profiles = await loadProfileScalars(db, uniqueIds);
  const rows = new Map<string, ProfileRow>(
    profiles.map((row) => [row.userId, { ...row, skills: [], goals: [] }]),
  );
  if (profiles.length) {
    const storedIds = profiles.map((row) => row.userId);
    const skills = await db
      .selectFrom("profile_skills")
      .select(["user_id as userId", "skill_id as skillId"])
      .where("user_id", "in", storedIds)
      .orderBy("skill_id")
      .execute();
    const goals = await db
      .selectFrom("profile_goals")
      .select(["user_id as userId", "goal_id as goalId"])
      .where("user_id", "in", storedIds)
      .orderBy("goal_id")
      .execute();
    for (const { userId, skillId } of skills)
      rows.get(userId)?.skills.push({ skillId });
    for (const { userId, goalId } of goals)
      rows.get(userId)?.goals.push({ goalId });
  }
  const missingIds = uniqueIds.filter((id) => !rows.has(id));
  if (missingIds.length) {
    const users = await db
      .selectFrom("users")
      .select(["id", "created_at as createdAt"])
      .where("id", "in", missingIds)
      .execute();
    for (const user of users) rows.set(user.id, defaultProfile(user));
  }
  return uniqueIds.flatMap((id) => {
    const row = rows.get(id);
    return row ? [row] : [];
  });
}

async function getProfileRow(db: SqlConnection, userId: string) {
  const [row] = await getProfileRows(db, [userId]);
  if (!row)
    throw new ProductError(404, "PROFILE_NOT_FOUND", "Profile not found.");
  return row;
}

export async function getProfile(db: SqlConnection, userId: string) {
  // Known-ID visibility is independent of completeness and discovery opt-in.
  return publicProfile(await getProfileRow(db, userId));
}

function equalStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export async function updateProfile(
  db: SqlDatabase,
  userId: string,
  input: ProfilePatch,
) {
  return db.transaction().execute(async (tx) => {
    const invalidDictionary = () =>
      new ProductError(
        422,
        "INVALID_DICTIONARY_VALUE",
        "Unsupported profile dictionary value.",
      );

    // Validate every supplied reference before writes, in the same transaction.
    if (
      input.specializationId != null &&
      !(await tx
        .selectFrom("specializations")
        .select("id")
        .where("id", "=", input.specializationId)
        .executeTakeFirst())
    )
      throw invalidDictionary();
    if (
      input.experienceId != null &&
      !(await tx
        .selectFrom("experience_levels")
        .select("id")
        .where("id", "=", input.experienceId)
        .executeTakeFirst())
    )
      throw invalidDictionary();
    if (input.skillIds?.length) {
      const skills = await tx
        .selectFrom("skills")
        .select("id")
        .where("id", "in", input.skillIds)
        .execute();
      if (skills.length !== input.skillIds.length) throw invalidDictionary();
    }
    if (input.goalIds?.length) {
      const goals = await tx
        .selectFrom("goals")
        .select("id")
        .where("id", "in", input.goalIds)
        .execute();
      if (goals.length !== input.goalIds.length) throw invalidDictionary();
    }

    const user = await tx
      .selectFrom("users")
      .select("id")
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user)
      throw new ProductError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    // Only mutations initialize. A failed first PATCH rolls this insert back.
    await tx
      .insertInto("profiles")
      .values({ user_id: userId, specialization_id: null, experience_id: null })
      .onConflict((conflict) => conflict.column("user_id").doNothing())
      .execute();
    // Serialize scalar patches and replacements of both join collections.
    await tx
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", userId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const current = await getProfileRow(tx, userId);
    const skillIds = input.skillIds && [...input.skillIds].sort();
    const goalIds = input.goalIds && [...input.goalIds].sort();
    const skillsChanged =
      skillIds !== undefined &&
      !equalStrings(
        skillIds,
        current.skills.map(({ skillId }) => skillId),
      );
    const goalsChanged =
      goalIds !== undefined &&
      !equalStrings(
        goalIds,
        current.goals.map(({ goalId }) => goalId),
      );
    const scalarsChanged =
      (input.displayName !== undefined &&
        input.displayName !== current.displayName) ||
      (input.bio !== undefined && input.bio !== current.bio) ||
      (input.specializationId !== undefined &&
        input.specializationId !== current.specializationId) ||
      (input.experienceId !== undefined &&
        input.experienceId !== current.experienceId) ||
      (input.discoverable !== undefined &&
        input.discoverable !== current.discoverable) ||
      (input.portfolioLinks !== undefined &&
        !equalStrings(input.portfolioLinks, current.portfolioLinks));
    if (!scalarsChanged && !skillsChanged && !goalsChanged)
      return publicProfile(current);

    await tx
      .updateTable("profiles")
      .set({
        ...(input.displayName !== undefined && {
          display_name: input.displayName,
        }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.specializationId !== undefined && {
          specialization_id: input.specializationId,
        }),
        ...(input.experienceId !== undefined && {
          experience_id: input.experienceId,
        }),
        ...(input.discoverable !== undefined && {
          discoverable: input.discoverable,
        }),
        ...(input.portfolioLinks !== undefined && {
          portfolio_links: input.portfolioLinks,
        }),
        // Read the clock after the row lock, not at transaction start: a PATCH
        // waiting for another writer must not move updated_at backwards.
        updated_at: sql<Date>`clock_timestamp()`,
      })
      .where("user_id", "=", userId)
      .execute();
    if (skillsChanged) {
      await tx
        .deleteFrom("profile_skills")
        .where("user_id", "=", userId)
        .execute();
      if (skillIds.length)
        await tx
          .insertInto("profile_skills")
          .values(
            skillIds.map((skillId) => ({ user_id: userId, skill_id: skillId })),
          )
          .execute();
    }
    if (goalsChanged) {
      await tx
        .deleteFrom("profile_goals")
        .where("user_id", "=", userId)
        .execute();
      if (goalIds.length)
        await tx
          .insertInto("profile_goals")
          .values(
            goalIds.map((goalId) => ({ user_id: userId, goal_id: goalId })),
          )
          .execute();
    }
    return publicProfile(await getProfileRow(tx, userId));
  });
}

export async function getDictionaries(db: SqlConnection) {
  const specializations = await db
    .selectFrom("specializations")
    .select(["id", "label"])
    .orderBy("id")
    .execute();
  const skills = await db
    .selectFrom("skills")
    .select(["id", "label"])
    .orderBy("id")
    .execute();
  const experienceLevels = await db
    .selectFrom("experience_levels")
    .select(["id", "label"])
    .orderBy("id")
    .execute();
  const goals = await db
    .selectFrom("goals")
    .select(["id", "label"])
    .orderBy("id")
    .execute();
  return { specializations, skills, experienceLevels, goals };
}

export async function requireCompleteProfile(
  db: SqlConnection,
  userId: string,
  options: { discovery?: boolean } = {},
) {
  const row = await getProfileRow(db, userId);
  if (!publicProfile(row).complete)
    throw new ProductError(
      409,
      "PROFILE_INCOMPLETE",
      "Complete your professional profile first.",
    );
  if (options.discovery && !row.discoverable)
    throw new ProductError(
      409,
      "DISCOVERY_DISABLED",
      "Enable discovery participation first.",
    );
  return row;
}
