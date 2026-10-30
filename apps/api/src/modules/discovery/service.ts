import type { SqlConnection, SqlDatabase } from "@api/db/kysely";
import { ProductError } from "@api/lib/errors";
import { type PageQuery, pageOptions, pageResult } from "@api/lib/pagination";
import { createDirectConversation } from "@api/modules/conversations/membership";
import type { DiscoveryQuery } from "@api/modules/discovery/schemas";
import {
  getProfileRows,
  publicProfile,
  requireCompleteProfile,
} from "@api/modules/profiles/service";
import { sql } from "kysely";

function matchQuery(db: SqlConnection) {
  return db
    .selectFrom("matches as m")
    .leftJoin("conversations as c", "c.match_id", "m.id")
    .select([
      "m.id",
      "m.low_id as lowId",
      "m.high_id as highId",
      "m.created_at as createdAt",
      "c.id as conversationId",
    ]);
}

type MatchRow = Awaited<
  ReturnType<ReturnType<typeof matchQuery>["execute"]>
>[number];
function publicMatch(row: MatchRow) {
  if (!row.conversationId) throw new Error("Match conversation missing");
  return {
    id: row.id,
    participantIds: [row.lowId, row.highId],
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
  };
}

// ECMAScript WhiteSpace + LineTerminator, matching String.prototype.trim().
const trimWhitespace = "\u0009\u000a\u000b\u000c\u000d                  　﻿";

export async function discover(
  db: SqlDatabase,
  actorId: string,
  query: DiscoveryQuery,
) {
  // Candidate selection and batched hydration share one eligibility snapshot.
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
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
        !(await tx
          .selectFrom("specializations")
          .select("id")
          .where("id", "=", query.specializationId)
          .executeTakeFirst())
      )
        throw invalid();
      if (
        query.experienceId &&
        !(await tx
          .selectFrom("experience_levels")
          .select("id")
          .where("id", "=", query.experienceId)
          .executeTakeFirst())
      )
        throw invalid();
      if (query.skillIds?.length) {
        const skills = await tx
          .selectFrom("skills")
          .select("id")
          .where("id", "in", query.skillIds)
          .execute();
        if (skills.length !== query.skillIds.length) throw invalid();
      }
      if (query.goalIds?.length) {
        const goals = await tx
          .selectFrom("goals")
          .select("id")
          .where("id", "in", query.goalIds)
          .execute();
        if (goals.length !== query.goalIds.length) throw invalid();
      }
      // EXISTS avoids join multiplication: all skills, any goal, ANDed categories.
      // Bound the candidate set before loading its public profile collections.
      const candidates = await sql<{ userId: string }>`
      SELECT p.user_id AS "userId" FROM profiles p
      WHERE p.user_id <> ${actorId} AND p.discoverable = true
        AND btrim(p.display_name, ${trimWhitespace}) <> '' AND p.specialization_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM profile_skills s WHERE s.user_id = p.user_id)
        AND EXISTS (SELECT 1 FROM profile_goals g WHERE g.user_id = p.user_id)
        AND NOT EXISTS (SELECT 1 FROM discovery_decisions d WHERE d.actor_id = ${actorId} AND d.target_id = p.user_id)
        AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.low_id = ${actorId} AND m.high_id = p.user_id) OR (m.high_id = ${actorId} AND m.low_id = p.user_id))
        ${query.specializationId ? sql`AND p.specialization_id = ${query.specializationId}` : sql``}
        ${query.experienceId ? sql`AND p.experience_id = ${query.experienceId}` : sql``}
        ${
          query.skillIds?.length
            ? sql.join(
                query.skillIds.map(
                  (id) =>
                    sql`AND EXISTS (SELECT 1 FROM profile_skills s WHERE s.user_id = p.user_id AND s.skill_id = ${id})`,
                ),
                sql` `,
              )
            : sql``
        }
        ${query.goalIds?.length ? sql`AND EXISTS (SELECT 1 FROM profile_goals g WHERE g.user_id = p.user_id AND g.goal_id IN (${sql.join(query.goalIds)}))` : sql``}
        ${cursor ? sql`AND (p.created_at, p.user_id) < (${sql<Date>`${cursor.createdAt}`}, ${cursor.id})` : sql``}
      ORDER BY p.created_at DESC, p.user_id DESC LIMIT ${limit + 1}
    `.execute(tx);
      // getProfileRows preserves input order, including the database's ID collation.
      const rows = await getProfileRows(
        tx,
        candidates.rows.map((row) => row.userId),
      );
      const page = pageResult(rows, limit, (row) => ({
        id: row.userId,
        createdAt: row.createdAt,
      }));
      return { ...page, items: page.items.map(publicProfile) };
    });
}

