import { profileSchema } from "@api/modules/profiles/schemas";
import { t } from "elysia";

export const discoveryQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 50, default: 20 })),
  cursor: t.Optional(t.String({ maxLength: 512 })),
  specializationId: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  experienceId: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  skillIds: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 80 }), {
      maxItems: 20,
      uniqueItems: true,
    }),
  ),
  goalIds: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 80 }), {
      maxItems: 5,
      uniqueItems: true,
    }),
  ),
});
export const discoveryPageSchema = t.Object({
  items: t.Array(profileSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
});
export const matchSchema = t.Object({
  id: t.String(),
  participantIds: t.Array(t.String(), { minItems: 2, maxItems: 2 }),
  conversationId: t.String(),
  createdAt: t.String({ format: "date-time" }),
});
export const matchPageSchema = t.Object({
  items: t.Array(matchSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
});
export const decisionSchema = t.Object(
  { value: t.Union([t.Literal("interested"), t.Literal("skipped")]) },
  { additionalProperties: false },
);
export const decisionResultSchema = t.Object({
  value: t.Union([t.Literal("interested"), t.Literal("skipped")]),
  match: t.Union([matchSchema, t.Null()]),
});
export type DiscoveryQuery = (typeof discoveryQuerySchema)["static"];
