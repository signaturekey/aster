import { postgresText } from "@api/lib/strings";
import { pageQuerySchema } from "@api/lib/pagination";
import { profileSchema } from "@api/modules/profiles/schemas";
import { t } from "elysia";

const idSchema = postgresText({ minLength: 1, maxLength: 128 });
const dictionaryIdSchema = postgresText({ minLength: 1, maxLength: 80 });
const timestampSchema = postgresText({ format: "date-time" });
// Bound the supplied text before trimming in the service; blank means no search.
export const projectCatalogueQuerySchema = t.Object({
  ...pageQuerySchema.properties,
  q: t.Optional(postgresText({ maxLength: 200 })),
  goalId: t.Optional(dictionaryIdSchema),
});
export type ProjectCatalogueQuery =
  (typeof projectCatalogueQuerySchema)["static"];
// Explicit engineering limits: title 120, description 5,000, 1–10 roles
// of 80 characters, 20 unique skills, and application text 2,000 characters.
const recruitmentFields = {
  title: postgresText({ minLength: 1, maxLength: 120, pattern: "\\S" }),
  description: postgresText({ minLength: 1, maxLength: 5000, pattern: "\\S" }),
  goalId: dictionaryIdSchema,
  requiredRoles: t.Array(
    postgresText({ minLength: 1, maxLength: 80, pattern: "\\S" }),
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
  { text: postgresText({ minLength: 1, maxLength: 2000, pattern: "\\S" }) },
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
    text: postgresText({ minLength: 1, maxLength: 2000 }),
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
  nextCursor: t.Union([postgresText(), t.Null()]),
});
export const applicationPageSchema = t.Object({
  items: t.Array(applicationSchema, { maxItems: 50 }),
  nextCursor: t.Union([postgresText(), t.Null()]),
});
export const memberPageSchema = t.Object({
  items: t.Array(memberSchema, { maxItems: 50 }),
  nextCursor: t.Union([postgresText(), t.Null()]),
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
