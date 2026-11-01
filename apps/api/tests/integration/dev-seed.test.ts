import { afterAll, expect, test } from "bun:test";
import { createApp } from "@api/app";
import { requireDevelopmentSeedTarget } from "@api/db/dev-seed-command";
import {
  DEV_SEED_ACCOUNTS,
  DEV_SEED_PASSWORD,
  seedDevelopmentData,
} from "@api/db/dev-seed";
import { createSqlDatabase, type SqlDatabase } from "@api/db/kysely";
import { seedSqlDictionaries } from "@api/db/kysely-seed";
import { migrateDatabase } from "@api/db/migrate";
import { createAuth } from "@api/modules/identity/service";
import { getProfile } from "@api/modules/profiles/service";
import { sql } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const admin = createSqlDatabase(url);
afterAll(() => admin.destroy());

// Every test owns its randomly named schema. Cleanup never truncates/reset the
// shared test schema, and cannot touch working aster or another suite's fixtures.
async function isolated(run: (db: SqlDatabase) => Promise<void>) {
  const schema = `dev_seed_${crypto.randomUUID().replaceAll("-", "")}`;
  await sql`create schema ${sql.id(schema)}`.execute(admin);
  const scoped = new URL(url!);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const db = createSqlDatabase(scoped.toString());
  try {
    await migrateDatabase(db);
    await seedSqlDictionaries(db);
    await run(db);
  } finally {
    await db.destroy();
    await sql`drop schema ${sql.id(schema)} cascade`.execute(admin);
  }
}

async function refusedSeed(db: SqlDatabase, message: string) {
  const failure: unknown = await seedDevelopmentData(db).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain(message);
}

async function snapshot(db: SqlDatabase) {
  // JSON includes timestamps/passwords/memberships, so a repeat cannot hide
  // silent rewrites behind a stable record count.
  const result = await sql<{ snapshot: string }>`select json_build_object(
    'users', (select json_agg(r order by r.id) from users r),
    'accounts', (select json_agg(r order by r.id) from accounts r),
    'profiles', (select json_agg(r order by r.user_id) from profiles r),
    'profile_skills', (select json_agg(r order by r.user_id, r.skill_id) from profile_skills r),
    'profile_goals', (select json_agg(r order by r.user_id, r.goal_id) from profile_goals r),
    'decisions', (select json_agg(r order by r.actor_id, r.target_id) from discovery_decisions r),
    'matches', (select json_agg(r order by r.id) from matches r),
    'projects', (select json_agg(r order by r.id) from projects r),
    'project_skills', (select json_agg(r order by r.project_id, r.skill_id) from project_skills r),
    'applications', (select json_agg(r order by r.id) from applications r),
    'members', (select json_agg(r order by r.project_id, r.user_id) from project_members r),
    'conversations', (select json_agg(r order by r.id) from conversations r),
    'chat_members', (select json_agg(r order by r.conversation_id, r.user_id) from conversation_members r),
    'messages', (select json_agg(r order by r.id) from messages r),
    'markers', (select json_agg(r order by r.version, r.group_key) from dev_seed_markers r)
  )::text as snapshot`.execute(db);
  return result.rows[0]!.snapshot;
}

