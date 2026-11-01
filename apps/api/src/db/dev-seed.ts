import type { SqlDatabase, SqlTransaction } from "@api/db/kysely";
import {
  addProjectConversationMember,
  createDirectConversation,
  createProjectConversation,
} from "@api/modules/conversations/membership";
import { requireCompleteProfile } from "@api/modules/profiles/service";
import { hashPassword } from "better-auth/crypto";
import { sql } from "kysely";

export const DEV_SEED_VERSION = "frontend-mvp-v1";
// Fictional local credentials, deliberately not an environment secret. Never use
// these accounts on a shared/public installation; the CLI rejects such targets.
export const DEV_SEED_PASSWORD = "Aster-local-only-2026!";
export const DEV_SEED_ACCOUNTS = [
  {
    key: "anna",
    name: "Анна",
    specialization: "backend",
    complete: true,
    discoverable: true,
  },
  {
    key: "boris",
    name: "Борис",
    specialization: "frontend",
    complete: true,
    discoverable: true,
  },
  {
    key: "vera",
    name: "Вера",
    specialization: "design",
    complete: true,
    discoverable: true,
  },
  {
    key: "gleb",
    name: "Глеб",
    specialization: "fullstack",
    complete: true,
    discoverable: false,
  },
  {
    key: "dina",
    name: "Дина",
    specialization: "data",
    complete: true,
    discoverable: true,
  },
  {
    key: "egor",
    name: "Егор",
    specialization: "mobile",
    complete: true,
    discoverable: true,
  },
  {
    key: "nina",
    name: "Нина",
    specialization: "qa",
    complete: false,
    discoverable: false,
  },
  {
    key: "ilya",
    name: "Илья",
    specialization: "devops",
    complete: false,
    discoverable: true,
  },
].map((account) => ({ ...account, email: `${account.key}@aster.local.test` }));

const GROUPS = [
  "accounts",
  "profiles",
  "direct-history",
  "open-project",
  "closed-project",
] as const;

async function mark(
  tx: SqlTransaction,
  groupKey: string,
  recordId: string | null = null,
) {
  await tx
    .insertInto("dev_seed_markers")
    .values({
      version: DEV_SEED_VERSION,
      group_key: groupKey,
      record_id: recordId,
    })
    .execute();
}

