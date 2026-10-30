import { expect, spyOn, test } from "bun:test";
import { logUnexpectedError } from "@api/lib/diagnostics";
import { httpBoundary } from "@api/lib/http";
import { ProductError } from "@api/lib/errors";
import { Elysia } from "elysia";

test("diagnostics retain operation and error classification without private exception data", () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const error = Object.assign(
      new Error("postgresql://user:secret@localhost/db SELECT private_text"),
      { code: "23505" },
    );
    logUnexpectedError(error, { operation: "sse.delivery" });
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        operation: "sse.delivery",
        kind: "Error",
        code: "23505",
      }),
    );
    logUnexpectedError(
      { code: "private-cookie-value" },
      { operation: "sse.recipients" },
    );
    expect(log.mock.calls[1]?.[0]).not.toContain("private-cookie-value");
  } finally {
    log.mockRestore();
  }
});

test("HTTP boundary logs unexpected failures safely and leaves expected errors quiet", async () => {
  const log = spyOn(console, "error").mockImplementation(() => {});
  const app = new Elysia()
    .use(httpBoundary([]))
    .get("/unexpected", () => {
      throw new Error("secret database password");
    })
    .get("/expected", () => {
      throw new ProductError(409, "CONFLICT", "Expected conflict");
    });
  try {
    const response = await app.handle(
      new Request("http://localhost/unexpected?token=private", {
        headers: { cookie: "private-session" },
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An internal error occurred" },
    });
    expect(log).toHaveBeenCalledTimes(1);
    const entry = String(log.mock.calls[0]?.[0]);
    expect(entry).toContain('"method":"GET"');
    expect(entry).toContain('"path":"/unexpected"');
    expect(entry).not.toContain("secret");
    expect(entry).not.toContain("private");
    expect(
      (await app.handle(new Request("http://localhost/expected"))).status,
    ).toBe(409);
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
  }
});
