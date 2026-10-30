import { expect, test } from "bun:test";
import { requireTestDatabase } from "../../../../scripts/test-database";

const testUrl = "postgresql://aster_test:local@localhost:55433/aster_test";

test("requires an explicit isolated database", () => {
  expect(() => requireTestDatabase(undefined, undefined)).toThrow("required");
  expect(() =>
    requireTestDatabase("postgresql://localhost/aster", undefined),
  ).toThrow("aster_test");
  expect(() =>
    requireTestDatabase("https://localhost/aster_test", undefined),
  ).toThrow("PostgreSQL");
  expect(() =>
    requireTestDatabase(`${testUrl}?schema=public`, undefined),
  ).toThrow("query");
});

test("rejects a working database even through host or credential aliases", () => {
  expect(() =>
    requireTestDatabase(
      testUrl,
      "postgresql://other:local@127.0.0.1:55433/aster_test",
    ),
  ).toThrow("differ");
  expect(() =>
    requireTestDatabase(testUrl, "postgresql://localhost/aster%5ftest"),
  ).toThrow("differ");
  expect(requireTestDatabase(testUrl, "postgresql://localhost/aster")).toBe(
    testUrl,
  );
});
