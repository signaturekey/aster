import { afterAll, expect, test } from "bun:test";
import { requireCompleteProfile } from "../../src/modules/profiles/service";
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
  const initial = await (
    await request("/api/v1/me/profile", { cookie: user.cookie })
  ).json();
  expect(initial.discoverable).toBe(false);
  expect(initial.complete).toBe(false);
  expect(initial.missingFields).toHaveLength(4);
  await expect(requireCompleteProfile(db, user.id)).rejects.toMatchObject({
    code: "PROFILE_INCOMPLETE",
  });
  const patched = await request("/api/v1/me/profile", {
    method: "PATCH",
    cookie: user.cookie,
    body: complete,
  });
  expect(patched.status).toBe(200);
  const profile = await patched.json();
  expect(profile.complete).toBe(true);
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
