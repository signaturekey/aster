import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  discoveryKey,
  filterCount,
  filterProblem,
  filtersToSearch,
  normalizeFilters,
} from "./filters";

describe("discovery URL filters", () => {
  test("maps AND categories, ALL skill IDs and ANY goal IDs without translating IDs to labels", () => {
    const filters = normalizeFilters(
      new URLSearchParams(
        "specializationId=backend&experienceId=senior&skillIds=typescript&skillIds=postgres&goalIds=startup&goalIds=hackathon",
      ),
    );
    expect(filters).toEqual({
      specializationId: "backend",
      experienceId: "senior",
      skillIds: ["postgres", "typescript"],
      goalIds: ["hackathon", "startup"],
    });
    expect(normalizeFilters(filtersToSearch(filters))).toEqual(filters);
    expect(filterCount(filters)).toBe(6);
  });
  test("normalizes blank, reordered and duplicate values to one stable query context", () => {
    const first = normalizeFilters(
      new URLSearchParams(
        "skillIds=b&skillIds=a&skillIds=a&skillIds=%20&goalIds=%20x%20&experienceId=%20",
      ),
    );
    const second = normalizeFilters(
      new URLSearchParams("skillIds=a&skillIds=b&goalIds=x"),
    );
    expect(first).toEqual(second);
    expect(discoveryKey("actor", first)).toEqual(discoveryKey("actor", second));
    expect(normalizeFilters(new URLSearchParams())).toEqual({});
  });
  test("changes filters with a fresh cursor and preserves unrelated URL parameters", () => {
    const current = new URLSearchParams(
      "skillIds=old&goalIds=old&specializationId=old&experienceId=old&cursor=old-page&other=kept",
    );
    const next = filtersToSearch({ skillIds: ["new"] }, current);
    expect(next.toString()).toBe("other=kept&skillIds=new");
    expect(current.get("cursor")).toBe("old-page");
  });
  test("new filters and accounts cannot inherit another context’s cursor pages", () => {
    const client = new QueryClient();
    client.setQueryData(discoveryKey("actor", { skillIds: ["a"] }), {
      pages: [{ nextCursor: "old" }],
      pageParams: [undefined],
    });
    expect(
      client.getQueryData(discoveryKey("actor", { skillIds: ["b"] })),
    ).toBeUndefined();
    expect(
      client.getQueryData(discoveryKey("another", { skillIds: ["a"] })),
    ).toBeUndefined();
    client.clear();
  });
  test("does not silently drop unknown IDs, overflow or invalid IDs to widen the search", () => {
    const unknown = normalizeFilters(new URLSearchParams("skillIds=unknown"));
    expect(unknown.skillIds).toEqual(["unknown"]);
    expect(filterProblem(unknown)).toBeNull();
    expect(
      filterProblem({ skillIds: Array.from({ length: 21 }, (_, i) => `${i}`) }),
    ).not.toBeNull();
    expect(
      filterProblem({ goalIds: ["1", "2", "3", "4", "5", "6"] }),
    ).not.toBeNull();
    expect(filterProblem({ specializationId: "a".repeat(81) })).not.toBeNull();
    expect(filterProblem({ specializationId: "\u0000" })).not.toBeNull();
    expect(
      filterProblem({
        skillIds: Array.from({ length: 20 }, (_, i) => `${i}`),
        goalIds: ["1", "2", "3", "4", "5"],
      }),
    ).toBeNull();
  });
});
