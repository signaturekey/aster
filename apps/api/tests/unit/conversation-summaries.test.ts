import { expect, test } from "bun:test";
import { encodeCursor } from "@api/lib/pagination";
import {
  decodeConversationCursor,
  encodeConversationCursor,
} from "@api/modules/conversations/summaries";

const timestamp = "2026-10-30T00:00:00.000Z";
const encoded = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

test("conversation activity cursor is canonical and distinct from creation cursors", () => {
  const row = { id: "tie-breaker", lastActivityAt: new Date(timestamp) };
  expect(decodeConversationCursor(encodeConversationCursor(row))).toEqual(row);
  expect(decodeConversationCursor(undefined)).toBeUndefined();
  for (const cursor of [
    encodeCursor({ id: row.id, createdAt: row.lastActivityAt }),
    encoded(["conversation-activity-v0", timestamp, "id"]),
    encoded(["conversation-activity-v1", timestamp, "id", "extra"]),
    encoded(["conversation-activity-v1", "2026-10-30", "id"]),
    encoded(["conversation-activity-v1", timestamp, ""]),
    encoded(["conversation-activity-v1", timestamp, "x".repeat(129)]),
    "",
    "!",
    "a".repeat(513),
    `${encodeConversationCursor(row)}=`,
  ])
    expect(() => decodeConversationCursor(cursor)).toThrow("Cursor is invalid");
});

test("activity cursor retains PostgreSQL date and safe text guards", () => {
  for (const id of ["\u0000", "prefix\u0000suffix", "\ud800", "\udfff"]) {
    expect(() =>
      decodeConversationCursor(
        encoded(["conversation-activity-v1", timestamp, id]),
      ),
    ).toThrow("Cursor is invalid");
  }
  for (const time of [
    "-005000-01-01T00:00:00.000Z",
    "-004713-11-23T23:59:59.999Z",
    "invalid",
  ])
    expect(() =>
      decodeConversationCursor(
        encoded(["conversation-activity-v1", time, "boundary"]),
      ),
    ).toThrow("Cursor is invalid");
  for (const time of [
    "-004713-11-24T00:00:00.000Z",
    "0000-01-01T00:00:00.000Z",
    "+010000-01-01T00:00:00.000Z",
    "+275760-09-13T00:00:00.000Z",
  ]) {
    const row = { id: "boundary", lastActivityAt: new Date(time) };
    expect(decodeConversationCursor(encodeConversationCursor(row))).toEqual(
      row,
    );
  }
});
