import { expect, test } from "bun:test";
import { mergeMessages, mergeSummaries, restartPages } from "./reconcile";
import type { Conversation, Message } from "./types";

export const message = (
  id: string,
  requestId = id,
  senderId = "me",
): Message => ({
  id,
  requestId,
  senderId,
  conversationId: "thread",
  text: id,
  createdAt: `2026-10-31T12:00:0${id}.000Z`,
});
const summary = (id: string, lastActivityAt: string): Conversation => ({
  id,
  createdAt: "2026-10-31T00:00:00.000Z",
  lastActivityAt,
  latestMessage: null,
  kind: "direct",
  matchId: "match",
  projectId: null,
  project: null,
  peer: { userId: "peer", displayName: "Имя" },
});

test("history pages are chronological, overlap and acknowledgements deduplicate by ID/request scoped to sender", () => {
  const result = mergeMessages(
    [
      { items: [message("3"), message("2")] },
      { items: [message("2"), message("1")] },
    ],
    [
      { ...message("3"), status: "saved", message: message("3") },
      { ...message("4", "3"), status: "failed" },
      { ...message("5", "3", "other"), status: "failed" },
    ],
  );
  expect(result.saved.map((item) => item.id)).toEqual(["1", "2", "3"]);
  expect(result.unsaved.map((item) => item.senderId)).toEqual(["other"]);
});
test("event/refetch before acknowledgement and acknowledgement before refetch each render once", () => {
  const saved = message("1", "request");
  const attempt = { ...saved, status: "pending" as const };
  expect(
    mergeMessages([{ items: [saved, saved] }], [attempt]).unsaved,
  ).toHaveLength(0);
  const acknowledged = { ...attempt, status: "saved" as const, message: saved };
  expect(mergeMessages([], [acknowledged]).saved).toEqual([saved]);
  expect(mergeMessages([{ items: [saved] }], [acknowledged]).saved).toEqual([
    saved,
  ]);
});
test("activity restart drops old page cursors without mutating the cached chain", () => {
  const original = {
    pages: ["first", "second"],
    pageParams: [undefined, "stale"],
  };
  expect(restartPages(original)).toEqual({
    pages: ["first"],
    pageParams: [undefined],
  });
  expect(original.pages).toHaveLength(2);
});

test("activity summary overlaps dedupe newest versions and use ID for activity ties", () => {
  const early = "2026-10-30T00:00:00.000Z";
  const late = "2026-10-31T00:00:00.000Z";
  const items = mergeSummaries([
    { items: [summary("a", early), summary("b", late)] },
    { items: [summary("a", late), summary("c", early)] },
  ]);
  expect(items.map((item) => item.id)).toEqual(["b", "a", "c"]);
  expect(items[1]?.lastActivityAt).toBe(late);
});
