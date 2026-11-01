import { describe, expect, test } from "bun:test";
import {
  applicationActions,
  affectedProjectQuery,
  catalogueFilters,
  catalogueKey,
  catalogueParams,
  dedupeRows,
  parseRoles,
  projectErrorHint,
  projectMutationRoots,
  projectPayload,
  validateRoles,
  validateSkills,
  validateText,
  type ProjectValues,
} from "./helpers";
import { ApiError } from "@web/shared/api/errors";

const values: ProjectValues = {
  title: "Idea",
  description: "An idea",
  goalId: "startup",
  roles: " Developer \n\n Designer ",
  requiredSkillIds: ["ts", "ts", "sql"],
  recruitmentOpen: false,
};
describe("project catalogue URL identity", () => {
  test("normalizes text while preserving literal wildcard search", () => {
    expect(
      catalogueFilters(
        new URLSearchParams("q=++SQL%25_++&goalId=startup&cursor=old"),
      ),
    ).toEqual({ q: "SQL%_", goalId: "startup" });
    expect(catalogueFilters(new URLSearchParams())).toEqual({
      q: "",
      goalId: "",
    });
  });
  test("filter updates reset cursor and preserve text/goal AND", () => {
    const params = catalogueParams({ q: "  React %  ", goalId: "hackathon" });
    expect(params.get("q")).toBe("React %");
    expect(params.get("goalId")).toBe("hackathon");
    expect(params.has("cursor")).toBe(false);
    expect(catalogueParams({ q: "   ", goalId: "" }).toString()).toBe("");
  });
  test("keys are normalized, account-scoped and reset on either filter", () => {
    expect(catalogueKey("a", { q: " idea ", goalId: "" })).toEqual(
      catalogueKey("a", { q: "idea", goalId: "" }),
    );
    expect(catalogueKey("a", { q: "idea", goalId: "" })).not.toEqual(
      catalogueKey("b", { q: "idea", goalId: "" }),
    );
    expect(catalogueKey("a", { q: "idea", goalId: "" })).not.toEqual(
      catalogueKey("a", { q: "idea", goalId: "startup" }),
    );
  });
});
describe("project payload and schema boundaries", () => {
  test("permits zero through twenty required skills", () => {
    expect(validateSkills([])).toBe(true);
    expect(
      validateSkills(Array.from({ length: 20 }, (_, id) => String(id))),
    ).toBe(true);
    expect(
      validateSkills(Array.from({ length: 21 }, (_, id) => String(id))),
    ).not.toBe(true);
  });
  test("converts line roles, deduplicates skills, excludes recruitment from create", () => {
    expect(projectPayload(values)).toEqual({
      title: "Idea",
      description: "An idea",
      goalId: "startup",
      requiredRoles: ["Developer", "Designer"],
      requiredSkillIds: ["ts", "sql"],
    });
    expect(projectPayload(values)).not.toHaveProperty("recruitmentOpen");
    expect(values.requiredSkillIds).toHaveLength(3);
  });
  test("requires 1–10 nonblank roles with Unicode 80-character lengths", () => {
    expect(parseRoles("\n A \n\n B\n")).toEqual(["A", "B"]);
    expect(validateRoles(" \n ")).not.toBe(true);
    expect(validateRoles(Array(10).fill("role").join("\n"))).toBe(true);
    expect(validateRoles(Array(11).fill("role").join("\n"))).not.toBe(true);
    expect(validateRoles("😀".repeat(80))).toBe(true);
    expect(validateRoles("😀".repeat(81))).not.toBe(true);
    expect(validateRoles("bad\0role")).not.toBe(true);
  });
  test("matches title, description, application and search boundaries", () => {
    for (const limit of [120, 5000, 2000, 200]) {
      expect(validateText("я".repeat(limit), limit)).toBe(true);
      expect(validateText("я".repeat(limit + 1), limit)).not.toBe(true);
      expect(validateText(" \n ", limit)).not.toBe(true);
      expect(validateText("\0bad", limit)).not.toBe(true);
    }
  });
});
describe("application decisions and recovery", () => {
  test("refresh targets account-scoped project and chat resources only", () => {
    for (const root of projectMutationRoots)
      expect(affectedProjectQuery("a", ["a", root, "detail"])).toBe(true);
    expect(affectedProjectQuery("a", ["b", "projects"])).toBe(false);
    expect(affectedProjectQuery("a", ["a", "profile"])).toBe(false);
    expect(affectedProjectQuery(undefined, [undefined, "projects"])).toBe(
      false,
    );
  });
  test("closed recruitment blocks accept but not reject or withdraw", () => {
    expect(applicationActions("pending", true, false)).toEqual({
      accept: false,
      reject: true,
      withdraw: false,
    });
    expect(applicationActions("pending", false, false)).toEqual({
      accept: false,
      reject: false,
      withdraw: true,
    });
    expect(applicationActions("pending", true, true).accept).toBe(true);
  });
  test("terminal history never enables transitions or proves membership", () => {
    for (const state of ["accepted", "rejected", "withdrawn"] as const)
      expect(applicationActions(state, true, true)).toEqual({
        accept: false,
        reject: false,
        withdraw: false,
      });
  });
  test("known conflicts give actionable Russian hints without exposing raw server text", () => {
    for (const code of [
      "APPLICATION_PENDING",
      "ALREADY_MEMBER",
      "APPLICATION_DECIDED",
      "OWNER_CANNOT_LEAVE",
      "MEMBER_REQUIRED",
      "RECRUITMENT_CLOSED",
    ])
      expect(projectErrorHint(new ApiError(409, code))).toBeString();
    expect(projectErrorHint(new Error("private text"))).toBeUndefined();
    expect(projectErrorHint(new ApiError(500, "private text"))).toBeUndefined();
  });
  test("mutation refresh includes list, history, membership and chat roots", () => {
    expect(projectMutationRoots).toEqual([
      "projects",
      "applications",
      "conversations",
      "messages",
    ]);
  });
  test("cursor overlap retains first fresh row and deduplicates without totals", () => {
    expect(
      dedupeRows(
        [
          {
            items: [
              { id: "a", text: "new" },
              { id: "b", text: "b" },
            ],
          },
          {
            items: [
              { id: "a", text: "old" },
              { id: "c", text: "c" },
            ],
          },
        ],
        (row) => row.id,
      ),
    ).toEqual([
      { id: "a", text: "new" },
      { id: "b", text: "b" },
      { id: "c", text: "c" },
    ]);
    expect(dedupeRows(undefined, (row: { id: string }) => row.id)).toEqual([]);
  });
});
