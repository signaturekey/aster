import { afterAll, expect, test } from "bun:test";
import {
  requireCompleteProfile,
  updateProfile,
} from "@api/modules/profiles/service";
import { db, register, request } from "./helpers";

afterAll(() => db.$disconnect());
const complete = {
  displayName: "Engineer",
  specializationId: "backend",
  skillIds: ["typescript"],
  goalIds: ["startup"],
  portfolioLinks: ["https://example.test/work"],
  discoverable: true,
};

test("profile defaults, completeness, opt-out and known-ID privacy", async () => {
  const user = await register();
  const other = await register();
  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, createdAt: true },
  });
  const initialResponse = await request("/api/v1/me/profile", {
    cookie: user.cookie,
  });
  expect(initialResponse.status).toBe(200);
  const initial = await initialResponse.json();
  expect(initial).toMatchObject({
    userId: user.id,
    displayName: "",
    bio: "",
    specializationId: null,
    experienceId: null,
    skillIds: [],
    goalIds: [],
    portfolioLinks: [],
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.createdAt.toISOString(),
  });
  expect(
    await db.profile.findUnique({ where: { userId: user.id } }),
  ).toBeNull();
  const defaultKnown = await request(`/api/v1/profiles/${user.id}`, {
    cookie: other.cookie,
  });
  expect(defaultKnown.status).toBe(200);
  expect(await defaultKnown.json()).toEqual(initial);
  expect(
    await db.profile.findUnique({ where: { userId: user.id } }),
  ).toBeNull();
  expect(initial.discoverable).toBe(false);
  expect(initial.complete).toBe(false);
  expect(initial.missingFields).toHaveLength(4);
  // Bun types this async matcher as void; it still needs to be awaited.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(requireCompleteProfile(db, user.id)).rejects.toMatchObject({
    code: "PROFILE_INCOMPLETE",
  });
  expect(
    await db.profile.findUnique({ where: { userId: user.id } }),
  ).toBeNull();
  const patched = await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: user.cookie,
    body: complete,
  });
  expect(patched.status).toBe(200);
  const profile = await patched.json();
  expect(profile.complete).toBe(true);
  expect(await db.profile.count({ where: { userId: user.id } })).toBe(1);
  expect(profile.createdAt).toBe(new Date(profile.createdAt).toISOString());
  expect(profile.updatedAt).toBe(new Date(profile.updatedAt).toISOString());
  expect(
    await requireCompleteProfile(db, user.id, { discovery: true }),
  ).toBeDefined();
  expect(
    (
      await request("/api/v1/me/profile", {
        method: "PATCH",
        cookie: user.cookie,
        body: { discoverable: false },
      })
    ).status,
  ).toBe(200);
  const known = await request(`/api/v1/profiles/${user.id}`, {
    cookie: other.cookie,
  });
  expect(known.status).toBe(200);
  const publicBody = await known.json();
  expect(publicBody.discoverable).toBe(false);
  for (const field of [
    "email",
    "password",
    "token",
    "emailVerified",
    "accounts",
    "sessions",
  ])
    expect(publicBody).not.toHaveProperty(field);
  expect((await request(`/api/v1/profiles/${user.id}`)).status).toBe(401);
  expect(
    (await request("/api/v1/profiles/nonexistent", { cookie: other.cookie }))
      .status,
  ).toBe(404);
});

test("first PATCH initializes atomically and concurrent PATCHes preserve fields", async () => {
  const user = await register();
  const invalid = await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: user.cookie,
    body: { displayName: "Must not persist", skillIds: ["unknown"] },
  });
  expect(invalid.status).toBe(422);
  expect(
    await db.profile.findUnique({ where: { userId: user.id } }),
  ).toBeNull();

  const observed = db.$extends({
    query: {
      profile: {
        update() {
          throw new Error("Injected profile update failure");
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
  // Bun types this async matcher as void; it still needs to be awaited.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(updateProfile(instrumented, user.id, complete)).rejects.toThrow(
    "Injected profile update failure",
  );
  expect(
    await db.profile.findUnique({ where: { userId: user.id } }),
  ).toBeNull();

  const responses = await Promise.all(
    [complete, { bio: "Concurrent biography" }].map((body) =>
      request("/api/v1/me/profile", {
        method: "PATCH",
        cookie: user.cookie,
        body,
      }),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(await db.profile.count({ where: { userId: user.id } })).toBe(1);
  const profile = await (
    await request("/api/v1/me/profile", { cookie: user.cookie })
  ).json();
  expect(profile).toMatchObject({
    ...complete,
    bio: "Concurrent biography",
    complete: true,
  });
});

test("invalid PATCH is atomic, rejects spoofed identity and cannot edit others", async () => {
  const user = await register();
  const other = await register();
  await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: user.cookie,
    body: complete,
  });
  for (const body of [
    { displayName: "Should not persist", skillIds: ["unknown"] },
    { portfolioLinks: ["javascript:alert(1)"] },
    { bio: "x".repeat(2001) },
    { userId: other.id, displayName: "Spoof" },
    { skillIds: ["typescript", "typescript"] },
  ]) {
    const response = await request("/api/v1/me/profile", {
      method: "PATCH",
      cookie: user.cookie,
      body,
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBeString();
  }
  expect(
    (
      await (
        await request("/api/v1/me/profile", { cookie: user.cookie })
      ).json()
    ).displayName,
  ).toBe("Engineer");
  expect(
    (
      await request(`/api/v1/profiles/${other.id}`, {
        method: "PATCH",
        cookie: user.cookie,
        body: { displayName: "Not allowed" },
      })
    ).status,
  ).toBe(404);
  const dictionaries = await request("/api/v1/dictionaries", {
    cookie: user.cookie,
  });
  expect(dictionaries.status).toBe(200);
  expect(
    (await dictionaries.json()).goals.map((g: { id: string }) => g.id),
  ).toContain("pair-programming");
});
