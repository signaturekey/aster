import type {
  Conversation,
  Message,
  SendAttempt,
} from "@web/entities/conversation/types";

const compare = (
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
const requestKey = (
  message: Pick<Message, "conversationId" | "senderId" | "requestId">,
) =>
  JSON.stringify([message.conversationId, message.senderId, message.requestId]);

export function restartPages<T, P>(data: { pages: T[]; pageParams: P[] }) {
  return {
    pages: data.pages.slice(0, 1),
    pageParams: data.pageParams.slice(0, 1),
  };
}

export function mergeSummaries(
  pages: ReadonlyArray<{ items: Conversation[] }>,
): Conversation[] {
  const items = new Map<string, Conversation>();
  for (const page of pages)
    for (const item of page.items) {
      const previous = items.get(item.id);
      if (!previous || item.lastActivityAt > previous.lastActivityAt)
        items.set(item.id, item);
    }
  return [...items.values()].sort(
    (a, b) =>
      Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) ||
      b.id.localeCompare(a.id),
  );
}

export function mergeMessages(
  pages: ReadonlyArray<{ items: Message[] }>,
  attempts: readonly SendAttempt[] = [],
) {
  const messages = new Map<string, Message>();
  const requests = new Set<string>();
  // HTTP records win over local acknowledgements. Request identity includes the
  // sender: different members may legitimately choose the same request ID.
  for (const message of [
    ...pages.flatMap((page) => page.items),
    ...attempts.flatMap((attempt) =>
      attempt.message ? [attempt.message] : [],
    ),
  ]) {
    const identity = requestKey(message);
    if (messages.has(message.id) || requests.has(identity)) continue;
    messages.set(message.id, message);
    requests.add(identity);
  }
  return {
    saved: [...messages.values()].sort(compare),
    unsaved: attempts.filter(
      (attempt) =>
        !requests.has(requestKey(attempt)) && attempt.status !== "saved",
    ),
  };
}

export function isAcknowledged(
  attempt: SendAttempt,
  messages: readonly Message[],
) {
  return messages.some(
    (message) => requestKey(message) === requestKey(attempt),
  );
}

export const conversationTitle = (conversation: Conversation) =>
  conversation.kind === "direct"
    ? conversation.peer.displayName
    : conversation.project.title;
