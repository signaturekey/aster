import { describe, expect, expectTypeOf, test } from "bun:test";
import {
  defaultProfile,
  publicProfile,
  type ProfileRow,
} from "@api/modules/profiles/kysely-service";
import { profileSchema } from "@api/modules/profiles/schemas";
import { TypeCompiler } from "elysia/type-system";

const user = { id: "user-1", createdAt: new Date("2026-10-30T10:00:00.000Z") };
const row: ProfileRow = {
  ...defaultProfile(user),
  displayName: "Taylor",
  specializationId: "backend",
  skills: [{ skillId: "typescript" }, { skillId: "sql" }],
  goals: [{ goalId: "startup" }, { goalId: "hackathon" }],
};

describe("Kysely profile projection", () => {
  test("keeps the camelCase row shape and derives stable defaults from user creation", () => {
    const first = defaultProfile(user);
    const second = defaultProfile(user);
    expect(publicProfile(first)).toMatchObject({
      userId: user.id,
      displayName: "",
      discoverable: false,
      complete: false,
      missingFields: ["displayName", "specializationId", "skillIds", "goalIds"],
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.createdAt.toISOString(),
    });
    first.skills.push({ skillId: "typescript" });
    first.goals.push({ goalId: "startup" });
    first.portfolioLinks.push("https://example.test/work");
    expect(second.skills).toEqual([]);
    expect(second.goals).toEqual([]);
    expect(second.portfolioLinks).toEqual([]);
    expectTypeOf(first.createdAt).toEqualTypeOf<Date>();
  });

  test("projects only public fields and does not require optional professional fields", () => {
    const withPrivateFields = {
      ...row,
      email: "private@example.test",
      sessions: [{ token: "secret" }],
      user: { name: "Private account name" },
    };
    const profile = publicProfile(withPrivateFields);
    expect(profile.complete).toBe(true);
    expect(profile.missingFields).toEqual([]);
    expect(profile.discoverable).toBe(false);
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("sessions");
    expect(profile).not.toHaveProperty("user");
    expect(profile.createdAt).toBe(user.createdAt.toISOString());
    expect(TypeCompiler.Compile(profileSchema).Check(profile)).toBe(true);
    expectTypeOf(profile.createdAt).toEqualTypeOf<string>();
  });

  test("checks every required field independently and preserves explicit opt-in", () => {
    const cases: [
      Partial<ProfileRow>,
      ReturnType<typeof publicProfile>["missingFields"][number],
    ][] = [
      [{ displayName: " \t\n  " }, "displayName"],
      [{ specializationId: null }, "specializationId"],
      [{ skills: [] }, "skillIds"],
      [{ goals: [] }, "goalIds"],
    ];
    for (const [change, missing] of cases) {
      const profile = publicProfile({ ...row, ...change, discoverable: true });
      expect(profile.complete).toBe(false);
      expect(profile.missingFields).toEqual([missing]);
      expect(profile.discoverable).toBe(true);
    }
  });

  test("sorts dictionary IDs without mutating input and copies portfolio arrays", () => {
    const input = { ...row, portfolioLinks: ["https://example.test/work"] };
    const profile = publicProfile(input);
    expect(profile.skillIds).toEqual(["sql", "typescript"]);
    expect(profile.goalIds).toEqual(["hackathon", "startup"]);
    expect(input.skills[0]?.skillId).toBe("typescript");
    expect(input.goals[0]?.goalId).toBe("startup");
    profile.portfolioLinks.push("https://example.test/another");
    expect(input.portfolioLinks).toHaveLength(1);
  });
});
