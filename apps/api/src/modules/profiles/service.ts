import type { Database } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ProductError } from "../../lib/errors";
import type { ProfilePatch, PublicProfile } from "./schemas";

// Never load User, Account, or Session relations into a public profile read.
export const profileSelect = {
  userId: true,
  displayName: true,
  bio: true,
  specializationId: true,
  experienceId: true,
  portfolioLinks: true,
  discoverable: true,
  skills: { select: { skillId: true }, orderBy: { skillId: "asc" } },
  goals: { select: { goalId: true }, orderBy: { goalId: "asc" } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProfileSelect;

type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof profileSelect }>;

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

async function ensureProfile(
  db: Database | Prisma.TransactionClient,
  userId: string,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user)
    throw new ProductError(404, "PROFILE_NOT_FOUND", "Profile not found.");

  // The unique key plus ON CONFLICT handles simultaneous first profile reads.
  // No auth-hook side effect is needed, and unknown users never gain profiles.
  await db.profile.createMany({ data: [{ userId }], skipDuplicates: true });
}

async function getProfileRow(
  db: Database | Prisma.TransactionClient,
  userId: string,
) {
  const profile = await db.profile.findUnique({
    where: { userId },
    select: profileSelect,
  });
  if (profile) return profile;

  await ensureProfile(db, userId);
  return db.profile.findUniqueOrThrow({
    where: { userId },
    select: profileSelect,
  });
}

export async function getProfile(
  db: Database | Prisma.TransactionClient,
  userId: string,
) {
  // Visibility by known ID is independent of completeness and discovery opt-in.
  return publicProfile(await getProfileRow(db, userId));
}

export async function updateProfile(
  db: Database,
  userId: string,
  input: ProfilePatch,
) {
  return db.$transaction(async (tx) => {
    const invalidDictionary = () =>
      new ProductError(
        422,
        "INVALID_DICTIONARY_VALUE",
        "Unsupported profile dictionary value.",
      );

    // Validate every supplied reference before any write, within the transaction.
    if (
      input.specializationId != null &&
      !(await tx.specialization.findUnique({
        where: { id: input.specializationId },
        select: { id: true },
      }))
    )
      throw invalidDictionary();
    if (
      input.experienceId != null &&
      !(await tx.experienceLevel.findUnique({
        where: { id: input.experienceId },
        select: { id: true },
      }))
    )
      throw invalidDictionary();
    if (
      input.skillIds !== undefined &&
      (await tx.skill.count({ where: { id: { in: input.skillIds } } })) !==
        input.skillIds.length
    )
      throw invalidDictionary();
    if (
      input.goalIds !== undefined &&
      (await tx.goal.count({ where: { id: { in: input.goalIds } } })) !==
        input.goalIds.length
    )
      throw invalidDictionary();

    await ensureProfile(tx, userId);
    // Serialize replacements of join collections with simultaneous PATCH calls.
    await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId" = ${userId} FOR UPDATE`;

    const data: Prisma.ProfileUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.specializationId !== undefined) {
      data.specialization =
        input.specializationId === null
          ? { disconnect: true }
          : { connect: { id: input.specializationId } };
    }
    if (input.experienceId !== undefined) {
      data.experience =
        input.experienceId === null
          ? { disconnect: true }
          : { connect: { id: input.experienceId } };
    }
    if (input.portfolioLinks !== undefined)
      data.portfolioLinks = input.portfolioLinks;
    if (input.discoverable !== undefined)
      data.discoverable = input.discoverable;
    if (input.skillIds !== undefined) {
      data.skills = {
        deleteMany: {},
        create: input.skillIds.map((skillId) => ({
          skill: { connect: { id: skillId } },
        })),
      };
    }
    if (input.goalIds !== undefined) {
      data.goals = {
        deleteMany: {},
        create: input.goalIds.map((goalId) => ({
          goal: { connect: { id: goalId } },
        })),
      };
    }

    // An empty PATCH is valid and does not alter an existing profile timestamp.
    const row = Object.keys(data).length
      ? await tx.profile.update({
          where: { userId },
          data,
          select: profileSelect,
        })
      : await tx.profile.findUniqueOrThrow({
          where: { userId },
          select: profileSelect,
        });
    return publicProfile(row);
  });
}

export async function getDictionaries(db: Database) {
  const [specializations, skills, experienceLevels, goals] =
    await db.$transaction([
      db.specialization.findMany({
        select: { id: true, label: true },
        orderBy: { id: "asc" },
      }),
      db.skill.findMany({
        select: { id: true, label: true },
        orderBy: { id: "asc" },
      }),
      db.experienceLevel.findMany({
        select: { id: true, label: true },
        orderBy: { id: "asc" },
      }),
      db.goal.findMany({
        select: { id: true, label: true },
        orderBy: { id: "asc" },
      }),
    ]);
  return { specializations, skills, experienceLevels, goals };
}

export async function requireCompleteProfile(
  db: Database | Prisma.TransactionClient,
  userId: string,
  options: { discovery?: boolean } = {},
) {
  const row = await getProfileRow(db, userId);
  if (!publicProfile(row).complete) {
    throw new ProductError(
      409,
      "PROFILE_INCOMPLETE",
      "Complete your professional profile first.",
    );
  }
  if (options.discovery && !row.discoverable) {
    throw new ProductError(
      409,
      "DISCOVERY_DISABLED",
      "Enable discovery participation first.",
    );
  }
  return row;
}