export async function setDecision(
  db: SqlDatabase,
  actorId: string,
  targetId: string,
  value: "interested" | "skipped",
) {
  if (actorId === targetId)
    throw new ProductError(409, "SELF_DECISION", "Cannot decide on yourself");
  // C collation compares UTF-8 bytes, not locale or JavaScript UTF-16 ordering.
  const [lowId, highId] =
    Buffer.compare(Buffer.from(actorId), Buffer.from(targetId)) < 0
      ? [actorId, targetId]
      : [targetId, actorId];
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([lowId, highId])}, 0))`.execute(
      tx,
    );
    const existing = await matchQuery(tx)
      .where("m.low_id", "=", lowId)
      .where("m.high_id", "=", highId)
      .executeTakeFirst();
    if (existing) {
      if (value === "skipped")
        throw new ProductError(
          409,
          "ALREADY_MATCHED",
          "A match cannot be undone by a decision",
        );
      return { value, match: publicMatch(existing) };
    }
    // Stable locks coordinate decisions with profile mutations and opt-outs.
    await tx
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "in", [lowId, highId])
      .orderBy(sql`user_id COLLATE "C"`)
      .forUpdate()
      .execute();
    const profiles = await getProfileRows(tx, [actorId, targetId]);
    const actor = profiles.find((row) => row.userId === actorId);
    const target = profiles.find((row) => row.userId === targetId);
    const previous = await tx
      .selectFrom("discovery_decisions")
      .select("value")
      .where("actor_id", "=", actorId)
      .where("target_id", "=", targetId)
      .executeTakeFirst();
    const eligible =
      actor?.discoverable &&
      publicProfile(actor).complete &&
      target?.discoverable &&
      publicProfile(target).complete;
    // Lost-response retries retain the saved outcome after eligibility changes,
    // but cannot establish a new match between ineligible participants.
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
    await tx
      .insertInto("discovery_decisions")
      .values({ actor_id: actorId, target_id: targetId, value })
      .onConflict((conflict) =>
        conflict
          .columns(["actor_id", "target_id"])
          .doUpdateSet({ value, updated_at: sql<Date>`clock_timestamp()` })
          .where("discovery_decisions.value", "!=", value),
      )
      .execute();
    const reciprocal = await tx
      .selectFrom("discovery_decisions")
      .select("value")
      .where("actor_id", "=", targetId)
      .where("target_id", "=", actorId)
      .executeTakeFirst();
    if (value !== "interested" || reciprocal?.value !== "interested")
      return { value, match: null };
    const match = await tx
      .insertInto("matches")
      .values({ low_id: lowId, high_id: highId })
      .returning("id")
      .executeTakeFirstOrThrow();
    await createDirectConversation(tx, match.id, [lowId, highId]);
    const result = await matchQuery(tx)
      .where("m.id", "=", match.id)
      .executeTakeFirstOrThrow();
    return { value, match: publicMatch(result) };
  });
}

export async function getMatch(db: SqlDatabase, actorId: string, id: string) {
  const row = await matchQuery(db)
    .where("m.id", "=", id)
    .where((eb) =>
      eb.or([eb("m.low_id", "=", actorId), eb("m.high_id", "=", actorId)]),
    )
    .executeTakeFirst();
  if (!row) throw new ProductError(404, "MATCH_NOT_FOUND", "Match not found");
  return publicMatch(row);
}

export async function listMatches(
  db: SqlDatabase,
  actorId: string,
  query: PageQuery,
) {
  const { cursor, limit } = pageOptions(query);
  let selection = matchQuery(db).where((eb) =>
    eb.or([eb("m.low_id", "=", actorId), eb("m.high_id", "=", actorId)]),
  );
  if (cursor)
    selection = selection.where(
      sql<boolean>`(m.created_at, m.id) < (${sql<Date>`${cursor.createdAt}`}, ${cursor.id})`,
    );
  const rows = await selection
    .orderBy("m.created_at", "desc")
    .orderBy("m.id", "desc")
    .limit(limit + 1)
    .execute();
  const page = pageResult(rows, limit, (row) => row);
  return { ...page, items: page.items.map(publicMatch) };
}
