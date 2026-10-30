import { expect, test } from "bun:test";
import type {
  PublicApplication,
  PublicProject,
} from "@api/modules/projects/schemas";
import { listMembers } from "@api/modules/projects/service";
import { db, register, request } from "./helpers";

const projectInput = {
  title: "Aster team",
  description: "Build a useful collaboration project.",
  goalId: "startup",
  requiredRoles: ["Backend engineer"],
  requiredSkillIds: ["typescript"],
};
type User = Awaited<ReturnType<typeof register>>;
async function completeUser() {
  const user = await register();
  const response = await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: user.cookie,
    body: {
      displayName: "Project collaborator",
      specializationId: "backend",
      skillIds: ["typescript"],
      goalIds: ["startup"],
      discoverable: false,
    },
  });
  expect(response.status).toBe(200);
  return user;
}
async function create(owner: User) {
  const response = await request("/api/v1/projects", {
    method: "POST",
    cookie: owner.cookie,
    body: projectInput,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as PublicProject;
}
async function apply(project: PublicProject, user: User) {
  const response = await request(
    `/api/v1/projects/${project.id}/applications`,
    {
      method: "POST",
      cookie: user.cookie,
      body: { text: "I can contribute." },
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as PublicApplication;
}
function decide(application: PublicApplication, user: User, action = "accept") {
  return request(`/api/v1/applications/${application.id}/${action}`, {
    method: "POST",
    cookie: user.cookie,
  });
}
function patch(project: PublicProject, owner: User, body: unknown) {
  return request(`/api/v1/projects/${project.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body,
  });
}
function transfer(project: PublicProject, owner: User, userId: string) {
  return request(`/api/v1/projects/${project.id}/transfer-ownership`, {
    method: "POST",
    cookie: owner.cookie,
    body: { userId },
  });
}
async function conversationId(project: PublicProject) {
  return (
    await db.conversation.findUniqueOrThrow({
      where: { projectId: project.id },
      select: { id: true },
    })
  ).id;
}
async function membershipCounts(project: PublicProject, user: User) {
  return Promise.all([
    db.projectMember.count({
      where: { projectId: project.id, userId: user.id },
    }),
    db.conversationMember.count({
      where: { userId: user.id, conversation: { projectId: project.id } },
    }),
  ]);
}

test("project creation is atomic, complete-profile gated and publicly projected", async () => {
  const incomplete = await register();
  const before = await db.project.count({ where: { ownerId: incomplete.id } });
  expect((await request("/api/v1/projects")).status).toBe(401);
  expect(
    (
      await request("/api/v1/projects", {
        method: "POST",
        cookie: incomplete.cookie,
        body: projectInput,
      })
    ).status,
  ).toBe(409);
  expect(await db.project.count({ where: { ownerId: incomplete.id } })).toBe(
    before,
  );
  const owner = await completeUser();
  const outsider = await register();
  const project = await create(owner);
  expect(project.ownerId).toBe(owner.id);
  expect(project.recruitmentOpen).toBe(true);
  expect(project.requiredSkillIds).toEqual(["typescript"]);
  expect(project.createdAt).toBe(new Date(project.createdAt).toISOString());
  expect(await membershipCounts(project, owner)).toEqual([1, 1]);
  expect(
    await db.projectMember.count({ where: { projectId: project.id } }),
  ).toBe(1);
  expect(
    await db.conversation.count({ where: { projectId: project.id } }),
  ).toBe(1);
  const detail = await request(`/api/v1/projects/${project.id}`, {
    cookie: outsider.cookie,
  });
  expect(detail.status).toBe(200);
  expect(await detail.json()).toEqual(project);
  const roster = await request(`/api/v1/projects/${project.id}/members`, {
    cookie: outsider.cookie,
  });
  expect(roster.status).toBe(200);
  const { items } = await roster.json();
  expect(items).toHaveLength(1);
  expect(items[0].role).toBe("owner");
  expect(items[0].profile.userId).toBe(owner.id);
  expect(items[0].profile).not.toHaveProperty("email");
  expect(items[0]).not.toHaveProperty("applications");
  expect(items[0]).not.toHaveProperty("conversation");
  const mine = await request("/api/v1/me/projects", { cookie: owner.cookie });
  expect((await mine.json()).items.map((p: PublicProject) => p.id)).toContain(
    project.id,
  );
  const theirs = await request("/api/v1/me/projects", {
    cookie: outsider.cookie,
  });
  expect((await theirs.json()).items).toEqual([]);
});

test("owner edits validate dictionaries/limits atomically and reopening preserves collaboration", async () => {
  const owner = await completeUser();
  const other = await completeUser();
  const project = await create(owner);
  const id = await conversationId(project);
  expect((await patch(project, other, { title: "Hijack" })).status).toBe(403);
  for (const body of [
    { title: "x".repeat(121) },
    { title: "   " },
    { description: "x".repeat(5001) },
    { requiredRoles: [] },
    { requiredRoles: Array.from({ length: 11 }, () => "Engineer") },
    { requiredRoles: ["x".repeat(81)] },
    { requiredSkillIds: ["typescript", "typescript"] },
    { requiredSkillIds: Array.from({ length: 21 }, (_, i) => `skill-${i}`) },
    { title: "Invalid", goalId: "unknown" },
    { title: "Invalid", requiredSkillIds: ["unknown"] },
    { ownerId: other.id },
  ])
    expect((await patch(project, owner, body)).status).toBe(422);
  expect(
    (await db.project.findUniqueOrThrow({ where: { id: project.id } })).title,
  ).toBe(project.title);
  const pending = await apply(project, other);
  expect((await patch(project, owner, { recruitmentOpen: false })).status).toBe(
    200,
  );
  expect((await decide(pending, owner)).status).toBe(409);
  expect(
    (await db.application.findUniqueOrThrow({ where: { id: pending.id } }))
      .state,
  ).toBe("pending");
  expect(await membershipCounts(project, owner)).toEqual([1, 1]);
  const third = await completeUser();
  expect(
    (
      await request(`/api/v1/projects/${project.id}/applications`, {
        method: "POST",
        cookie: third.cookie,
        body: { text: "Interested" },
      })
    ).status,
  ).toBe(409);
  expect(
    (await patch(project, owner, { recruitmentOpen: true, title: "Updated" }))
      .status,
  ).toBe(200);
  expect(await conversationId(project)).toBe(id);
  expect((await decide(pending, owner)).status).toBe(200);
});

test("private applications need no match, preserve outcomes and permit independent resubmission", async () => {
  const owner = await completeUser();
  const applicant = await completeUser();
  const stranger = await completeUser();
  const incomplete = await register();
  const firstProject = await create(owner);
  const secondProject = await create(owner);
  const url = `/api/v1/projects/${firstProject.id}/applications`;
  expect(
    (
      await request(url, {
        method: "POST",
        cookie: incomplete.cookie,
        body: { text: "Hello" },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request(url, {
        method: "POST",
        cookie: owner.cookie,
        body: { text: "Hello" },
      })
    ).status,
  ).toBe(409);
  for (const body of [
    { text: " " },
    { text: "x".repeat(2001) },
    { text: "Hello", userId: stranger.id },
  ])
    expect(
      (await request(url, { method: "POST", cookie: applicant.cookie, body }))
        .status,
    ).toBe(422);
  const [first, second] = await Promise.all([
    apply(firstProject, applicant),
    apply(secondProject, applicant),
  ]);
  expect((await request(url, { cookie: stranger.cookie })).status).toBe(404);
  expect((await request(url, { cookie: applicant.cookie })).status).toBe(404);
  expect((await decide(first, stranger, "reject")).status).toBe(404);
  expect((await decide(first, applicant)).status).toBe(403);
  expect((await decide(first, owner, "withdraw")).status).toBe(404);
  expect((await decide(first, owner, "reject")).status).toBe(200);
  expect((await decide(first, applicant, "withdraw")).status).toBe(409);
  const resubmitted = await apply(firstProject, applicant);
  expect(resubmitted.id).not.toBe(first.id);
  expect((await decide(resubmitted, applicant, "withdraw")).status).toBe(200);
  expect((await decide(resubmitted, owner)).status).toBe(409);
  const third = await apply(firstProject, applicant);
  expect(third.state).toBe("pending");
  const history = await request("/api/v1/me/applications", {
    cookie: applicant.cookie,
  });
  const { items } = await history.json();
  expect(items).toHaveLength(4);
  expect(items.find((a: PublicApplication) => a.id === first.id).state).toBe(
    "rejected",
  );
  expect(
    items.find((a: PublicApplication) => a.id === resubmitted.id).state,
  ).toBe("withdrawn");
  expect(
    items.find((a: PublicApplication) => a.id === second.id).projectId,
  ).toBe(secondProject.id);
  expect(
    (
      await request("/api/v1/me/applications", {
        cookie: stranger.cookie,
      }).then((r) => r.json())
    ).items,
  ).toEqual([]);
});

test("concurrent duplicate applications and acceptance retries persist one outcome and both memberships", async () => {
  const owner = await completeUser();
  const applicant = await completeUser();
  const project = await create(owner);
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      request(`/api/v1/projects/${project.id}/applications`, {
        method: "POST",
        cookie: applicant.cookie,
        body: { text: "Interested" },
      }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409]);
  const application = (await responses
    .find((r) => r.status === 200)
    ?.json()) as PublicApplication;
  expect(
    await db.application.count({
      where: { projectId: project.id, userId: applicant.id, state: "pending" },
    }),
  ).toBe(1);
  const decisions = await Promise.all([
    decide(application, owner),
    decide(application, owner),
  ]);
  expect(decisions.map((r) => r.status)).toEqual([200, 200]);
  expect(await decisions[0]?.json()).toEqual(await decisions[1]?.json());
  expect(await membershipCounts(project, applicant)).toEqual([1, 1]);
  expect((await decide(application, owner, "reject")).status).toBe(409);
  expect(
    (
      await request(`/api/v1/projects/${project.id}/applications`, {
        cookie: applicant.cookie,
      })
    ).status,
  ).toBe(404);
});

test("acceptance racing recruitment closure has a valid serial outcome without partial membership", async () => {
  const owner = await completeUser();
  const applicant = await completeUser();
  const project = await create(owner);
  const application = await apply(project, applicant);
  const [accepted, closed] = await Promise.all([
    decide(application, owner),
    patch(project, owner, { recruitmentOpen: false }),
  ]);
  expect(closed.status).toBe(200);
  expect([200, 409]).toContain(accepted.status);
  const state = (
    await db.application.findUniqueOrThrow({ where: { id: application.id } })
  ).state;
  expect(state).toBe(accepted.status === 200 ? "accepted" : "pending");
  expect(await membershipCounts(project, applicant)).toEqual(
    accepted.status === 200 ? [1, 1] : [0, 0],
  );
  const persisted = await db.project.findUniqueOrThrow({
    where: { id: project.id },
  });
  expect(persisted.recruitmentOpen).toBe(false);
  if (accepted.status === 409) {
    expect(
      (await patch(project, owner, { recruitmentOpen: true })).status,
    ).toBe(200);
    expect((await decide(application, owner)).status).toBe(200);
  }
});

test("competing terminal application decisions serialize and retain a single consistent outcome", async () => {
  const owner = await completeUser();
  const applicant = await completeUser();
  const project = await create(owner);
  const application = await apply(project, applicant);
  const results = await Promise.all([
    decide(application, owner),
    decide(application, applicant, "withdraw"),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const row = await db.application.findUniqueOrThrow({
    where: { id: application.id },
  });
  expect(["accepted", "withdrawn"]).toContain(row.state);
  expect(await membershipCounts(project, applicant)).toEqual(
    row.state === "accepted" ? [1, 1] : [0, 0],
  );
});

test("transfers use committed ownership; old-owner retries cannot restore removed members", async () => {
  const owner = await completeUser();
  const a = await completeUser();
  const b = await completeUser();
  const outsider = await completeUser();
  const project = await create(owner);
  const [applicationA, applicationB] = await Promise.all([
    apply(project, a),
    apply(project, b),
  ]);
  expect((await decide(applicationA, owner)).status).toBe(200);
  expect((await decide(applicationB, owner)).status).toBe(200);
  expect(
    (
      await request(`/api/v1/projects/${project.id}/members/me`, {
        method: "DELETE",
        cookie: owner.cookie,
      })
    ).status,
  ).toBe(409);
  expect((await transfer(project, owner, outsider.id)).status).toBe(409);
  const transfers = await Promise.all([
    transfer(project, owner, a.id),
    transfer(project, owner, b.id),
  ]);
  expect(transfers.map((r) => r.status).sort()).toEqual([200, 403]);
  const persisted = await db.project.findUniqueOrThrow({
    where: { id: project.id },
  });
  const newOwner = persisted.ownerId === a.id ? a : b;
  const member = persisted.ownerId === a.id ? b : a;
  const accepted = persisted.ownerId === a.id ? applicationB : applicationA;
  expect(
    (
      await request(`/api/v1/projects/${project.id}/applications`, {
        cookie: owner.cookie,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(`/api/v1/projects/${project.id}/applications`, {
        cookie: newOwner.cookie,
      })
    ).status,
  ).toBe(200);
  expect((await decide(accepted, owner)).status).toBe(404);
  expect(
    (
      await request(`/api/v1/projects/${project.id}/members/${member.id}`, {
        method: "DELETE",
        cookie: owner.cookie,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(`/api/v1/projects/${project.id}/members/${member.id}`, {
        method: "DELETE",
        cookie: newOwner.cookie,
      })
    ).status,
  ).toBe(200);
  expect(await membershipCounts(project, member)).toEqual([0, 0]);
  expect((await decide(accepted, newOwner)).status).toBe(200);
  expect(await membershipCounts(project, member)).toEqual([0, 0]);
  expect(
    (
      await request(`/api/v1/projects/${project.id}/members/me`, {
        method: "DELETE",
        cookie: owner.cookie,
      })
    ).status,
  ).toBe(200);
  expect(await membershipCounts(project, owner)).toEqual([0, 0]);
  const roster = await request(`/api/v1/projects/${project.id}/members`, {
    cookie: outsider.cookie,
  });
  expect(
    (await roster.json()).items.filter(
      (m: { role: string }) => m.role === "owner",
    ),
  ).toHaveLength(1);
});

test("roster keeps one ownership snapshot when transfer and leave commit between reads", async () => {
  const owner = await completeUser();
  const successor = await completeUser();
  const project = await create(owner);
  const application = await apply(project, successor);
  expect((await decide(application, owner)).status).toBe(200);
  let ownerRead = false;
  let membershipReads = 0;
  const observed = db.$extends({
    query: {
      project: {
        async findUnique({ args, query }) {
          const result = await query(args);
          ownerRead = true;
          return result;
        },
      },
      projectMember: {
        async findMany({ args, query }) {
          expect(ownerRead).toBe(true);
          membershipReads++;
          // Separate committed transactions run after the roster's owner lookup
          // but before its membership query, not an opportunistic timing race.
          expect((await transfer(project, owner, successor.id)).status).toBe(
            200,
          );
          expect(
            (
              await request(`/api/v1/projects/${project.id}/members/me`, {
                method: "DELETE",
                cookie: owner.cookie,
              })
            ).status,
          ).toBe(200);
          return query(args);
        },
      },
    },
  });
  const instrumented = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "$transaction")
        return observed.$transaction.bind(observed);
      return Reflect.get(target, property, receiver);
    },
  });
  const original = await listMembers(instrumented, project.id, {});
  expect(membershipReads).toBe(1);
  expect(original.items).toHaveLength(2);
  expect(original.items.find((row) => row.userId === owner.id)?.role).toBe(
    "owner",
  );
  expect(original.items.find((row) => row.userId === successor.id)?.role).toBe(
    "member",
  );
  expect(original.items.filter((row) => row.role === "owner")).toHaveLength(1);
  const subsequent = await request(`/api/v1/projects/${project.id}/members`, {
    cookie: successor.cookie,
  });
  expect(subsequent.status).toBe(200);
  expect((await subsequent.json()).items).toMatchObject([
    { userId: successor.id, role: "owner" },
  ]);
  expect(await membershipCounts(project, owner)).toEqual([0, 0]);
});

test("concurrent rosters batch read-only defaults for missing profiles", async () => {
  const owner = await completeUser();
  const members = await Promise.all([
    completeUser(),
    completeUser(),
    completeUser(),
  ]);
  const project = await create(owner);
  for (const member of members) {
    const application = await apply(project, member);
    expect((await decide(application, owner)).status).toBe(200);
  }
  const operations: string[] = [];
  const userOperations: string[] = [];
  const hydratedIds: string[][] = [];
  const defaultUserIds: string[][] = [];
  let synchronizeReads = false;
  let profileReads = 0;
  const bothProfilesRead = Promise.withResolvers<void>();
  const observed = db.$extends({
    query: {
      profile: {
        async $allOperations({ operation, args, query }) {
          operations.push(operation);
          if (operation === "findMany") {
            const filter = args.where?.userId;
            if (typeof filter === "object" && Array.isArray(filter.in))
              hydratedIds.push(filter.in);
          }
          const result = await query(args);
          if (synchronizeReads && operation === "findMany") {
            profileReads++;
            if (profileReads === 2) bothProfilesRead.resolve();
            // Both RepeatableRead snapshots observe the absent profiles before
            // either proceeds with hydration; no sleeps or timing assumptions.
            await bothProfilesRead.promise;
          }
          return result;
        },
      },
      user: {
        async $allOperations({ operation, args, query }) {
          userOperations.push(operation);
          if (operation === "findMany") {
            expect(args.select).toEqual({ id: true, createdAt: true });
            const filter = args.where?.id;
            if (typeof filter === "object" && Array.isArray(filter.in))
              defaultUserIds.push(filter.in);
          }
          return query(args);
        },
      },
    },
  });
  const instrumented = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "$transaction")
        return observed.$transaction.bind(observed);
      return Reflect.get(target, property, receiver);
    },
  });
  const page = await listMembers(instrumented, project.id, { limit: 2 });
  expect(page.items).toHaveLength(2);
  expect(page.nextCursor).toBeString();
  expect(operations).toEqual(["findMany"]);
  expect(hydratedIds).toEqual([page.items.map((row) => row.userId)]);
  operations.length = 0;
  const roster = await listMembers(instrumented, project.id, {});
  expect(roster.items).toHaveLength(4);
  // Query count stays constant with roster size; no per-member findUnique,
  // user lookups, or profile writes are needed for normal project members.
  expect(operations).toEqual(["findMany"]);
  expect(userOperations).toEqual([]);
  for (const row of roster.items) {
    expect(row.profile.userId).toBe(row.userId);
    expect(row.profile.complete).toBe(true);
    expect(row.profile.createdAt).toBe(
      new Date(row.profile.createdAt).toISOString(),
    );
    expect(row.profile).not.toHaveProperty("email");
  }
  const missingIds = members.slice(0, 2).map((member) => member.id);
  await db.profile.deleteMany({ where: { userId: { in: missingIds } } });
  const users = await db.user.findMany({
    where: { id: { in: missingIds } },
    select: { id: true, createdAt: true },
  });
  operations.length = 0;
  const legacy = await listMembers(instrumented, project.id, {});
  expect(legacy.items).toHaveLength(4);
  expect(operations).toEqual(["findMany"]);
  expect(userOperations).toEqual(["findMany"]);
  expect(defaultUserIds).toHaveLength(1);
  expect(defaultUserIds[0]?.toSorted()).toEqual(missingIds.toSorted());
  for (const row of legacy.items.filter((row) =>
    missingIds.includes(row.userId),
  )) {
    const createdAt = users.find((user) => user.id === row.userId)?.createdAt;
    expect(row.profile).toMatchObject({
      userId: row.userId,
      displayName: "",
      bio: "",
      specializationId: null,
      experienceId: null,
      portfolioLinks: [],
      skillIds: [],
      goalIds: [],
      complete: false,
      discoverable: false,
      createdAt: createdAt?.toISOString(),
      updatedAt: createdAt?.toISOString(),
    });
    const known = await request(`/api/v1/profiles/${row.userId}`, {
      cookie: owner.cookie,
    });
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual(row.profile);
  }

  operations.length = 0;
  userOperations.length = 0;
  defaultUserIds.length = 0;
  synchronizeReads = true;
  const concurrent = await Promise.all([
    listMembers(instrumented, project.id, {}),
    listMembers(instrumented, project.id, {}),
  ]);
  expect(profileReads).toBe(2);
  expect(concurrent).toEqual([legacy, legacy]);
  expect(operations).toEqual(["findMany", "findMany"]);
  expect(userOperations).toEqual(["findMany", "findMany"]);
  expect(defaultUserIds.map((ids) => ids.toSorted())).toEqual([
    missingIds.toSorted(),
    missingIds.toSorted(),
  ]);
  expect(
    await db.profile.count({ where: { userId: { in: missingIds } } }),
  ).toBe(0);
});

test("all project collections validate limits/cursors, traverse timestamp ties and reauthorize pages", async () => {
  const owner = await completeUser();
  const applicant = await completeUser();
  const projects = await Promise.all([
    create(owner),
    create(owner),
    create(owner),
  ]);
  const time = new Date("2026-01-01T00:00:00.000Z");
  await db.project.updateMany({
    where: { id: { in: projects.map((p) => p.id) } },
    data: { createdAt: time },
  });
  const expected = projects
    .map((p) => p.id)
    .sort()
    .reverse();
  let cursor: string | null = null;
  const seen: string[] = [];
  do {
    const response = await request(
      `/api/v1/me/projects?limit=1${cursor ? `&cursor=${cursor}` : ""}`,
      { cookie: owner.cookie },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    seen.push(...body.items.map((p: PublicProject) => p.id));
    cursor = body.nextCursor;
  } while (cursor);
  expect(seen).toEqual(expected);
  const project = projects[0];
  if (!project) throw new Error("Missing project");
  const first = await apply(project, applicant);
  await decide(first, applicant, "withdraw");
  const second = await apply(project, applicant);
  await db.application.updateMany({
    where: { id: { in: [first.id, second.id] } },
    data: { createdAt: time },
  });
  const pageOne = await request(
    `/api/v1/projects/${project.id}/applications?limit=1`,
    { cookie: owner.cookie },
  ).then((r) => r.json());
  const ownPage = await request("/api/v1/me/applications?limit=1", {
    cookie: applicant.cookie,
  }).then((r) => r.json());
  expect(ownPage.items[0].id).toBe([first.id, second.id].sort().reverse()[0]);
  expect(
    (
      await request(
        `/api/v1/me/applications?limit=1&cursor=${ownPage.nextCursor}`,
        { cookie: applicant.cookie },
      ).then((r) => r.json())
    ).items,
  ).toHaveLength(1);
  expect((await decide(second, owner)).status).toBe(200);
  const members = await request(
    `/api/v1/projects/${project.id}/members?limit=1`,
    { cookie: owner.cookie },
  ).then((r) => r.json());
  expect(members.items).toHaveLength(1);
  expect(members.nextCursor).toBeString();
  expect(
    (
      await request(
        `/api/v1/projects/${project.id}/members?limit=1&cursor=${members.nextCursor}`,
        { cookie: owner.cookie },
      ).then((r) => r.json())
    ).items,
  ).toHaveLength(1);
  await transfer(project, owner, applicant.id);
  expect(
    (
      await request(
        `/api/v1/projects/${project.id}/applications?limit=1&cursor=${pageOne.nextCursor}`,
        { cookie: owner.cookie },
      )
    ).status,
  ).toBe(404);
  const collections = [
    "/api/v1/projects",
    "/api/v1/me/projects",
    "/api/v1/me/applications",
    `/api/v1/projects/${project.id}/members`,
    `/api/v1/projects/${project.id}/applications`,
  ];
  for (const collection of collections) {
    for (const query of [
      "limit=0",
      "limit=51",
      "limit=1.5",
      "cursor=invalid",
      "cursor=",
    ]) {
      const response = await request(`${collection}?${query}`, {
        cookie: applicant.cookie,
      });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBeString();
    }
  }
  const catalogue = await request("/api/v1/projects?limit=1", {
    cookie: applicant.cookie,
  }).then((r) => r.json());
  expect(catalogue.items).toHaveLength(1);
  expect(catalogue.nextCursor).toBeString();
});

test("leave/removal revoke chat history and racing writes; new acceptance restores original full history", async () => {
  const owner = await completeUser();
  const member = await completeUser();
  const project = await create(owner);
  const id = await conversationId(project);
  const messages = `/api/v1/conversations/${id}/messages`;
  const send = (user: User, text: string) =>
    request(messages, {
      method: "POST",
      cookie: user.cookie,
      body: { requestId: crypto.randomUUID(), text },
    });
  expect((await send(owner, "Before joining")).status).toBe(200);
  const first = await apply(project, member);
  expect((await decide(first, owner)).status).toBe(200);
  const history = await request(messages, { cookie: member.cookie }).then((r) =>
    r.json(),
  );
  expect(history.items.map((m: { text: string }) => m.text)).toContain(
    "Before joining",
  );
  const [removed, racingWrite] = await Promise.all([
    request(`/api/v1/projects/${project.id}/members/${member.id}`, {
      method: "DELETE",
      cookie: owner.cookie,
    }),
    send(member, "Racing removal"),
  ]);
  expect(removed.status).toBe(200);
  expect([200, 404]).toContain(racingWrite.status);
  expect(
    await db.message.count({
      where: {
        conversationId: id,
        senderId: member.id,
        text: "Racing removal",
      },
    }),
  ).toBe(racingWrite.status === 200 ? 1 : 0);
  expect((await request(messages, { cookie: member.cookie })).status).toBe(404);
  expect((await send(member, "Forbidden after removal")).status).toBe(404);
  expect((await decide(first, owner)).status).toBe(200);
  expect((await request(messages, { cookie: member.cookie })).status).toBe(404);
  const returning = await apply(project, member);
  expect(returning.id).not.toBe(first.id);
  expect((await decide(returning, owner)).status).toBe(200);
  expect(await conversationId(project)).toBe(id);
  const restored = await request(messages, { cookie: member.cookie }).then(
    (r) => r.json(),
  );
  expect(restored.items.map((m: { text: string }) => m.text)).toContain(
    "Before joining",
  );
  expect(
    (
      await request(`/api/v1/projects/${project.id}/members/me`, {
        method: "DELETE",
        cookie: member.cookie,
      })
    ).status,
  ).toBe(200);
  expect(await membershipCounts(project, member)).toEqual([0, 0]);
  expect((await request(messages, { cookie: member.cookie })).status).toBe(404);
  expect((await send(member, "Forbidden after leaving")).status).toBe(404);
});