/** Core accepts an already-scoped DB so isolated SQL tests need no CLI bypass. */
export async function seedDevelopmentData(db: SqlDatabase) {
  // Better Auth's normal scrypt implementation is intentionally expensive. Hash
  // outside the transaction/lock; a losing concurrent run discards its hashes.
  const passwords = await Promise.all(
    DEV_SEED_ACCOUNTS.map(() => hashPassword(DEV_SEED_PASSWORD)),
  );
  return db.transaction().execute(async (tx) => {
    // Serialize only this explicit workflow, including independent CLI processes.
    // Newly generated, unpublished IDs keep product writers out of our first-run
    // graph; reruns never mutate the graph, so no service lock is bypassed.
    await sql`select pg_advisory_xact_lock(1735689600, 31003)`.execute(tx);
    const markers = await tx
      .selectFrom("dev_seed_markers")
      .selectAll()
      .where("version", "=", DEV_SEED_VERSION)
      .execute();
    const provenance = new Map(
      markers.map((row) => [row.group_key, row.record_id]),
    );
    const existing = await tx
      .selectFrom("users")
      .select(["id", "email"])
      .where(
        sql<string>`lower(email)`,
        "in",
        DEV_SEED_ACCOUNTS.map(({ email }) => email),
      )
      .execute();
    for (const account of DEV_SEED_ACCOUNTS) {
      const occupied = existing.filter(
        ({ email }) => email.toLowerCase() === account.email,
      );
      if (
        occupied.some(
          ({ id }) => id !== provenance.get(`account:${account.key}`),
        )
      )
        throw new Error(
          `Development seed identity collision: ${account.email}; no records changed`,
        );
    }
    if (markers.length) {
      // Atomic creation means an incomplete ledger is not resumable ownership.
      // Never infer provenance from an email, or repair missing auth/content.
      if (
        !provenance.has("complete") ||
        GROUPS.some((key) => !provenance.has(key)) ||
        DEV_SEED_ACCOUNTS.some(({ key }) => !provenance.get(`account:${key}`))
      )
        throw new Error(
          "Incomplete development seed provenance; refusing repair/adoption",
        );
      const ownedIds = DEV_SEED_ACCOUNTS.map(({ key }) =>
        provenance.get(`account:${key}`)!,
      );
      const live = await tx
        .selectFrom("users")
        .select("id")
        .where("id", "in", ownedIds)
        .execute();
      const credentials = await tx
        .selectFrom("accounts")
        .select(["user_id", "account_id", "password"])
        .where("user_id", "in", ownedIds)
        .where("provider_id", "=", "credential")
        .execute();
      // Deleted users stay deleted. A live user with partial/ambiguous auth is a
      // conflict, not permission to regenerate a password or adopt another row.
      if (
        live.some(({ id }) => {
          const rows = credentials.filter(({ user_id }) => user_id === id);
          return (
            rows.length !== 1 ||
            rows[0]?.account_id !== id ||
            !rows[0]?.password
          );
        })
      )
        throw new Error(
          "Incomplete development seed authentication; refusing repair/adoption",
        );
      return {
        version: DEV_SEED_VERSION,
        applied: [] as string[],
        skipped: [...GROUPS],
        notice:
          "Previously applied groups left untouched, including edits, passwords, removed members and deleted records.",
      };
    }

    // Public write services own db.transaction() and cannot nest inside this
    // all-or-nothing seed. Insert only a new graph, retain DB defaults/constraints,
    // reuse transaction-aware profile checks and conversation membership helpers.
    // No sign-up API is called: that would commit partial auth and create sessions.
    const ids = new Map<string, string>();
    for (const [index, account] of DEV_SEED_ACCOUNTS.entries()) {
      const id = crypto.randomUUID();
      ids.set(account.key, id);
      await tx
        .insertInto("users")
        .values({ id, name: account.name, email: account.email, image: null })
        .execute();
      await tx
        .insertInto("accounts")
        .values({
          id: crypto.randomUUID(),
          account_id: id,
          provider_id: "credential",
          user_id: id,
          password: passwords[index]!,
          access_token: null,
          refresh_token: null,
          id_token: null,
          access_token_expires_at: null,
          refresh_token_expires_at: null,
          scope: null,
        })
        .execute();
      await mark(tx, `account:${account.key}`, id);
      await tx
        .insertInto("profiles")
        .values({
          user_id: id,
          display_name: account.name,
          bio: account.complete
            ? "Ищу команду для полезного проекта и обмена опытом."
            : "Заполняю профиль.",
          specialization_id: account.complete ? account.specialization : null,
          experience_id: account.complete ? "middle" : null,
          discoverable: account.discoverable,
        })
        .execute();
      if (account.complete) {
        await tx
          .insertInto("profile_skills")
          .values({
            user_id: id,
            skill_id: account.key === "vera" ? "figma" : "typescript",
          })
          .execute();
        await tx
          .insertInto("profile_goals")
          .values({ user_id: id, goal_id: "side-project" })
          .execute();
        await requireCompleteProfile(tx, id);
      }
    }
    const user = (key: string) => {
      const id = ids.get(key);
      if (!id) throw new Error("Unknown development scenario actor");
      return id;
    };
    await mark(tx, "accounts");
    await mark(tx, "profiles");

    const anna = user("anna"),
      boris = user("boris");
    await requireCompleteProfile(tx, anna, { discovery: true });
    await requireCompleteProfile(tx, boris, { discovery: true });
    // Match invariant: both eligible actors express interest; canonical pair uses
    // JS ordering like the service / SQL COLLATE C, never localeCompare().
    await tx
      .insertInto("discovery_decisions")
      .values([
        { actor_id: anna, target_id: boris, value: "interested" },
        { actor_id: boris, target_id: anna, value: "interested" },
      ])
      .execute();
    const [low, high] = [anna, boris].sort() as [string, string];
    const match = await tx
      .insertInto("matches")
      .values({ low_id: low, high_id: high })
      .returning("id")
      .executeTakeFirstOrThrow();
    const direct = await createDirectConversation(tx, match.id, [anna, boris]);
    await tx
      .insertInto("messages")
      .values([
        {
          conversation_id: direct.id,
          sender_id: anna,
          request_id: crypto.randomUUID(),
          text: "Привет! Давай обсудим идею совместного проекта.",
        },
        {
          conversation_id: direct.id,
          sender_id: boris,
          request_id: crypto.randomUUID(),
          text: "Привет! Я могу помочь с интерфейсом. Когда удобно созвониться?",
        },
      ])
      .execute();
    await mark(tx, "direct-history", direct.id);

    for (const open of [true, false]) {
      const owner = open ? anna : user("gleb");
      await requireCompleteProfile(tx, owner);
      const project = await tx
        .insertInto("projects")
        .values({
          title: open
            ? "Карта городских инициатив"
            : "Архив хакатона: Добрый город",
          description: open
            ? "Собираем небольшую команду: поможем соседям находить локальные инициативы."
            : "Прототип завершён. Команда сохраняет результаты и обсуждает следующие шаги.",
          owner_id: owner,
          goal_id: "side-project",
          required_roles: ["Разработчик", "Дизайнер"],
          recruitment_open: open,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      // The deferred owner-is-member FK must hold at commit. Owner membership
      // and team conversation are atomic, as in createProject().
      await tx
        .insertInto("project_members")
        .values({ project_id: project.id, user_id: owner })
        .execute();
      await tx
        .insertInto("project_skills")
        .values({ project_id: project.id, skill_id: "typescript" })
        .execute();
      const conversation = await createProjectConversation(
        tx,
        project.id,
        owner,
      );
      if (open) {
        // Each applicant is complete and not initially a member/owner. Acceptance
        // adds BOTH memberships; terminal rejected/withdrawn rows add neither.
        for (const [key, state] of [
          ["boris", "accepted"],
          ["vera", "pending"],
          ["dina", "rejected"],
          ["egor", "withdrawn"],
        ] as const) {
          const applicant = user(key);
          await requireCompleteProfile(tx, applicant);
          await tx
            .insertInto("applications")
            .values({
              project_id: project.id,
              user_id: applicant,
              text: "Хочу помочь команде своим опытом и обсудить задачи.",
              state,
            })
            .execute();
          if (state === "accepted") {
            await tx
              .insertInto("project_members")
              .values({ project_id: project.id, user_id: applicant })
              .execute();
            await addProjectConversationMember(tx, project.id, applicant);
          }
        }
      }
      // Every sender has current conversation membership. Client request IDs
      // obey the same per-conversation/sender idempotency key as HTTP writes.
      await tx
        .insertInto("messages")
        .values([
          {
            conversation_id: conversation.id,
            sender_id: owner,
            request_id: crypto.randomUUID(),
            text: open
              ? "Добро пожаловать! Здесь обсудим первые задачи команды."
              : "Спасибо за работу! Набор закрыт, результаты сохранены.",
          },
          ...(open
            ? [
                {
                  conversation_id: conversation.id,
                  sender_id: boris,
                  request_id: crypto.randomUUID(),
                  text: "Я в команде. Начну с макета главной страницы.",
                },
              ]
            : []),
        ])
        .execute();
      await mark(tx, open ? "open-project" : "closed-project", project.id);
    }
    await mark(tx, "complete");
    return {
      version: DEV_SEED_VERSION,
      applied: [...GROUPS],
      skipped: [] as string[],
      notice: "Fictional local data inserted atomically; no sessions created.",
    };
  });
}
