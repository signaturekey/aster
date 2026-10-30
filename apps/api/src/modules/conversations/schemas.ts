import { t } from "elysia";

export const conversationParamsSchema = t.Object({
  conversationId: t.String({ minLength: 1, maxLength: 128 }),
});
export const sendMessageSchema = t.Object(
  {
    text: t.String({ minLength: 1, maxLength: 4000 }),
    requestId: t.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export const messageSchema = t.Object({
  id: t.String(),
  conversationId: t.String(),
  senderId: t.String(),
  requestId: t.String(),
  text: t.String(),
  createdAt: t.String({ format: "date-time" }),
});
export const messagePageSchema = t.Object({
  items: t.Array(messageSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
});
export const conversationPageSchema = t.Object({
  items: t.Array(
    t.Object({
      id: t.String(),
      matchId: t.Union([t.String(), t.Null()]),
      projectId: t.Union([t.String(), t.Null()]),
      createdAt: t.String({ format: "date-time" }),
    }),
  ),
  nextCursor: t.Union([t.String(), t.Null()]),
});
