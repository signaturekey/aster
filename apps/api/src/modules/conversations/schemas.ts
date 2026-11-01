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
const summaryFields = {
  id: postgresText(),
  createdAt: postgresText({ format: "date-time" }),
  lastActivityAt: postgresText({ format: "date-time" }),
  latestMessage: t.Union([
    t.Object({
      id: postgresText(),
      senderId: postgresText(),
      text: postgresText(),
      createdAt: postgresText({ format: "date-time" }),
    }),
    t.Null(),
  ]),
};
export const conversationSummarySchema = t.Union([
  t.Object({
    ...summaryFields,
    kind: t.Literal("direct"),
    matchId: postgresText(),
    projectId: t.Null(),
    peer: t.Object({ userId: postgresText(), displayName: postgresText() }),
    project: t.Null(),
  }),
  t.Object({
    ...summaryFields,
    kind: t.Literal("project"),
    matchId: t.Null(),
    projectId: postgresText(),
    peer: t.Null(),
    project: t.Object({ id: postgresText(), title: postgresText() }),
  }),
]);
export const conversationPageSchema = t.Object({
  items: t.Array(conversationSummarySchema),
  nextCursor: t.Union([postgresText(), t.Null()]),
});
