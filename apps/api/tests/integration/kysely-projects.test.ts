import { afterAll, beforeAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { seedSqlDictionaries } from "@api/db/kysely-seed";
import { migrateDatabase } from "@api/db/migrate";
import {
  listApplications,
  submitApplication,
  transitionApplication,
} from "@api/modules/projects/kysely-applications";
import {
  removeMember,
  transferOwnership,
} from "@api/modules/projects/kysely-membership";
import {
  createProject,
  getProject,
  listMembers,
  listProjects,
  updateProject,
} from "@api/modules/projects/kysely-service";
import {
  applicationSchema,
  memberSchema,
  projectSchema,
} from "@api/modules/projects/schemas";
import { TypeCompiler } from "elysia/type-system";
import { sql, type KyselyPlugin, type RootOperationNode } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `projects_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
const scopedUrl = new URL(url);
scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scopedUrl.toString());
beforeAll(async () => {
  await sql`create schema ${sql.id(schema)}`.execute(admin);
  await migrateDatabase(db);
  await seedSqlDictionaries(db);
});
afterAll(async () => {
  await db.destroy();
  await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});

const input = {
  title: "Aster project",
  description: "Find collaborators",
  goalId: "startup",
  requiredRoles: ["backend", "design"],
  requiredSkillIds: ["typescript", "sql"],
};
async function user(complete = true) {
  const id = crypto.randomUUID();
  await db
    .insertInto("users")
    .values({
      id,
      name: "Private name",
      email: `${id}@example.test`,
      image: "https://example.test/private",
    })
    .execute();
  if (complete) {
    await db
      .insertInto("profiles")
      .values({
        user_id: id,
        display_name: "Engineer",
        specialization_id: "backend",
        experience_id: null,
      })
      .execute();
    await db
      .insertInto("profile_skills")
      .values({ user_id: id, skill_id: "typescript" })
      .execute();
    await db
      .insertInto("profile_goals")
      .values({ user_id: id, goal_id: "startup" })
      .execute();
  }
  return id;
}
async function fixture() {
  const owner = await user();
  const applicant = await user();
  const project = await createProject(db, owner, input);
  const application = await submitApplication(
    db,
    applicant,
    project.id,
    "Private application",
  );
  return { owner, applicant, project, application };
}
async function expectError(
  operation: Promise<unknown>,
  status: number,
  code: string,
) {
  try {
    await operation;
  } catch (error) {
    expect(error).toMatchObject({ status, code });
    return;
  }
  throw new Error(`Expected ${code}`);
}
async function conversation(projectId: string) {
  return db
    .selectFrom("conversations")
    .select("id")
    .where("project_id", "=", projectId)
    .executeTakeFirstOrThrow();
}
async function memberships(projectId: string, userId: string) {
  const chat = await conversation(projectId);
  return [
    (
      await db
        .selectFrom("project_members")
        .select("user_id")
        .where("project_id", "=", projectId)
        .where("user_id", "=", userId)
        .execute()
    ).length,
    (
      await db
        .selectFrom("conversation_members")
        .select("user_id")
        .where("conversation_id", "=", chat.id)
        .where("user_id", "=", userId)
        .execute()
    ).length,
  ];
}
function observe(onQuery: (node: RootOperationNode) => void): KyselyPlugin {
  return {
    transformQuery({ node }) {
      onQuery(node);
      return node;
    },
    async transformResult({ result }) {
      return result;
    },
  };
}
function isLock(node: RootOperationNode) {
  return (
    node.kind === "SelectQueryNode" &&
    node.endModifiers?.some((modifier) => modifier.modifier === "ForUpdate") ===
      true
  );
}
// Pause only after PostgreSQL executed the selected query. Other connections can
// commit while a repeatable-read snapshot or transaction row lock is held.
function pauseAfter(matches: (node: RootOperationNode) => boolean) {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const selected = new WeakSet<object>();
  let once = false;
  const plugin: KyselyPlugin = {
    transformQuery({ node, queryId }) {
      if (!once && matches(node)) {
        once = true;
        selected.add(queryId);
      }
      return node;
    },
    async transformResult({ result, queryId }) {
      if (selected.has(queryId)) {
        reached.resolve();
        await release.promise;
      }
      return result;
    },
  };
  return {
    reached: reached.promise,
    release: () => release.resolve(),
    db: db.withPlugin(plugin),
  };
}

// Request validation remains in the unchanged route/schema boundary. These
// staged tests exercise real SQL services without starting the old runtime.
test("Kysely project creation atomically establishes owner, chat and public defaults", async () => {
  const incomplete = await user(false);
  await expectError(
    createProject(db, incomplete, input),
    409,
    "PROFILE_INCOMPLETE",
  );
  expect(
    await db
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "=", incomplete)
      .execute(),
  ).toEqual([]);
  const owner = await user();
  const failing = db.withPlugin(
    observe((node) => {
      if (
        node.kind === "InsertQueryNode" &&
        node.into?.table.identifier.name === "conversation_members"
      )
        throw new Error("Injected chat failure");
    }),
  );
  let failure: unknown;
  try {
    await createProject(failing, owner, input);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(await listProjects(db, {}, owner)).toEqual({
    items: [],
    nextCursor: null,
  });
  expect(await db.selectFrom("conversations").select("id").execute()).toEqual(
    [],
  );
  const project = await createProject(db, owner, input);
  expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(project).toMatchObject({
    ...input,
    requiredSkillIds: ["sql", "typescript"],
    ownerId: owner,
    recruitmentOpen: true,
  });
  expect(TypeCompiler.Compile(projectSchema).Check(project)).toBe(true);
  expect(project.updatedAt).toBe(project.createdAt);
  expect(await getProject(db, project.id)).toEqual(project);
  expect(await memberships(project.id, owner)).toEqual([1, 1]);
  const roster = await listMembers(db, project.id, {});
  expect(roster.items).toHaveLength(1);
  expect(roster.items[0]).toMatchObject({
    userId: owner,
    role: "owner",
    profile: { complete: true, discoverable: false },
  });
  expect(TypeCompiler.Compile(memberSchema).Check(roster.items[0])).toBe(true);
  expect(JSON.stringify(roster)).not.toContain("@example.test");
  expect(JSON.stringify(roster)).not.toContain("Private name");
  await expectError(getProject(db, "missing"), 404, "PROJECT_NOT_FOUND");
});

test("Kysely project edits validate atomically and preserve empty/same PATCH timestamps", async () => {
  const { owner, applicant, project, application } = await fixture();
  const old = new Date("2020-01-01T00:00:00.000Z");
  await db
    .updateTable("projects")
    .set({ updated_at: old })
    .where("id", "=", project.id)
    .execute();
  const queries: RootOperationNode[] = [];
  const observed = db.withPlugin(observe((node) => queries.push(node)));
  for (const patch of [
    {},
    input,
    { requiredSkillIds: ["sql", "typescript"], recruitmentOpen: true },
  ])
    expect(
      (await updateProject(observed, owner, project.id, patch)).updatedAt,
    ).toBe(old.toISOString());
  expect(
    queries.some((node) =>
      ["UpdateQueryNode", "DeleteQueryNode", "InsertQueryNode"].includes(
        node.kind,
      ),
    ),
  ).toBe(false);
  await expectError(
    updateProject(db, applicant, project.id, { title: "Unauthorized" }),
    403,
    "OWNER_REQUIRED",
  );
  for (const patch of [
    { goalId: "unknown" },
    { requiredSkillIds: ["sql", "unknown"] },
    { requiredSkillIds: ["sql", "sql"] },
  ])
    await expectError(
      updateProject(db, owner, project.id, {
        title: "Must roll back",
        ...patch,
      }),
      422,
      "INVALID_DICTIONARY_VALUE",
    );
  expect((await getProject(db, project.id)).title).toBe(input.title);
  expect((await getProject(db, project.id)).updatedAt).toBe(old.toISOString());
  const changed = await updateProject(db, owner, project.id, {
    requiredSkillIds: [],
    requiredRoles: ["design"],
    recruitmentOpen: false,
  });
  expect(changed.updatedAt > old.toISOString()).toBe(true);
  expect(changed.requiredSkillIds).toEqual([]);
  await expectError(
    transitionApplication(db, owner, application.id, "accepted"),
    409,
    "RECRUITMENT_CLOSED",
  );
  await expectError(
    submitApplication(db, await user(), project.id, "New"),
    409,
    "RECRUITMENT_CLOSED",
  );
  expect(await memberships(project.id, owner)).toEqual([1, 1]);
  await updateProject(db, owner, project.id, { recruitmentOpen: true });
  await transitionApplication(db, owner, application.id, "accepted");
  expect(await memberships(project.id, applicant)).toEqual([1, 1]);
});

test("Kysely applications are private, independent and permit resubmission after terminal outcomes", async () => {
  const { owner, applicant, project, application } = await fixture();
  const outsider = await user();
  const second = await createProject(db, owner, input);
  const independent = await submitApplication(
    db,
    applicant,
    second.id,
    "Independent",
  );
  expect(TypeCompiler.Compile(applicationSchema).Check(application)).toBe(true);
  expect(application.updatedAt).toBe(application.createdAt);
  expect((await listApplications(db, applicant, {})).items).toHaveLength(2);
  await expectError(
    listApplications(db, applicant, {}, project.id),
    404,
    "APPLICATION_NOT_FOUND",
  );
  for (const outcome of ["accepted", "rejected", "withdrawn"] as const)
    await expectError(
      transitionApplication(db, outsider, application.id, outcome),
      404,
      "APPLICATION_NOT_FOUND",
    );
  await expectError(
    transitionApplication(db, applicant, application.id, "accepted"),
    403,
    "OWNER_REQUIRED",
  );
  await expectError(
    transitionApplication(db, owner, application.id, "withdrawn"),
    404,
    "APPLICATION_NOT_FOUND",
  );
  await expectError(
    submitApplication(db, owner, project.id, "Owner"),
    409,
    "ALREADY_MEMBER",
  );
  await expectError(
    submitApplication(db, await user(false), project.id, "Incomplete"),
    409,
    "PROFILE_INCOMPLETE",
  );
  const withdrawn = await transitionApplication(
    db,
    applicant,
    application.id,
    "withdrawn",
  );
  expect(
    await transitionApplication(db, applicant, application.id, "withdrawn"),
  ).toEqual(withdrawn);
  await expectError(
    transitionApplication(db, owner, application.id, "accepted"),
    409,
    "APPLICATION_DECIDED",
  );
  const resubmitted = await submitApplication(
    db,
    applicant,
    project.id,
    "Again",
  );
  const rejected = await transitionApplication(
    db,
    owner,
    resubmitted.id,
    "rejected",
  );
  expect(
    await transitionApplication(db, owner, resubmitted.id, "rejected"),
  ).toEqual(rejected);
  expect(
    (await listApplications(db, owner, {}, project.id)).items,
  ).toHaveLength(2);
  expect(
    (await listApplications(db, applicant, {})).items.find(
      ({ id }) => id === independent.id,
    )?.state,
  ).toBe("pending");
});

test("Kysely duplicate application and acceptance races persist one outcome and both memberships", async () => {
  const owner = await user(),
    applicant = await user();
  const project = await createProject(db, owner, input);
  const submissions = await Promise.allSettled([
    submitApplication(db, applicant, project.id, "One"),
    submitApplication(db, applicant, project.id, "Two"),
  ]);
  expect(
    submissions.filter(({ status }) => status === "fulfilled"),
  ).toHaveLength(1);
  const loser = submissions.find(({ status }) => status === "rejected");
  if (loser?.status !== "rejected")
    throw new Error("Expected duplicate failure");
  expect(loser.reason).toMatchObject({
    status: 409,
    code: "APPLICATION_PENDING",
  });
  const application = (await listApplications(db, owner, {}, project.id))
    .items[0];
  if (!application) throw new Error("Expected application");
  const accepted = await Promise.all([
    transitionApplication(db, owner, application.id, "accepted"),
    transitionApplication(db, owner, application.id, "accepted"),
  ]);
  expect(accepted[0]).toEqual(accepted[1]);
  expect(await memberships(project.id, applicant)).toEqual([1, 1]);
  const competing = await fixture();
  const decisions = await Promise.allSettled([
    transitionApplication(
      db,
      competing.owner,
      competing.application.id,
      "accepted",
    ),
    transitionApplication(
      db,
      competing.owner,
      competing.application.id,
      "rejected",
    ),
  ]);
  expect(decisions.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const stored = (
    await listApplications(db, competing.owner, {}, competing.project.id)
  ).items[0];
  expect(await memberships(competing.project.id, competing.applicant)).toEqual(
    stored?.state === "accepted" ? [1, 1] : [0, 0],
  );
});

test("Kysely acceptance rolls back all dependent rows on chat failure", async () => {
  const { owner, applicant, project, application } = await fixture();
  const failing = db.withPlugin(
    observe((node) => {
      if (
        node.kind === "InsertQueryNode" &&
        node.into?.table.identifier.name === "conversation_members"
      )
        throw new Error("Injected acceptance failure");
    }),
  );
  let failure: unknown;
  try {
    await transitionApplication(failing, owner, application.id, "accepted");
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(await memberships(project.id, applicant)).toEqual([0, 0]);
  expect((await listApplications(db, owner, {}, project.id)).items[0]).toEqual(
    application,
  );
});

test("Kysely recruitment closure and acceptance serialize in both lock orders", async () => {
  for (const closeFirst of [true, false]) {
    const { owner, applicant, project, application } = await fixture();
    const gate = pauseAfter(isLock);
    const first = closeFirst
      ? updateProject(gate.db, owner, project.id, { recruitmentOpen: false })
      : transitionApplication(gate.db, owner, application.id, "accepted");
    await gate.reached;
    const secondStarted = Promise.withResolvers<void>();
    const secondDb = db.withPlugin(
      observe((node) => {
        if (isLock(node)) secondStarted.resolve();
      }),
    );
    const second = closeFirst
      ? transitionApplication(secondDb, owner, application.id, "accepted")
      : updateProject(secondDb, owner, project.id, { recruitmentOpen: false });
    const results = Promise.allSettled([first, second]);
    try {
      await secondStarted.promise;
    } finally {
      gate.release();
    }
    const settled = await results;
    expect(settled[0]?.status).toBe("fulfilled");
    if (closeFirst) {
      expect(settled[1]).toMatchObject({
        status: "rejected",
        reason: { code: "RECRUITMENT_CLOSED" },
      });
      expect(await memberships(project.id, applicant)).toEqual([0, 0]);
      expect(
        (await listApplications(db, owner, {}, project.id)).items[0]?.state,
      ).toBe("pending");
    } else {
      expect(settled[1]?.status).toBe("fulfilled");
      expect(await memberships(project.id, applicant)).toEqual([1, 1]);
      expect(
        (await listApplications(db, owner, {}, project.id)).items[0]?.state,
      ).toBe("accepted");
    }
    expect((await getProject(db, project.id)).recruitmentOpen).toBe(false);
  }
});

test("Kysely transfers authorize current owners and accepted retries never restore departed members", async () => {
  const { owner, applicant, project, application } = await fixture();
  await transitionApplication(db, owner, application.id, "accepted");
  const successor = await user();
  const successorApplication = await submitApplication(
    db,
    successor,
    project.id,
    "Successor",
  );
  await transitionApplication(db, owner, successorApplication.id, "accepted");
  await expectError(
    removeMember(db, owner, project.id, owner, true),
    409,
    "OWNER_CANNOT_LEAVE",
  );
  await expectError(
    transferOwnership(db, owner, project.id, await user()),
    409,
    "MEMBER_REQUIRED",
  );
  const before = await getProject(db, project.id);
  expect(await transferOwnership(db, owner, project.id, owner)).toEqual(before);
  const transfers = await Promise.allSettled([
    transferOwnership(db, owner, project.id, applicant),
    transferOwnership(db, owner, project.id, successor),
  ]);
  expect(transfers.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  const currentOwner = (await getProject(db, project.id)).ownerId;
  const departed = currentOwner === applicant ? successor : applicant;
  const decidedId =
    departed === applicant ? application.id : successorApplication.id;
  await expectError(
    removeMember(db, departed, project.id, owner),
    403,
    "OWNER_REQUIRED",
  );
  await expectError(
    removeMember(db, departed, project.id, owner, true),
    403,
    "FORBIDDEN",
  );
  await removeMember(db, departed, project.id, departed, true);
  expect(await memberships(project.id, departed)).toEqual([0, 0]);
  await expectError(
    transitionApplication(db, owner, decidedId, "accepted"),
    404,
    "APPLICATION_NOT_FOUND",
  );
  await expectError(
    listApplications(db, owner, {}, project.id),
    404,
    "APPLICATION_NOT_FOUND",
  );
  const stored = (await listApplications(db, departed, {})).items.find(
    ({ id }) => id === decidedId,
  );
  if (!stored) throw new Error("Expected decided application");
  expect(
    await transitionApplication(db, currentOwner, decidedId, "accepted"),
  ).toEqual(stored);
  expect(await memberships(project.id, departed)).toEqual([0, 0]);
  await expectError(
    removeMember(db, currentOwner, project.id, departed),
    404,
    "MEMBER_NOT_FOUND",
  );
  const again = await submitApplication(db, departed, project.id, "Rejoin");
  await transitionApplication(db, currentOwner, again.id, "accepted");
  expect(await memberships(project.id, departed)).toEqual([1, 1]);
});

test("Kysely roster hydration retains a repeatable-read ownership/membership snapshot", async () => {
  const { owner, applicant, project, application } = await fixture();
  await transitionApplication(db, owner, application.id, "accepted");
  const gate = pauseAfter(
    (node) =>
      node.kind === "SelectQueryNode" &&
      JSON.stringify(node).includes('"name":"projects"'),
  );
  const reading = listMembers(gate.db, project.id, {});
  await gate.reached;
  try {
    await transferOwnership(db, owner, project.id, applicant);
    await removeMember(db, owner, project.id, owner, true);
  } finally {
    gate.release();
  }
  const original = await reading;
  expect(original.items).toHaveLength(2);
  expect(original.items.find(({ userId }) => userId === owner)?.role).toBe(
    "owner",
  );
  expect(original.items.find(({ userId }) => userId === applicant)?.role).toBe(
    "member",
  );
  expect((await listMembers(db, project.id, {})).items).toMatchObject([
    { userId: applicant, role: "owner" },
  ]);
});

test("Kysely rosters batch public hydration and concurrent missing-profile defaults without writes", async () => {
  const { owner, applicant, project, application } = await fixture();
  await transitionApplication(db, owner, application.id, "accepted");
  const member = await user();
  const next = await submitApplication(db, member, project.id, "Member");
  await transitionApplication(db, owner, next.id, "accepted");
  const queries: RootOperationNode[] = [];
  const observed = db.withPlugin(observe((node) => queries.push(node)));
  expect(
    (await listMembers(observed, project.id, { limit: 1 })).items,
  ).toHaveLength(1);
  expect(queries).toHaveLength(5);
  queries.length = 0;
  expect((await listMembers(observed, project.id, {})).items).toHaveLength(3);
  expect(queries).toHaveLength(5);
  await db
    .deleteFrom("profiles")
    .where("user_id", "in", [applicant, member])
    .execute();
  queries.length = 0;
  const pages = await Promise.all([
    listMembers(observed, project.id, {}),
    listMembers(observed, project.id, {}),
  ]);
  expect(pages[0]).toEqual(pages[1]);
  expect(queries).toHaveLength(12);
  expect(queries.every((node) => node.kind === "SelectQueryNode")).toBe(true);
  for (const row of pages[0]?.items ?? []) {
    expect(row.profile).not.toHaveProperty("email");
    if (row.userId !== owner)
      expect(row.profile).toMatchObject({
        displayName: "",
        complete: false,
        discoverable: false,
        skillIds: [],
        goalIds: [],
      });
  }
  expect(
    await db
      .selectFrom("profiles")
      .select("user_id")
      .where("user_id", "in", [applicant, member])
      .execute(),
  ).toEqual([]);
  const serialized = JSON.stringify(queries);
  for (const field of ["email", "image", "accounts", "sessions"])
    expect(serialized).not.toContain(`"name":"${field}"`);
});

test("Kysely project collections traverse tied cursors and validate limits and reauthorize pages", async () => {
  const owner = await user();
  const projects = await Promise.all(
    Array.from({ length: 3 }, () => createProject(db, owner, input)),
  );
  const tie = new Date("2024-01-01T00:00:00.000Z");
  await db
    .updateTable("projects")
    .set({ created_at: tie })
    .where(
      "id",
      "in",
      projects.map(({ id }) => id),
    )
    .execute();
  const project = projects[0];
  if (!project) throw new Error("Expected project");
  const applicants = await Promise.all(Array.from({ length: 3 }, () => user()));
  const applications = await Promise.all(
    applicants.map((id) => submitApplication(db, id, project.id, "Tied")),
  );
  await db
    .updateTable("applications")
    .set({ created_at: tie })
    .where("project_id", "=", project.id)
    .execute();
  for (const application of applications)
    await transitionApplication(db, owner, application.id, "accepted");
  await db
    .updateTable("project_members")
    .set({ created_at: tie })
    .where("project_id", "=", project.id)
    .execute();
  const projectIds: string[] = [],
    applicationIds: string[] = [],
    memberIds: string[] = [];
  for (const [list, output] of [
    [
      async (cursor?: string) => {
        const page = await listProjects(
          db,
          { limit: 1, ...(cursor !== undefined && { cursor }) },
          owner,
        );
        return { ...page, ids: page.items.map(({ id }) => id) };
      },
      projectIds,
    ],
    [
      async (cursor?: string) => {
        const page = await listApplications(
          db,
          owner,
          { limit: 1, ...(cursor !== undefined && { cursor }) },
          project.id,
        );
        return { ...page, ids: page.items.map(({ id }) => id) };
      },
      applicationIds,
    ],
    [
      async (cursor?: string) => {
        const page = await listMembers(db, project.id, {
          limit: 1,
          ...(cursor !== undefined && { cursor }),
        });
        return { ...page, ids: page.items.map(({ userId }) => userId) };
      },
      memberIds,
    ],
  ] as const) {
    let cursor: string | undefined;
    do {
      const page = await list(cursor);
      output.push(...page.ids);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  expect(projectIds).toEqual(
    projects
      .map(({ id }) => id)
      .sort()
      .reverse(),
  );
  expect(applicationIds).toEqual(
    applications
      .map(({ id }) => id)
      .sort()
      .reverse(),
  );
  expect(memberIds).toEqual([owner, ...applicants].sort().reverse());
  for (const list of [
    (query: { limit?: number; cursor?: string }) => listProjects(db, query),
    (query: { limit?: number; cursor?: string }) =>
      listApplications(db, owner, query, project.id),
    (query: { limit?: number; cursor?: string }) =>
      listMembers(db, project.id, query),
  ]) {
    for (const limit of [0, 51, 1.5])
      await expectError(list({ limit }), 422, "INVALID_LIMIT");
    await expectError(list({ cursor: "invalid" }), 422, "INVALID_CURSOR");
  }
  const first = await listApplications(db, owner, { limit: 1 }, project.id);
  if (!first.nextCursor) throw new Error("Expected cursor");
  const successor = applicants[0];
  if (!successor) throw new Error("Expected successor");
  await transferOwnership(db, owner, project.id, successor);
  await expectError(
    listApplications(db, owner, { cursor: first.nextCursor }, project.id),
    404,
    "APPLICATION_NOT_FOUND",
  );
});
