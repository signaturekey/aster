import { postgresText } from "@api/lib/strings";
import { t } from "elysia";

export const conversationParamsSchema = t.Object({
  conversationId: postgresText({ minLength: 1, maxLength: 128 }),
});
export const sendMessageSchema = t.Object(
  {
    text: postgresText({ minLength: 1, maxLength: 4000 }),
    requestId: postgresText({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export const messageSchema = t.Object({
  id: postgresText(),
  conversationId: postgresText(),
  senderId: postgresText(),
  requestId: postgresText(),
  text: postgresText(),
  createdAt: postgresText({ format: "date-time" }),
});
export const messagePageSchema = t.Object({
  items: t.Array(messageSchema),
  nextCursor: t.Union([postgresText(), t.Null()]),
});
export const conversationPageSchema = t.Object({
  items: t.Array(
    t.Object({
      id: postgresText(),
      matchId: t.Union([postgresText(), t.Null()]),
      projectId: t.Union([postgresText(), t.Null()]),
      createdAt: postgresText({ format: "date-time" }),
    }),
  ),
  nextCursor: t.Union([postgresText(), t.Null()]),
});
