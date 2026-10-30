import { t } from "elysia";
import type { pageQuerySchema } from "../../lib/pagination";
import { profileSchema } from "../profiles/schemas";

const idSchema = t.String({ minLength: 1, maxLength: 128 });
const dictionaryIdSchema = t.String({ minLength: 1, maxLength: 80 });
const timestampSchema = t.String({ format: "date-time" });
// Explicit engineering limits: title 120, description 5,000, 1–10 roles
// of 80 characters, 20 unique skills, and application text 2,000 characters.
const recruitmentFields = {
  title: t.String({ minLength: 1, maxLength: 120, pattern: "\\S" }),
  description: t.String({ minLength: 1, maxLength: 5000, pattern: "\\S" }),
  goalId: dictionaryIdSchema,
  requiredRoles: t.Array(
    t.String({ minLength: 1, maxLength: 80, pattern: "\\S" }),
    { minItems: 1, maxItems: 10 },
  ),
  requiredSkillIds: t.Array(dictionaryIdSchema, {
    maxItems: 20,
    uniqueItems: true,
  }),
};
export const projectCreateSchema = t.Object(recruitmentFields, {
  additionalProperties: false,
});
export const projectPatchSchema = t.Partial(
  t.Object(
    { ...recruitmentFields, recruitmentOpen: t.Boolean() },
    { additionalProperties: false },
  ),
);
export const projectSchema = t.Object(
  {
    id: idSchema,
    ...recruitmentFields,
    ownerId: idSchema,
    recruitmentOpen: t.Boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  { additionalProperties: false },
);
export const applicationCreateSchema = t.Object(
  { text: t.String({ minLength: 1, maxLength: 2000, pattern: "\\S" }) },
  { additionalProperties: false },
);
export const applicationStateSchema = t.Union([
  t.Literal("pending"),
  t.Literal("accepted"),
  t.Literal("rejected"),
  t.Literal("withdrawn"),
]);
export const applicationSchema = t.Object(
  {
    id: idSchema,
    projectId: idSchema,
    userId: idSchema,
    text: t.String({ minLength: 1, maxLength: 2000 }),
    state: applicationStateSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  { additionalProperties: false },
);
export const memberSchema = t.Object(
  {
    projectId: idSchema,
    userId: idSchema,
    role: t.Union([t.Literal("owner"), t.Literal("member")]),
    profile: profileSchema,
    createdAt: timestampSchema,
  },
  { additionalProperties: false },
);
export const projectPageSchema = t.Object({
  items: t.Array(projectSchema, { maxItems: 50 }),
  nextCursor: t.Union([t.String(), t.Null()]),
});
export const applicationPageSchema = t.Object({
  items: t.Array(applicationSchema, { maxItems: 50 }),
  nextCursor: t.Union([t.String(), t.Null()]),
});
export const memberPageSchema = t.Object({
  items: t.Array(memberSchema, { maxItems: 50 }),
  nextCursor: t.Union([t.String(), t.Null()]),
});
export const projectParamsSchema = t.Object({ projectId: idSchema });
export const applicationParamsSchema = t.Object({ applicationId: idSchema });
export const memberParamsSchema = t.Object({
  projectId: idSchema,
  userId: idSchema,
});
export const transferSchema = t.Object(
  { userId: idSchema },
  { additionalProperties: false },
);
export const removedSchema = t.Object({ removed: t.Literal(true) });
export type ProjectCreate = (typeof projectCreateSchema)["static"];
export type ProjectPatch = (typeof projectPatchSchema)["static"];
export type PublicProject = (typeof projectSchema)["static"];
export type PublicApplication = (typeof applicationSchema)["static"];
export type PublicMember = (typeof memberSchema)["static"];
export type PageQuery = (typeof pageQuerySchema)["static"];
