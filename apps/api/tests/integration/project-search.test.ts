import { afterAll, beforeAll, expect, test } from "bun:test";
import { createApp } from "@api/app";
import { createSqlDatabase } from "@api/db/kysely";
import { seedSqlDictionaries } from "@api/db/kysely-seed";
import { migrateDatabase } from "@api/db/migrate";
import { createAuth } from "@api/modules/identity/service";
import type { PublicProject } from "@api/modules/projects/schemas";
import { createProject, listProjects } from "@api/modules/projects/service";
import { sql } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");

// A private schema keeps catalogue assertions independent of other fixtures and
// confines cleanup to records created by this suite in the disposable test DB.
const schema = `search_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
const scopedUrl = new URL(url);
scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scopedUrl.toString());
const origin = "http://localhost:3000";
let app: ReturnType<typeof createApp>;
let cookie: string;
let owner: string;
const matches: PublicProject[] = [];
const literals: Record<string, PublicProject> = {};
let boundary: PublicProject;

function request(path: string, authenticated = true) {
  return app.handle(
    new Request(`${origin}${path}`, {
      headers: authenticated ? { cookie } : {},
    }),
  );
}
async function catalogue(params: Record<string, string> = {}) {
  const response = await request(
    `/api/v1/projects?${new URLSearchParams(params)}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    items: PublicProject[];
    nextCursor: string | null;
  };
}
function create(title: string, description: string, goalId = "startup") {
  return createProject(db, owner, {
    title,
    description,
    goalId,
    requiredRoles: ["Engineer"],
    requiredSkillIds: ["typescript"],
  });
}

beforeAll(async () => {
  await sql`create schema ${sql.id(schema)}`.execute(admin);
  await migrateDatabase(db);
  await seedSqlDictionaries(db);
  // Better Auth introspects on initialization, so create it only after migrations.
  const auth = createAuth(db, {
    baseURL: origin,
    secret: "search-integration-secret-at-least-32-characters",
    trustedOrigins: [origin],
  });
  app = createApp(db, auth, [origin]);
  const registration = await app.handle(
    new Request(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        email: `${crypto.randomUUID()}@example.test`,
        password: "search-integration-password-123",
        name: "Private account name",
      }),
    }),
  );
  expect(registration.status).toBe(200);
  cookie = registration.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  owner = ((await registration.json()) as { user: { id: string } }).user.id;
  await db
    .insertInto("profiles")
    .values({
      user_id: owner,
      display_name: "Engineer",
      specialization_id: "backend",
    })
    .execute();
  await db
    .insertInto("profile_skills")
    .values({ user_id: owner, skill_id: "typescript" })
    .execute();
  await db
    .insertInto("profile_goals")
    .values({ user_id: owner, goal_id: "startup" })
    .execute();

  for (let i = 0; i < 6; i++) {
    const project = await create(
      i % 2 ? "Different title" : "Build NeEdLe together",
      i % 2 ? "Description contains nEeDlE here" : "Different description",
      i === 5 ? "hackathon" : "startup",
    );
    matches.push(project);
    await db
      .updateTable("projects")
      .set({
        created_at: new Date("2025-01-01T00:00:00.000Z"),
        recruitment_open: i !== 0,
      })
      .where("id", "=", project.id)
      .execute();
  }
  for (const text of ["%", "_", "\\", "%_\\", "' OR true --"])
    literals[text] = await create(
      `Literal ${text} title`,
      `Literal ${text} description`,
    );
  await create("Decoy Xword", "Decoy ordinary words");
  boundary = await create("Long description", "x".repeat(200));
  // More than one default unfiltered page sits ahead of every needle match.
  for (let i = 0; i < 22; i++)
    await create(`Newer unrelated ${i}`, "No matching text");
});

afterAll(async () => {
  await db.destroy();
  await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});

test("search filters before pagination and traverses tied timestamps by descending ID", async () => {
  const unfiltered = await catalogue();
  expect(unfiltered.items).toHaveLength(20);
  expect(
    unfiltered.items.some(({ id }) => matches.some((m) => m.id === id)),
  ).toBe(false);
  const expected = matches
    .map(({ id }) => id)
    .sort()
    .reverse();
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await catalogue({
      q: " \tNEEDLE\n ",
      limit: "2",
      ...(cursor ? { cursor } : {}),
    });
    seen.push(...page.items.map(({ id }) => id));
    cursor = page.nextCursor;
    if (cursor) expect(page.items).toHaveLength(2);
    expect(seen.length).toBeLessThanOrEqual(expected.length);
  } while (cursor);
  expect(seen).toEqual(expected);
  expect(new Set(seen).size).toBe(expected.length);
});

