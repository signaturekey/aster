import { expect, test } from "bun:test";
import { createApiClient } from "../src/index";

test("passes credentialed browser configuration to fetch", async () => {
  let credentials: RequestCredentials | undefined;
  const client = createApiClient("http://localhost:3000", {
    fetch: { credentials: "include" },
    fetcher: (async (_input, init) => {
      credentials = init?.credentials;
      return Response.json({ status: "ok" });
    }) as typeof fetch,
  });
  const result = await client.health.get();
  expect(credentials).toBe("include");
  expect(result.data).toEqual({ status: "ok" });
});