function http(db: SqlDatabase) {
  const origin = "http://localhost:3000";
  const auth = createAuth(db, {
    baseURL: origin,
    trustedOrigins: [origin],
    secret: "dev-seed-test-secret-at-least-32-characters",
  });
  const app = createApp(db, auth, [origin]);
  function request(path: string, cookie = "", method = "GET", body?: unknown) {
    return app.handle(
      new Request(`${origin}${path}`, {
        method,
        headers: { origin, cookie, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }
  async function login(key: string) {
    const response = await request("/api/auth/sign-in/email", "", "POST", {
      email: `${key}@aster.local.test`,
      password: DEV_SEED_PASSWORD,
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookie).not.toBe("");
    const body = (await response.json()) as { user: { id: string } };
    return { cookie, id: body.user.id };
  }
  return { request, login };
}

test("CLI accepts only exact acknowledged local development aster, never test/prod/options", () => {
  const local = "postgresql://aster:password@127.0.0.1:55432/aster";
  const ack = ["--acknowledge-local-aster=127.0.0.1:55432/aster"];
  expect(requireDevelopmentSeedTarget(local, ack, undefined).target).toBe(
    "127.0.0.1:55432/aster",
  );
  expect(
    requireDevelopmentSeedTarget(
      "postgresql://aster:x@db:5432/aster",
      ["--acknowledge-local-aster=db:5432/aster"],
      "development",
    ).target,
  ).toBe("db:5432/aster");
  for (const value of [
    undefined,
    "invalid",
    local.replace("/aster", "/aster_test"),
    local.replace("127.0.0.1", "production.example.com"),
    local.replace(":55432", ""),
    `${local}?options=-c%20search_path=private`,
    `${local}#test`,
    local.replace("aster:password", "aster_prod:password"),
    local.replace("postgresql:", "https:"),
    local.replace("/aster", "/aster_production"),
  ])
    expect(() => requireDevelopmentSeedTarget(value, ack, undefined)).toThrow();
  for (const environment of ["production", "test", "staging"])
    expect(() =>
      requireDevelopmentSeedTarget(local, ack, environment),
    ).toThrow();
  for (const args of [
    [],
    ["--acknowledge-local-aster"],
    ["--acknowledge-local-aster=localhost:55432/aster"],
    [...ack, "--reset"],
  ])
    expect(() =>
      requireDevelopmentSeedTarget(local, args, undefined),
    ).toThrow();
});

test("ordinary initialization remains empty; explicit seed has complete invariant-valid real scenarios", () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    await seedSqlDictionaries(db);
    for (const table of [
      "users",
      "accounts",
      "sessions",
      "projects",
      "applications",
      "messages",
      "dev_seed_markers",
    ] as const)
      expect(await db.selectFrom(table).selectAll().execute()).toEqual([]);
    expect((await seedDevelopmentData(db)).applied).toHaveLength(5);
    expect(await db.selectFrom("sessions").selectAll().execute()).toEqual([]);
    const users = await db.selectFrom("users").selectAll().execute();
    expect(users).toHaveLength(8);
    for (const account of DEV_SEED_ACCOUNTS) {
      const user = users.find(({ email }) => email === account.email)!;
      const profile = await getProfile(db, user.id);
      expect(profile.complete).toBe(account.complete);
      expect(profile.discoverable).toBe(account.discoverable);
    }
    const applications = await db
      .selectFrom("applications")
      .selectAll()
      .execute();
    expect(applications.map(({ state }) => state).sort()).toEqual([
      "accepted",
      "pending",
      "rejected",
      "withdrawn",
    ]);
    const members = await db
      .selectFrom("project_members")
      .selectAll()
      .execute();
    const chats = await db.selectFrom("conversations").selectAll().execute();
    const chatMembers = await db
      .selectFrom("conversation_members")
      .selectAll()
      .execute();
    for (const project of await db
      .selectFrom("projects")
      .selectAll()
      .execute()) {
      const roster = members
        .filter(({ project_id }) => project_id === project.id)
        .map(({ user_id }) => user_id)
        .sort();
      expect(roster).toContain(project.owner_id);
      const chat = chats.find(({ project_id }) => project_id === project.id)!;
      expect(
        chatMembers
          .filter(({ conversation_id }) => conversation_id === chat.id)
          .map(({ user_id }) => user_id)
          .sort(),
      ).toEqual(roster);
    }
    for (const application of applications)
      expect(
        members.some(
          ({ project_id, user_id }) =>
            project_id === application.project_id &&
            user_id === application.user_id,
        ),
      ).toBe(application.state === "accepted");
    const [match] = await db.selectFrom("matches").selectAll().execute();
    expect(match).toBeDefined();
    expect(match!.low_id < match!.high_id).toBe(true);
    expect(
      await db
        .selectFrom("discovery_decisions")
        .selectAll()
        .where("value", "=", "interested")
        .execute(),
    ).toHaveLength(2);
    const messages = await db.selectFrom("messages").selectAll().execute();
    expect(messages).toHaveLength(5);
    for (const message of messages)
      expect(
        chatMembers.some(
          ({ conversation_id, user_id }) =>
            conversation_id === message.conversation_id &&
            user_id === message.sender_id,
        ),
      ).toBe(true);
    const initial = await snapshot(db);
    expect((await seedDevelopmentData(db)).skipped).toHaveLength(5);
    expect(await snapshot(db)).toBe(initial);
  }));

test("normal sign-in and authenticated API expose seeded discovery, roles, applications and direct/team history", () =>
  isolated(async (db) => {
    await seedDevelopmentData(db);
    const { request, login } = http(db);
    const anna = await login("anna"),
      boris = await login("boris");
    for (const account of DEV_SEED_ACCOUNTS) await login(account.key);
    const discovery = await request("/api/v1/discovery", anna.cookie);
    expect(discovery.status).toBe(200);
    const candidates = (
      (await discovery.json()) as { items: { userId: string }[] }
    ).items;
    expect(candidates.map(({ userId }) => userId)).not.toContain(boris.id);
    const vera = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", "vera@aster.local.test")
      .executeTakeFirstOrThrow();
    expect(candidates.map(({ userId }) => userId)).toContain(vera.id);
    const matches = await request("/api/v1/matches", boris.cookie);
    expect(matches.status).toBe(200);
    expect(((await matches.json()) as { items: unknown[] }).items).toHaveLength(
      1,
    );
    const projects = await db.selectFrom("projects").selectAll().execute();
    expect(
      projects.map(({ recruitment_open }) => recruitment_open).sort(),
    ).toEqual([false, true]);
    const open = projects.find(({ recruitment_open }) => recruitment_open)!;
    expect(
      (await request(`/api/v1/projects/${open.id}/applications`, anna.cookie))
        .status,
    ).toBe(200);
    expect(
      (await request(`/api/v1/projects/${open.id}/applications`, boris.cookie))
        .status,
    ).toBe(404);
    for (const conversation of await db
      .selectFrom("conversations")
      .selectAll()
      .execute()) {
      const actor =
        conversation.project_id ===
        projects.find(({ recruitment_open }) => !recruitment_open)!.id
          ? await login("gleb")
          : anna;
      const response = await request(
        `/api/v1/conversations/${conversation.id}/messages`,
        actor.cookie,
      );
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { items: unknown[] }).items.length,
      ).toBeGreaterThan(0);
      expect(
        (
          await request(
            `/api/v1/conversations/${conversation.id}/messages`,
            actor.cookie,
            "POST",
            {
              requestId: crypto.randomUUID(),
              text: "Проверка обычной отправки через API.",
            },
          )
        ).status,
      ).toBe(200);
    }
  }));

test("rerun preserves user edits/passwords, changed applications, removed membership and deleted records", () =>
  isolated(async (db) => {
    await seedDevelopmentData(db);
    const { login, request } = http(db);
    const anna = await login("anna"),
      boris = await login("boris");
    const open = await db
      .selectFrom("projects")
      .select("id")
      .where("recruitment_open", "=", true)
      .executeTakeFirstOrThrow();
    expect(
      (
        await request("/api/v1/me/profile", anna.cookie, "PATCH", {
          bio: "Моя новая биография",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/v1/projects/${open.id}`, anna.cookie, "PATCH", {
          title: "Переименованный проект",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/v1/projects/${open.id}/members/me`,
          boris.cookie,
          "DELETE",
        )
      ).status,
    ).toBe(200);
    const pending = await db
      .selectFrom("applications")
      .select("id")
      .where("state", "=", "pending")
      .executeTakeFirstOrThrow();
    expect(
      (
        await request(
          `/api/v1/applications/${pending.id}/reject`,
          anna.cookie,
          "POST",
        )
      ).status,
    ).toBe(200);
    await db
      .updateTable("accounts")
      .set({ password: "user-changed-password-hash" })
      .where("user_id", "=", anna.id)
      .execute();
    await db.deleteFrom("messages").execute();
    await db
      .deleteFrom("users")
      .where("email", "=", "nina@aster.local.test")
      .execute();
    const before = await snapshot(db);
    expect((await seedDevelopmentData(db)).applied).toEqual([]);
    expect(await snapshot(db)).toBe(before);
  }));

test("concurrent runs coordinate and exactly one publishes the graph", () =>
  isolated(async (db) => {
    const reports = await Promise.all([
      seedDevelopmentData(db),
      seedDevelopmentData(db),
    ]);
    expect(reports.map(({ applied }) => applied.length).sort()).toEqual([0, 5]);
    expect(await db.selectFrom("users").selectAll().execute()).toHaveLength(8);
    expect(await db.selectFrom("matches").selectAll().execute()).toHaveLength(
      1,
    );
    expect(await db.selectFrom("projects").selectAll().execute()).toHaveLength(
      2,
    );
    expect(await db.selectFrom("messages").selectAll().execute()).toHaveLength(
      5,
    );
  }));

test("late SQL failure rolls back partial auth, collaboration and provenance; retry succeeds", () =>
  isolated(async (db) => {
    // Test-only trigger injects a late failure without adding a production fault
    // hook or weakening the seed's transaction boundary.
    await sql`create function refuse_dev_project() returns trigger language plpgsql as $$ begin raise exception 'injected seed failure'; end; $$`.execute(
      db,
    );
    await sql`create trigger refuse_dev_project before insert on projects for each row execute function refuse_dev_project()`.execute(
      db,
    );
    const initial = await snapshot(db);
    await refusedSeed(db, "injected seed failure");
    expect(await snapshot(db)).toBe(initial);
    await sql`drop trigger refuse_dev_project on projects`.execute(db);
    expect((await seedDevelopmentData(db)).applied).toHaveLength(5);
  }));

test("unrelated matching identity, partial auth and incomplete provenance are refused without adoption", () =>
  isolated(async (db) => {
    await db
      .insertInto("users")
      .values({
        id: "unrelated",
        name: "Existing user",
        email: "ANNA@ASTER.LOCAL.TEST",
        image: null,
      })
      .execute();
    const before = await snapshot(db);
    await refusedSeed(db, "identity collision");
    expect(await snapshot(db)).toBe(before);
    await db.deleteFrom("users").where("id", "=", "unrelated").execute();
    await db
      .insertInto("dev_seed_markers")
      .values({
        version: "frontend-mvp-v1",
        group_key: "accounts",
        record_id: null,
      })
      .execute();
    const incomplete = await snapshot(db);
    await refusedSeed(db, "Incomplete development seed provenance");
    expect(await snapshot(db)).toBe(incomplete);
    await db.deleteFrom("dev_seed_markers").execute();
    await seedDevelopmentData(db);
    const user = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", "anna@aster.local.test")
      .executeTakeFirstOrThrow();
    await db.deleteFrom("accounts").where("user_id", "=", user.id).execute();
    const partialAuth = await snapshot(db);
    await refusedSeed(db, "Incomplete development seed authentication");
    expect(await snapshot(db)).toBe(partialAuth);
  }));