test("goal is ANDed with the entire title-or-description condition", async () => {
  const page = await catalogue({ q: "needle", goalId: "startup" });
  expect(page.items.map(({ id }) => id)).toEqual(
    matches
      .slice(0, 5)
      .map(({ id }) => id)
      .sort()
      .reverse(),
  );
  expect(page.items.some(({ recruitmentOpen }) => !recruitmentOpen)).toBe(true);
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const filtered = await catalogue({
      q: "needle",
      goalId: "startup",
      limit: "2",
      ...(cursor ? { cursor } : {}),
    });
    seen.push(...filtered.items.map(({ id }) => id));
    cursor = filtered.nextCursor;
    expect(seen.length).toBeLessThanOrEqual(5);
  } while (cursor);
  expect(seen).toEqual(page.items.map(({ id }) => id));
  const hackathon = await catalogue({ goalId: "hackathon" });
  expect(hackathon.items.map(({ id }) => id)).toEqual([matches[5]!.id]);
  expect((await catalogue({ q: "absent", goalId: "startup" })).items).toEqual(
    [],
  );
});

test("percent underscore backslash and SQL-looking text are literal bound values", async () => {
  for (const text of ["%", "_", "\\", "%_\\", "' OR true --"]) {
    const page = await catalogue({ q: text });
    const expected = Object.entries(literals)
      .filter(([literal]) => literal.includes(text))
      .map(([, project]) => project.id)
      .sort();
    expect(page.items.map(({ id }) => id).sort()).toEqual(expected);
  }
});

test("blank means absent, trimmed nonblank text searches, and the 200-character boundary works", async () => {
  const absent = await catalogue({ limit: "50" });
  for (const q of ["", " \t\n "])
    expect(await catalogue({ q, limit: "50" })).toEqual(absent);
  expect(await catalogue({ q: " \t ", goalId: "hackathon" })).toEqual(
    await catalogue({ goalId: "hackathon" }),
  );
  expect(
    (await catalogue({ q: "x".repeat(200) })).items.map(({ id }) => id),
  ).toEqual([boundary.id]);
  const rows = await db
    .selectFrom("projects")
    .select(["id", "created_at"])
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
  expect(absent.items.map(({ id }) => id)).toEqual(rows.map(({ id }) => id));
});

test("unknown goals use dictionary errors even when text has no matches", async () => {
  for (const params of [
    { goalId: "unknown" },
    { goalId: "unknown", q: "absent" },
    { goalId: "startup,hackathon" },
  ]) {
    const response = await request(
      `/api/v1/projects?${new URLSearchParams(params)}`,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_DICTIONARY_VALUE" },
    });
  }
  expect(listProjects(db, { goalId: "unknown" })).rejects.toMatchObject({
    status: 422,
    code: "INVALID_DICTIONARY_VALUE",
  });
});

test("HTTP schema rejects invalid filters and preserves authentication and cursor errors", async () => {
  for (const params of [
    { q: "x".repeat(201) },
    { q: " ".repeat(201) },
    { q: "bad\u0000text" },
    { goalId: "" },
    { goalId: "x".repeat(81) },
    { goalId: "bad\u0000goal" },
    { limit: "0" },
    { limit: "51" },
  ]) {
    const response = await request(
      `/api/v1/projects?${new URLSearchParams(params)}`,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  }
  for (const query of ["goalId=startup&goalId=hackathon", "q=one&q=two"])
    expect((await request(`/api/v1/projects?${query}`)).status).toBe(422);
  const invalidCursor = await request("/api/v1/projects?q=needle&cursor=bad");
  expect(invalidCursor.status).toBe(422);
  expect(await invalidCursor.json()).toMatchObject({
    error: { code: "INVALID_CURSOR" },
  });
  expect((await request("/api/v1/projects?q=needle", false)).status).toBe(401);
});
