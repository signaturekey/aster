import { t } from "elysia";
import { FormatRegistry } from "elysia/type-system";

FormatRegistry.Set("aster-http-url", (value) => {
  if (!/^https?:\/\/[^/?#\\]/i.test(value) || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname
    );
  } catch {
    return false;
  }
});

// Engineering defaults, shared by PATCH validation and public responses:
// display name 80 characters, bio 2,000, IDs 80, at most 20 unique skills,
// 5 unique goals, and 5 HTTP(S) portfolio links of at most 2,048 characters.
const idSchema = t.String({ minLength: 1, maxLength: 80 });
const displayNameSchema = t.String({ maxLength: 80 });
const bioSchema = t.String({ maxLength: 2000 });
const nullableIdSchema = t.Union([idSchema, t.Null()]);
const skillIdsSchema = t.Array(idSchema, { maxItems: 20, uniqueItems: true });
const goalIdsSchema = t.Array(idSchema, { maxItems: 5, uniqueItems: true });
const portfolioLinksSchema = t.Array(
  t.String({
    maxLength: 2048,
    format: "aster-http-url",
    description: "Absolute HTTP(S) portfolio URL; maximum 2,048 characters.",
  }),
  { maxItems: 5 },
);

const missingFieldSchema = t.Union([
  t.Literal("displayName"),
  t.Literal("specializationId"),
  t.Literal("skillIds"),
  t.Literal("goalIds"),
]);

export const profilePatchSchema = t.Object(
  {
    displayName: t.Optional(displayNameSchema),
    bio: t.Optional(bioSchema),
    specializationId: t.Optional(nullableIdSchema),
    experienceId: t.Optional(nullableIdSchema),
    skillIds: t.Optional(skillIdsSchema),
    goalIds: t.Optional(goalIdsSchema),
    portfolioLinks: t.Optional(portfolioLinksSchema),
    discoverable: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
);

export const profileSchema = t.Object(
  {
    userId: idSchema,
    displayName: displayNameSchema,
    bio: bioSchema,
    specializationId: nullableIdSchema,
    experienceId: nullableIdSchema,
    skillIds: skillIdsSchema,
    goalIds: goalIdsSchema,
    portfolioLinks: portfolioLinksSchema,
    discoverable: t.Boolean(),
    complete: t.Boolean(),
    missingFields: t.Array(missingFieldSchema, {
      maxItems: 4,
      uniqueItems: true,
    }),
    createdAt: t.String({ format: "date-time" }),
    updatedAt: t.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

const dictionaryItemSchema = t.Object(
  { id: idSchema, label: t.String() },
  { additionalProperties: false },
);

export const dictionariesSchema = t.Object(
  {
    specializations: t.Array(dictionaryItemSchema),
    skills: t.Array(dictionaryItemSchema),
    experienceLevels: t.Array(dictionaryItemSchema),
    goals: t.Array(dictionaryItemSchema),
  },
  { additionalProperties: false },
);

export type ProfilePatch = (typeof profilePatchSchema)["static"];
export type PublicProfile = (typeof profileSchema)["static"];
