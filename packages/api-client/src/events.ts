// Events are lossy notifications, not history. On reconnect fetch HTTP history;
// merge history and live notifications by messageId, never by arrival order.
export {
  type ConversationEvent,
  conversationEventSchema,
  isConversationEvent,
} from "@aster/contracts/events";
