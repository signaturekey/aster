import { describe, expect, expectTypeOf, it } from "bun:test";
import { treaty } from "@elysia/eden";
import { app } from "@/app";

describe("GET /health", () => {
  it("returns the server status as JSON", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("exposes a typed health response through Eden", async () => {
    const client = treaty(app);
    const { data, error, status } = await client.health.get();

    expect(status).toBe(200);
    expect(error).toBeNull();
    expect(data).toEqual({ status: "ok" });

    if (error) throw error;
    expectTypeOf(data).toEqualTypeOf<{ status: "ok" }>();
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    const response = await app.handle(new Request("http://localhost/unknown"));

    expect(response.status).toBe(404);
  });
});
