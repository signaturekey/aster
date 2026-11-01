import { expect, test } from "bun:test";
import { TypeCompiler } from "elysia/type-system";
import { projectCatalogueQuerySchema } from "@api/modules/projects/schemas";

const query = TypeCompiler.Compile(projectCatalogueQuerySchema);

test("catalogue accepts optional bounded text and a single goal alongside pagination", () => {
  for (const value of [
    {},
    { q: "" },
    { q: " \t\n " },
    { q: "  Проект 🌌  ", goalId: "startup" },
    { q: "x".repeat(200), goalId: "g".repeat(80), limit: 50 },
    { q: "%_\\'", cursor: "cursor", limit: 1 },
  ]) {
    expect(query.Check(value)).toBe(true);
  }
});

test("catalogue rejects oversized, non-text and PostgreSQL-unsafe filters", () => {
  for (const value of [
    { q: "x".repeat(201) },
    { q: " ".repeat(201) },
    { q: 123 },
    { q: ["one", "two"] },
    { goalId: "" },
    { goalId: "g".repeat(81) },
    { goalId: ["startup", "hackathon"] },
    { limit: 0 },
    { limit: 51 },
    { cursor: "x".repeat(513) },
  ]) {
    expect(query.Check(value)).toBe(false);
  }
  for (const text of ["\u0000", "\ud800", "\udfff", "x\ud800y"]) {
    expect(query.Check({ q: text })).toBe(false);
    expect(query.Check({ goalId: text })).toBe(false);
  }
});
