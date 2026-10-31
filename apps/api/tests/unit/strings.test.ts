import { expect, test } from "bun:test";
import { TypeCompiler } from "elysia/type-system";
const Value = {
  Check: (schema: Parameters<typeof TypeCompiler.Compile>[0], value: unknown) =>
    TypeCompiler.Compile(schema).Check(value),
};
import { isPostgresText } from "@api/lib/strings";
import { sendMessageSchema } from "@api/modules/conversations/schemas";
import { profilePatchSchema } from "@api/modules/profiles/schemas";
import {
  applicationCreateSchema,
  projectCreateSchema,
} from "@api/modules/projects/schemas";

test("persisted strings reject NUL and lone surrogates, not valid Unicode", () => {
  for (const value of ["hello\u0000", "\ud800", "\udfff", "x\ud800y"]) {
    expect(isPostgresText(value)).toBe(false);
    expect(
      Value.Check(sendMessageSchema, { text: value, requestId: "id" }),
    ).toBe(false);
    expect(
      Value.Check(sendMessageSchema, { text: "ok", requestId: value }),
    ).toBe(false);
    for (const field of [
      "displayName",
      "bio",
      "specializationId",
      "experienceId",
    ])
      expect(Value.Check(profilePatchSchema, { [field]: value })).toBe(false);
    for (const field of ["skillIds", "goalIds", "portfolioLinks"])
      expect(Value.Check(profilePatchSchema, { [field]: [value] })).toBe(false);
    const project = {
      title: "Test",
      description: "Test",
      goalId: "startup",
      requiredRoles: ["dev"],
      requiredSkillIds: [],
    };
    for (const field of ["title", "description", "goalId"])
      expect(
        Value.Check(projectCreateSchema, { ...project, [field]: value }),
      ).toBe(false);
    for (const field of ["requiredRoles", "requiredSkillIds"])
      expect(
        Value.Check(projectCreateSchema, { ...project, [field]: [value] }),
      ).toBe(false);
    expect(Value.Check(applicationCreateSchema, { text: value })).toBe(false);
  }
  for (const value of ["🌌", "é", "  unchanged \n ", "�"]) {
    expect(isPostgresText(value)).toBe(true);
    expect(
      Value.Check(sendMessageSchema, { text: value, requestId: value }),
    ).toBe(true);
  }
  expect(
    Value.Check(profilePatchSchema, {
      portfolioLinks: ["https://example.test/\u0000"],
    }),
  ).toBe(false);
  expect(
    Value.Check(profilePatchSchema, {
      portfolioLinks: ["https://example.test/🌌"],
    }),
  ).toBe(true);
});
