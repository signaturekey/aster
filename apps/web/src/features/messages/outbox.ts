import { useSyncExternalStore } from "react";
import type { Message, SendAttempt } from "@web/entities/conversation/types";
import { isAcknowledged } from "@web/entities/conversation/reconcile";
import type { SessionScope } from "@web/shared/lib/session-scope";

export function validateMessage(text: string): true | string {
  if (!text.trim()) return "Напишите сообщение.";
  // The service's current ceiling is UTF-16 length (in addition to schema
  // validation), so use its stricter bound without truncating retry payloads.
  if (text.length > 4000) return "Не больше 4000 символов.";
  if (text.includes("\u0000") || !text.isWellFormed())
    return "Текст содержит неподдерживаемые символы.";
  return true;
}
export function newAttempt(
  conversationId: string,
  senderId: string,
  text: string,
  requestId: string,
  createdAt = new Date().toISOString(),
): SendAttempt {
  if (validateMessage(text) !== true) throw new Error("Invalid message");
  return Object.freeze({
    conversationId,
    senderId,
    text,
    requestId,
    createdAt,
    status: "pending",
  });
}
export function retryAttempt(attempt: SendAttempt): SendAttempt {
  // Retry never accepts editor text. Edits are always a new submission/ID.
  return Object.freeze({ ...attempt, status: "pending", error: undefined });
}

export class MessageOutbox {
  private entries: readonly SendAttempt[] = [];
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.entries;
  private publish(entries: readonly SendAttempt[]) {
    this.entries = entries;
    for (const listener of this.listeners) listener();
  }
  put(attempt: SendAttempt) {
    this.publish([
      ...this.entries.filter(
        (item) =>
          item.requestId !== attempt.requestId ||
          item.conversationId !== attempt.conversationId,
      ),
      attempt,
    ]);
  }
  update(
    attempt: SendAttempt,
    patch: Partial<Pick<SendAttempt, "status" | "message" | "error">>,
  ) {
    // An HTTP history refresh may already have retired this attempt.
    if (
      this.entries.some(
        (item) =>
          item.requestId === attempt.requestId &&
          item.conversationId === attempt.conversationId,
      )
    )
      this.put(Object.freeze({ ...attempt, ...patch }));
  }
  prune(messages: readonly Message[]) {
    const next = this.entries.filter(
      (attempt) => !isAcknowledged(attempt, messages),
    );
    if (next.length !== this.entries.length) this.publish(next);
  }
  clearThread(conversationId: string) {
    this.publish(
      this.entries.filter((item) => item.conversationId !== conversationId),
    );
  }
  clear = () => this.publish([]);
}
const boxes = new WeakMap<SessionScope, MessageOutbox>();
export function getOutbox(scope: SessionScope) {
  let box = boxes.get(scope);
  if (!box) {
    box = new MessageOutbox();
    boxes.set(scope, box);
    scope.onReset(box.clear);
  }
  return box;
}
export function useOutbox(scope: SessionScope) {
  const box = getOutbox(scope);
  const attempts = useSyncExternalStore(box.subscribe, box.snapshot);
  return { box, attempts };
}
