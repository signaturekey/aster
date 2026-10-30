import type { Database } from "@api/db/client";
import { Prisma } from "@api/generated/prisma/client";
import { ProductError } from "@api/lib/errors";
import {
  beforeCursor,
  type PageQuery,
  pageOptions,
  pageResult,
} from "@api/lib/pagination";
import { createDirectConversation } from "@api/modules/conversations/membership";
import type { DiscoveryQuery } from "@api/modules/discovery/schemas";
import {
  profileSelect,
  publicProfile,
  requireCompleteProfile,
} from "@api/modules/profiles/service";

const matchSelect = {
  id: true,
  lowId: true,
  highId: true,
  createdAt: true,
  conversation: { select: { id: true } },
} satisfies Prisma.MatchSelect;
type MatchRow = Prisma.MatchGetPayload<{ select: typeof matchSelect }>;
function publicMatch(row: MatchRow) {
  if (!row.conversation) throw new Error("Match conversation missing");
  return {
    id: row.id,
    participantIds: [row.lowId, row.highId],
    conversationId: row.conversation.id,
    createdAt: row.createdAt.toISOString(),
  };
}

// ECMAScript WhiteSpace + LineTerminator, matching String.prototype.trim().
const trimWhitespace =
  "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export async function discover(
  db: Database,
  actorId: string,
  query: DiscoveryQuery,
) {
  // Selection and hydration must observe the same eligibility/filter snapshot.
  return db.$transaction(
    async (tx) => {
      await requireCompleteProfile(tx, actorId, { discovery: true });
      const { cursor, limit } = pageOptions(query);
      const invalid = () =>
        new ProductError(
          422,
          "INVALID_DICTIONARY_VALUE",
          "Unsupported discovery filter",
        );
      if (
        query.specializationId &&
        !(await tx.specialization.count({
          where: { id: query.specializationId },
        }))
      )
        throw invalid();
      if (
        query.experienceId &&
        !(await tx.experienceLevel.count({ where: { id: query.experienceId } }))
      )
        throw invalid();
      if (
        query.skillIds &&
        (await tx.skill.count({ where: { id: { in: query.skillIds } } })) !==
          query.skillIds.length
      )
        throw invalid();
      if (
        query.goalIds &&
        (await tx.goal.count({ where: { id: { in: query.goalIds } } })) !==
          query.goalIds.length
      )
        throw invalid();
      const candidates = await tx.$queryRaw<{ userId: string }[]>(Prisma.sql`
        SELECT p."userId" FROM "Profile" p
        WHERE p."userId" <> ${actorId} AND p."discoverable" = true
          AND btrim(p."displayName", ${trimWhitespace}) <> '' AND p."specializationId" IS NOT NULL
          AND EXISTS (SELECT 1 FROM "ProfileSkill" s WHERE s."userId" = p."userId")
          AND EXISTS (SELECT 1 FROM "ProfileGoal" g WHERE g."userId" = p."userId")
          AND NOT EXISTS (SELECT 1 FROM "DiscoveryDecision" d WHERE d."actorId" = ${actorId} AND d."targetId" = p."userId")
          AND NOT EXISTS (SELECT 1 FROM "Match" m WHERE (m."lowId" = ${actorId} AND m."highId" = p."userId") OR (m."highId" = ${actorId} AND m."lowId" = p."userId"))
          ${query.specializationId ? Prisma.sql`AND p."specializationId" = ${query.specializationId}` : Prisma.empty}
          ${query.experienceId ? Prisma.sql`AND p."experienceId" = ${query.experienceId}` : Prisma.empty}
          ${
            query.skillIds?.length
              ? Prisma.join(
                  query.skillIds.map(
                    (id) =>
                      Prisma.sql`AND EXISTS (SELECT 1 FROM "ProfileSkill" s WHERE s."userId" = p."userId" AND s."skillId" = ${id})`,
                  ),
                  " ",
                )
              : Prisma.empty
          }
          ${query.goalIds?.length ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ProfileGoal" g WHERE g."userId" = p."userId" AND g."goalId" IN (${Prisma.join(query.goalIds)}))` : Prisma.empty}
          ${cursor ? Prisma.sql`AND (p."createdAt", p."userId") < (${cursor.createdAt}, ${cursor.id})` : Prisma.empty}
        ORDER BY p."createdAt" DESC, p."userId" DESC LIMIT ${limit + 1}
      `);
      const rows = await tx.profile.findMany({
        where: { userId: { in: candidates.map((row) => row.userId) } },
        select: profileSelect,
        orderBy: [{ createdAt: "desc" }, { userId: "desc" }],
      });
      const page = pageResult(rows, limit, (row) => ({
        id: row.userId,
        createdAt: row.createdAt,
      }));
      return { ...page, items: page.items.map(publicProfile) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function setDecision(
  db: Database,
  actorId: string,
  targetId: string,
  value: "interested" | "skipped",
) {
  if (actorId === targetId)
    throw new ProductError(409, "SELF_DECISION", "Cannot decide on yourself");
  const [lowId, highId] = [actorId, targetId].sort() as [string, string];
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([lowId, highId])}, 0))`;
    const existing = await tx.match.findUnique({
      where: { lowId_highId: { lowId, highId } },
      select: matchSelect,
    });
    if (existing) {
      if (value === "skipped")
        throw new ProductError(
          409,
          "ALREADY_MATCHED",
          "A match cannot be undone by a decision",
        );
      return { value, match: publicMatch(existing) };
    }
    // Stable profile row locks coordinate decisions with opt-out/profile mutations.
    await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId" IN (${lowId}, ${highId}) ORDER BY "userId" FOR UPDATE`;
    const actor = await tx.profile.findUnique({
      where: { userId: actorId },
      select: profileSelect,
    });
    const target = await tx.profile.findUnique({
      where: { userId: targetId },
      select: profileSelect,
    });
    const previous = await tx.discoveryDecision.findUnique({
      where: { actorId_targetId: { actorId, targetId } },
      select: { value: true },
    });
    const eligible =
      actor?.discoverable &&
      publicProfile(actor).complete &&
      target?.discoverable &&
      publicProfile(target).complete;
    // A lost-response retry returns its saved outcome even after participation
    // changes, but must not create a new match for ineligible participants.
    if (previous?.value === value && !eligible) return { value, match: null };
    if (!actor || !publicProfile(actor).complete)
      throw new ProductError(
        409,
        "PROFILE_INCOMPLETE",
        "Complete your professional profile first",
      );
    if (!actor.discoverable)
      throw new ProductError(
        409,
        "DISCOVERY_DISABLED",
        "Enable discovery first",
      );
    if (!target?.discoverable || !publicProfile(target).complete)
      throw new ProductError(
        404,
        "PROFILE_UNAVAILABLE",
        "Profile is unavailable for discovery",
      );
    await tx.discoveryDecision.upsert({
      where: { actorId_targetId: { actorId, targetId } },
      create: { actorId, targetId, value },
      update: { value },
    });
    const reciprocal = await tx.discoveryDecision.findUnique({
      where: { actorId_targetId: { actorId: targetId, targetId: actorId } },
    });
    if (value !== "interested" || reciprocal?.value !== "interested")
      return { value, match: null };
    const match = await tx.match.create({
      data: { lowId, highId },
      select: { id: true },
    });
    await createDirectConversation(tx, match.id, [lowId, highId]);
    const result = await tx.match.findUniqueOrThrow({
      where: { id: match.id },
      select: matchSelect,
    });
    return { value, match: publicMatch(result) };
  });
}

export async function getMatch(db: Database, actorId: string, id: string) {
  const row = await db.match.findFirst({
    where: { id, OR: [{ lowId: actorId }, { highId: actorId }] },
    select: matchSelect,
  });
  if (!row) throw new ProductError(404, "MATCH_NOT_FOUND", "Match not found");
  return publicMatch(row);
}

export async function listMatches(
  db: Database,
  actorId: string,
  query: PageQuery,
) {
  const { cursor, limit } = pageOptions(query);
  const rows = await db.match.findMany({
    where: {
      OR: [{ lowId: actorId }, { highId: actorId }],
      AND: [beforeCursor(cursor)],
    },
    select: matchSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = pageResult(rows, limit, (row) => row);
  return { ...page, items: page.items.map(publicMatch) };
}
