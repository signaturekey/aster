import { expect, test } from "bun:test";
import {
  getOutbox,
  MessageOutbox,
  newAttempt,
  retryAttempt,
  validateMessage,
} from "./outbox";
import { SessionScope } from "@web/shared/lib/session-scope";
import type { Message } from "@web/entities/conversation/types";

const attempt = () =>
  newAttempt(
    "thread",
    "me",
    "  Исходный текст\n",
    "request",
    "2026-10-31T00:00:00.000Z",
  );
const saved = (): Message => ({ ...attempt(), id: "persisted" });

test("4000-character, nonblank and lossless text boundaries match service", () => {
  expect(validateMessage(" / ")).toBe(true);
  for (const text of ["", " \n\t", "x".repeat(4001), "\u0000", "\ud800"])
    expect(validateMessage(text)).not.toBe(true);
  expect(validateMessage("x".repeat(4000))).toBe(true);
  expect(validateMessage("😀".repeat(2000))).toBe(true);
  expect(validateMessage("😀".repeat(2001))).not.toBe(true);
});
test("lost response retry retains immutable payload/ID; edited payload is a new attempt", () => {
  const original = attempt();
  const retry = retryAttempt({
    ...original,
    status: "failed",
    error: new Error("offline"),
  });
  expect(Object.isFrozen(original)).toBe(true);
  expect(Object.isFrozen(retry)).toBe(true);
  expect(retry.requestId).toBe(original.requestId);
  expect(retry.text).toBe(original.text);
  const edited = newAttempt("thread", "me", "Изменённый текст", "new-request");
  expect(edited.requestId).not.toBe(retry.requestId);
  expect(edited.text).not.toBe(retry.text);
});
test("outbox keeps failed text across thread navigation and retires event/HTTP confirmations", () => {
  const box = new MessageOutbox();
  const original = attempt();
  box.put(original);
  box.update(original, { status: "failed", error: new Error("lost response") });
  expect(box.snapshot()[0]?.text).toBe(original.text);
  box.put(retryAttempt(box.snapshot()[0]!));
  expect(box.snapshot()).toHaveLength(1);
  box.prune([saved()]);
  expect(box.snapshot()).toHaveLength(0);
  box.update(original, { status: "saved", message: saved() });
  expect(box.snapshot()).toHaveLength(0);
});
test("scope owns separate thread drafts and clears attempts/drafts on logout; late results cannot restore entries", async () => {
  const scope = new SessionScope();
  const box = getOutbox(scope);
  scope.setDraft("message:one", "Первый");
  scope.setDraft("message:two", "Второй");
  expect(scope.draft("message:one")).toBe("Первый");
  expect(scope.draft("message:two")).toBe("Второй");
  box.put(attempt());
  let resolve!: (message: Message) => void;
  const request = scope.run(
    () =>
      new Promise<Message>((done) => {
        resolve = done;
      }),
  );
  scope.reset();
  resolve(saved());
  const rejected = await request.then(
    () => null,
    (error: unknown) => error,
  );
  expect(rejected).toBeInstanceOf(Error);
  expect(box.snapshot()).toEqual([]);
  expect(scope.draft("message:one")).toBe("");
  box.update(attempt(), { status: "saved", message: saved() });
  expect(box.snapshot()).toEqual([]);
});
