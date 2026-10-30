// Browser-safe runtime contract: never import Elysia, the API app, or Prisma.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const conversationEventSchema = Type.Object(
  {
    type: Type.Literal("message.created"),
    conversationId: Type.String({ minLength: 1, maxLength: 128 }),
    messageId: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type ConversationEvent = Static<typeof conversationEventSchema>;

export function isConversationEvent(
  value: unknown,
): value is ConversationEvent {
  return Value.Check(conversationEventSchema, value);
}
