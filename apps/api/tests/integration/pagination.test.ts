import { expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "@api/lib/pagination";
import { sql } from "kysely";
import { db, register, request } from "./helpers";

const cursorFor = (time: string) =>
  encodeCursor({ id: "cursor-boundary", createdAt: new Date(time) });

test("HTTP pagination rejects dates outside PostgreSQL before page queries", async () => {
  const user = await register();
  for (const time of [
    "-005000-01-01T00:00:00.000Z",
    "-004713-11-23T23:59:59.999Z",
  ]) {
    const cursor = cursorFor(time);
    for (const path of [
      "/api/v1/conversations",
      "/api/v1/matches",
      "/api/v1/projects",
      "/api/v1/me/projects",
      "/api/v1/me/applications",
    ]) {
      const response = await request(`${path}?cursor=${cursor}`, {
        cookie: user.cookie,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_CURSOR" },
      });
    }
  }
});

test("accepted cursor boundaries bind successfully through pg and HTTP page queries", async () => {
  const user = await register();
  for (const time of [
    "-004713-11-24T00:00:00.000Z",
    "0000-01-01T00:00:00.000Z",
    "+010000-01-01T00:00:00.000Z",
    "+275760-09-13T00:00:00.000Z",
  ]) {
    const cursor = cursorFor(time);
    const decoded = decodeCursor(cursor);
    if (!decoded) throw new Error("Missing decoded cursor");
    // Exercise actual driver encoding rather than only comparing JS dates.
    // Read-only SQL cannot change the disposable database's existing records.
    const result = await sql<{ valid: boolean }>`
      select isfinite(${decoded.createdAt}::timestamptz) as valid
    `.execute(db);
    expect(result.rows[0]?.valid).toBe(true);
    for (const path of ["/api/v1/conversations", "/api/v1/me/projects"]) {
      const response = await request(`${path}?cursor=${cursor}`, {
        cookie: user.cookie,
      });
      expect(response.status).toBe(200);
      expect((await response.json()).items).toEqual([]);
    }
  }
});
