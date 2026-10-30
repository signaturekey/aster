import { expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "@api/lib/pagination";

test("cursor preserves timestamp and deterministic id tie-breaker", () => {
  const row = {
    id: "tie-breaker",
    createdAt: new Date("2026-10-30T00:00:00.000Z"),
  };
  expect(decodeCursor(encodeCursor(row))).toEqual(row);
  expect(decodeCursor(undefined)).toBeUndefined();
});

test("rejects malformed oversized noncanonical and invalid-date cursors", () => {
  for (const value of [
    "",
    "!",
    "a".repeat(513),
    Buffer.from('["bad","id"]').toString("base64url"),
    Buffer.from('["2026-10-30","id"]').toString("base64url"),
  ]) {
    expect(() => decodeCursor(value)).toThrow("Cursor is invalid");
  }
});
