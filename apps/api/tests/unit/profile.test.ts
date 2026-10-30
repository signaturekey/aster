import { describe, expect, expectTypeOf, it } from "bun:test";
import {
  dictionariesSchema,
  type ProfilePatch,
  profilePatchSchema,
  profileSchema,
} from "@api/modules/profiles/schemas";
import { publicProfile } from "@api/modules/profiles/service";
import { TypeCompiler } from "elysia/type-system";

const patchValidator = TypeCompiler.Compile(profilePatchSchema);
const profileValidator = TypeCompiler.Compile(profileSchema);
const dictionaryValidator = TypeCompiler.Compile(dictionariesSchema);

const row = {
  userId: "user-1",
  displayName: "Taylor",
  bio: "Building developer tools",
  specializationId: "backend",
  experienceId: null,
  skills: [{ skillId: "typescript" }],
  goals: [{ goalId: "side-project" }],
  portfolioLinks: ["https://example.com/work"],
  discoverable: false,
  createdAt: new Date("2026-10-30T10:00:00.000Z"),
  updatedAt: new Date("2026-10-30T11:00:00.000Z"),
};

describe("profile PATCH contract", () => {
  it("permits empty and partial PATCHes without requiring onboarding completeness", () => {
    for (const input of [
      {},
      { bio: "" },
      { displayName: "   " },
      { skillIds: [], goalIds: [] },
      { specializationId: null, experienceId: null },
      { discoverable: false },
    ])
      expect(patchValidator.Check(input)).toBe(true);
  });

  it("rejects identity spoofing, private fields, and unknown properties", () => {
    for (const input of [
      { userId: "other-user" },
      { email: "private@example.com" },
      { complete: true },
      { name: "not-a-profile-field" },
    ])
      expect(patchValidator.Check(input)).toBe(false);
  });

  it("enforces documented text, selection, and identifier limits", () => {
    expect(
      patchValidator.Check({
        displayName: "a".repeat(80),
        bio: "b".repeat(2000),
      }),
    ).toBe(true);
    expect(patchValidator.Check({ displayName: "a".repeat(81) })).toBe(false);
    expect(patchValidator.Check({ bio: "a".repeat(2001) })).toBe(false);
    expect(patchValidator.Check({ specializationId: "a".repeat(80) })).toBe(
      true,
    );
    expect(patchValidator.Check({ specializationId: "a".repeat(81) })).toBe(
      false,
    );
    expect(patchValidator.Check({ experienceId: "" })).toBe(false);
    expect(
      patchValidator.Check({
        skillIds: Array.from({ length: 20 }, (_, i) => `skill-${i}`),
      }),
    ).toBe(true);
    expect(
      patchValidator.Check({
        skillIds: Array.from({ length: 21 }, (_, i) => `skill-${i}`),
      }),
    ).toBe(false);
    expect(
      patchValidator.Check({
        goalIds: Array.from({ length: 5 }, (_, i) => `goal-${i}`),
      }),
    ).toBe(true);
    expect(
      patchValidator.Check({
        goalIds: Array.from({ length: 6 }, (_, i) => `goal-${i}`),
      }),
    ).toBe(false);
    expect(patchValidator.Check({ skillIds: ["a".repeat(81)] })).toBe(false);
    expect(patchValidator.Check({ goalIds: [""] })).toBe(false);
  });

  it("rejects duplicate dictionary selections and incorrect field types", () => {
    for (const input of [
      { skillIds: ["typescript", "typescript"] },
      { goalIds: ["startup", "startup"] },
      { discoverable: "true" },
      { displayName: null },
      { bio: null },
      { portfolioLinks: null },
      { skillIds: null },
    ])
      expect(patchValidator.Check(input)).toBe(false);
  });

  it("accepts absolute HTTP(S) links, including local URLs, without fetching them", () => {
    for (const link of [
      "https://example.com/path?key=value#section",
      "HTTP://example.com",
      "http://localhost:3000/work",
      "http://127.0.0.1/work",
      "http://[::1]:3000/work",
    ])
      expect(patchValidator.Check({ portfolioLinks: [link] })).toBe(true);
  });

  it("rejects non-HTTP(S), malformed, and relative portfolio links", () => {
    for (const link of [
      "/relative",
      "example.com",
      "javascript:alert(1)",
      "ftp://example.com",
      "https://",
      "http:///",
      "https:///example.com",
      "https://?query",
      "https://example.com:99999",
      "https://[invalid]/",
      "https://example.com/has space",
      "https:\\example.com",
    ])
      expect(patchValidator.Check({ portfolioLinks: [link] })).toBe(false);
  });

  it("enforces five links and a 2,048-character URL limit", () => {
    const link = `https://example.com/${"a".repeat(2028)}`;
    expect(link.length).toBe(2048);
    expect(patchValidator.Check({ portfolioLinks: [link] })).toBe(true);
    expect(patchValidator.Check({ portfolioLinks: [`${link}a`] })).toBe(false);
    expect(patchValidator.Check({ portfolioLinks: Array(5).fill(link) })).toBe(
      true,
    );
    expect(patchValidator.Check({ portfolioLinks: Array(6).fill(link) })).toBe(
      false,
    );
  });

  it("derives optional request types directly from the TypeBox schema", () => {
    expectTypeOf<ProfilePatch["discoverable"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<ProfilePatch["specializationId"]>().toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf<ProfilePatch["skillIds"]>().toEqualTypeOf<
      string[] | undefined
    >();
  });
});

describe("public profile projection and completeness", () => {
  it("does not require bio, experience, portfolio links, or discovery opt-in", () => {
    const profile = publicProfile({ ...row, bio: "", portfolioLinks: [] });
    expect(profile.complete).toBe(true);
    expect(profile.missingFields).toEqual([]);
    expect(profile.discoverable).toBe(false);
    expect(profileValidator.Check(profile)).toBe(true);
  });

  it("reports each missing professional field with stable input field names", () => {
    const profile = publicProfile({
      ...row,
      displayName: " \t\n ",
      specializationId: null,
      skills: [],
      goals: [],
      discoverable: true,
    });
    expect(profile.complete).toBe(false);
    expect(profile.missingFields).toEqual([
      "displayName",
      "specializationId",
      "skillIds",
      "goalIds",
    ]);
    // Preserve explicit opt-in even when a profile is temporarily incomplete.
    expect(profile.discoverable).toBe(true);
  });

  it("independently requires name, specialization, a skill, and a goal", () => {
    const cases: [
      Partial<Parameters<typeof publicProfile>[0]>,
      ReturnType<typeof publicProfile>["missingFields"][number],
    ][] = [
      [{ displayName: "" }, "displayName"],
      [{ specializationId: null }, "specializationId"],
      [{ skills: [] }, "skillIds"],
      [{ goals: [] }, "goalIds"],
    ];
    for (const [change, missing] of cases) {
      const profile = publicProfile({ ...row, ...change });
      expect(profile.complete).toBe(false);
      expect(profile.missingFields).toEqual([missing]);
    }
  });

  it("serializes ISO timestamps and only the explicit public fields", () => {
    const profile = publicProfile({
      ...row,
      email: "never-public@example.com",
      sessions: [{ token: "secret" }],
      user: { email: "private@example.com" },
    } as typeof row);
    expect(profile).toEqual({
      userId: "user-1",
      displayName: "Taylor",
      bio: "Building developer tools",
      specializationId: "backend",
      experienceId: null,
      skillIds: ["typescript"],
      goalIds: ["side-project"],
      portfolioLinks: ["https://example.com/work"],
      discoverable: false,
      complete: true,
      missingFields: [],
      createdAt: "2026-10-30T10:00:00.000Z",
      updatedAt: "2026-10-30T11:00:00.000Z",
    });
    expectTypeOf(profile.createdAt).toEqualTypeOf<string>();
    expect(
      profileValidator.Check({ ...profile, email: "leak@example.com" }),
    ).toBe(false);
  });

  it("provides deterministic IDs without mutating database input", () => {
    const input = {
      ...row,
      skills: [{ skillId: "typescript" }, { skillId: "bun" }],
      goals: [{ goalId: "startup" }, { goalId: "hackathon" }],
    };
    const profile = publicProfile(input);
    expect(profile.skillIds).toEqual(["bun", "typescript"]);
    expect(profile.goalIds).toEqual(["hackathon", "startup"]);
    expect(input.skills[0]?.skillId).toBe("typescript");
    profile.portfolioLinks.push("https://example.com/another");
    expect(input.portfolioLinks).toHaveLength(1);
  });
});

describe("dictionary public contract", () => {
  it("requires all four dictionaries and limits entries to public IDs and labels", () => {
    const dictionaries = {
      specializations: [{ id: "backend", label: "Backend" }],
      skills: [{ id: "typescript", label: "TypeScript" }],
      experienceLevels: [],
      goals: [{ id: "startup", label: "Startup" }],
    };
    expect(dictionaryValidator.Check(dictionaries)).toBe(true);
    expect(
      dictionaryValidator.Check({
        ...dictionaries,
        experienceLevels: undefined,
      }),
    ).toBe(false);
    expect(
      dictionaryValidator.Check({
        ...dictionaries,
        skills: [{ id: "typescript", label: "TypeScript", private: true }],
      }),
    ).toBe(false);
  });
});
