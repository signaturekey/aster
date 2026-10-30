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

test("rejects cursor IDs that PostgreSQL cannot represent", () => {
  for (const id of ["\u0000", "prefix\u0000suffix", "\ud800", "\udfff"]) {
    const cursor = encodeCursor({
      id,
      createdAt: new Date("2026-10-30T00:00:00.000Z"),
    });
    expect(() => decodeCursor(cursor)).toThrow("Cursor is invalid");
  }
});

test("shared page options reject limits before service queries", async () => {
  const { pageOptions, beforeCursor, pageResult } = await import(
    "@api/lib/pagination"
  );
  expect(pageOptions({})).toEqual({ limit: 20, cursor: undefined });
  for (const limit of [0, 51, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => pageOptions({ limit })).toThrow("Limit must be from 1 to 50");
  }
  const row = { id: "b", createdAt: new Date("2026-10-30T00:00:00.000Z") };
  expect(beforeCursor(row)).toEqual({
    OR: [
      { createdAt: { lt: row.createdAt } },
      { createdAt: row.createdAt, id: { lt: "b" } },
    ],
  });
  expect(beforeCursor(undefined)).toEqual({});
  expect(pageResult([row, { ...row, id: "a" }], 1, (item) => item)).toEqual({
    items: [row],
    nextCursor: encodeCursor(row),
  });
  expect(pageResult([row], 1, (item) => item)).toEqual({
    items: [row],
    nextCursor: null,
  });
});
