import { afterAll } from "bun:test";
import { createApp } from "@api/app";
import { createDatabase } from "@api/db/client";
import { createAuth } from "@api/modules/identity/service";

if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !process.env.DATABASE_URL ||
  new URL(process.env.DATABASE_URL).pathname !== "/aster_test"
) {
  throw new Error("Use bun run test:integration");
}
export const db = createDatabase(process.env.DATABASE_URL);
afterAll(() => db.destroy());
export const origin = "http://localhost:3000";
export const auth = createAuth(db, {
  baseURL: origin,
  secret: "integration-only-secret-at-least-32-characters",
  trustedOrigins: [origin],
});
export const app = createApp(db, auth, [origin]);

export async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
  } = {},
) {
  return app.handle(
    new Request(`${origin}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        origin: options.origin ?? origin,
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    }),
  );
}

export async function register() {
  const email = `${crypto.randomUUID()}@example.test`;
  const password = "integration-password-123";
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    body: { email, password, name: "Aster Test" },
  });
  if (response.status !== 200)
    throw new Error(
      `Registration failed: ${response.status} ${await response.text()}`,
    );
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const body = (await response.json()) as { user: { id: string } };
  return {
    id: body.user.id,
    email,
    password,
    cookie,
    setCookie: response.headers.get("set-cookie") ?? "",
  };
}
