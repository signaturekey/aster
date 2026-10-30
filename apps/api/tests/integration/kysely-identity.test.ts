import { afterAll, expect, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { migrateDatabase } from "@api/db/migrate";
import { createSqlAuth } from "@api/modules/identity/kysely-service";
import type { Auth } from "@api/modules/identity/service";
import { sql } from "kysely";

const url = process.env.DATABASE_URL;
if (
  process.env.ASTER_INTEGRATION !== "1" ||
  !url ||
  new URL(url).pathname !== "/aster_test"
)
  throw new Error("Use the isolated integration runner");
const schema = `identity_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = createSqlDatabase(url);
await sql`create schema ${sql.id(schema)}`.execute(admin);
const scopedUrl = new URL(url);
scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
const db = createSqlDatabase(scopedUrl.toString());
afterAll(async () => {
  await db.destroy();
  await sql`drop schema ${sql.id(schema)} cascade`.execute(admin);
  await admin.destroy();
});
await migrateDatabase(db);

async function columns() {
  return (
    await sql<{ table_name: string; column_name: string; data_type: string }>`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = ${schema} order by table_name, ordinal_position
    `.execute(db)
  ).rows;
}
const baselineColumns = await columns();
const origin = "http://localhost:3000";
const config = {
  baseURL: origin,
  secret: "integration-only-secret-at-least-32-characters",
  trustedOrigins: [origin],
};
const auth = createSqlAuth(db, config);
// Options deliberately differ during the staged port; the public handler,
// session API and inferred actor/session types must remain route-compatible.
const routeAuth: Pick<Auth, "handler" | "api" | "$Infer"> = auth;

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        origin: options.origin ?? origin,
        "user-agent": "Aster SQL integration",
        "x-forwarded-for": "192.0.2.7",
        ...options.headers,
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    }),
  );
}

function sessionCookie(response: Response) {
  const setCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  if (!setCookie) throw new Error("Expected session cookie");
  return { cookie: setCookie.split(";")[0]!, setCookie };
}

async function register() {
  const email = `${crypto.randomUUID()}@example.test`;
  const password = "integration-password-123";
  const response = await request("/sign-up/email", {
    method: "POST",
    body: { email, password, name: "Aster SQL Test" },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    token: string;
    user: typeof auth.$Infer.Session.user;
  };
  expect(body.user.email).toBe(email);
  expect(body.user.emailVerified).toBe(false);
  expect(typeof body.user.createdAt).toBe("string");
  expect(body.user).not.toHaveProperty("email_verified");
  expect(body.user).not.toHaveProperty("password");
  return { ...body, email, password, ...sessionCookie(response) };
}

test("shared Kysely configuration and native registration use physical snake_case columns", async () => {
  expect(auth.options.database.db).toBe(db);
  expect(auth.options.database.type).toBe("postgres");
  expect(auth.options.database.transaction).toBe(true);
  const user = await register();
  expect(user.setCookie).toContain("HttpOnly");
  expect(user.setCookie).toContain("SameSite=Lax");
  expect(user.setCookie).toContain("Path=/");
  expect(user.setCookie.toLowerCase()).not.toContain("secure");
  const storedUser = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", user.user.id)
    .executeTakeFirstOrThrow();
  expect(storedUser.email_verified).toBe(false);
  expect(storedUser.created_at).toBeInstanceOf(Date);
  expect(storedUser.updated_at).toBeInstanceOf(Date);
  const account = await db
    .selectFrom("accounts")
    .selectAll()
    .where("user_id", "=", user.user.id)
    .executeTakeFirstOrThrow();
  expect(account.account_id).toBe(user.user.id);
  expect(account.provider_id).toBe("credential");
  expect(account.password).toBeString();
  expect(account.password).not.toBe(user.password);
  const { password } = await auth.$context;
  expect(
    await password.verify({ hash: account.password!, password: user.password }),
  ).toBe(true);
  const session = await db
    .selectFrom("sessions")
    .selectAll()
    .where("user_id", "=", user.user.id)
    .executeTakeFirstOrThrow();
  expect(session.token).toBe(user.token);
  expect(session.ip_address).toBe("192.0.2.7");
  expect(session.user_agent).toBe("Aster SQL integration");
  expect(session.expires_at).toBeInstanceOf(Date);
  expect(session.created_at).toBeInstanceOf(Date);
  expect(session.updated_at).toBeInstanceOf(Date);
  expect(await db.selectFrom("profiles").selectAll().execute()).toEqual([]);
});

test("native sign-in, database-backed session lookup and sign-out preserve provider responses", async () => {
  const user = await register();
  const bad = await request("/sign-in/email", {
    method: "POST",
    body: { email: user.email, password: "wrong-password" },
  });
  expect(bad.status).toBe(401);
  const good = await request("/sign-in/email", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  expect(good.status).toBe(200);
  const { cookie } = sessionCookie(good);
  const response = await request("/get-session", { cookie });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.user.id).toBe(user.user.id);
  expect(body.session.userId).toBe(user.user.id);
  expect(body.session).not.toHaveProperty("user_id");
  expect(body.session).not.toHaveProperty("expires_at");
  const signedOut = await request("/sign-out", {
    method: "POST",
    cookie,
    body: {},
  });
  expect(signedOut.status).toBe(200);
  expect(await signedOut.json()).toEqual({ success: true });
  expect(sessionCookie(signedOut).setCookie).toContain("Max-Age=0");
  expect(await (await request("/get-session", { cookie })).json()).toBeNull();
  // Sign-out revokes this session, not a different registration session.
  expect(
    await routeAuth.api.getSession({
      headers: new Headers({ cookie: user.cookie }),
    }),
  ).not.toBeNull();
});

test("missing and expired sessions return null and clear stale cookies without a cache", async () => {
  expect(await (await request("/get-session")).json()).toBeNull();
  const user = await register();
  await db
    .updateTable("sessions")
    .set({ expires_at: new Date(0) })
    .where("user_id", "=", user.user.id)
    .execute();
  const expired = await request("/get-session", { cookie: user.cookie });
  expect(expired.status).toBe(200);
  expect(await expired.json()).toBeNull();
  expect(sessionCookie(expired).setCookie).toContain("Max-Age=0");
  expect(
    await db
      .selectFrom("sessions")
      .select("id")
      .where("user_id", "=", user.user.id)
      .execute(),
  ).toEqual([]);
});

test.each(["handler", "route-api"])(
  "aged sessions renew database timestamps and expose Set-Cookie through %s",
  async (boundary) => {
    const user = await register();
    const { expiresIn, updateAge } = (await auth.$context).sessionConfig;
    const agedAt = new Date(Date.now() - (updateAge + 60) * 1000);
    const oldExpiry = new Date(agedAt.getTime() + expiresIn * 1000);
    await db
      .updateTable("sessions")
      .set({ updated_at: agedAt, expires_at: oldExpiry })
      .where("token", "=", user.token)
      .execute();
    let headers: Headers;
    if (boundary === "handler") {
      const response = await request("/get-session", { cookie: user.cookie });
      expect(response.status).toBe(200);
      expect((await response.json()).user.id).toBe(user.user.id);
      headers = response.headers;
    } else {
      const result = await routeAuth.api.getSession({
        headers: new Headers({ cookie: user.cookie }),
        returnHeaders: true,
      });
      expect(result.response?.user.id).toBe(user.user.id);
      headers = result.headers;
    }
    const renewed = await db
      .selectFrom("sessions")
      .select(["expires_at", "updated_at"])
      .where("token", "=", user.token)
      .executeTakeFirstOrThrow();
    expect(renewed.expires_at.getTime()).toBeGreaterThan(oldExpiry.getTime());
    expect(renewed.updated_at.getTime()).toBeGreaterThan(agedAt.getTime());
    const cookie = headers
      .getSetCookie()
      .find((value) => value.startsWith("better-auth.session_token="));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain(`Max-Age=${expiresIn}`);
    expect(cookie?.split(";")[0]).toBe(user.cookie);
    expect(
      headers
        .getSetCookie()
        .some((value) => value.startsWith("better-auth.session_data=")),
    ).toBe(false);
  },
);

test("trusted origins, CSRF protections and HTTPS cookie settings remain enabled", async () => {
  expect(auth.options.advanced.disableOriginCheck).toBe(false);
  expect(auth.options.advanced.disableCSRFCheck).toBe(false);
  const user = await register();
  const forged = await request("/sign-out", {
    method: "POST",
    cookie: user.cookie,
    origin: "http://evil.example",
    body: {},
  });
  expect(forged.status).toBe(403);
  const csrf = await auth.handler(
    new Request(`${origin}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: user.cookie, "sec-fetch-site": "cross-site" },
    }),
  );
  expect(csrf.status).toBe(403);
  expect(
    (await (await request("/get-session", { cookie: user.cookie })).json()).user
      .id,
  ).toBe(user.user.id);
  const secureOrigin = "https://localhost:3000";
  const secureAuth = createSqlAuth(db, {
    ...config,
    baseURL: secureOrigin,
    trustedOrigins: [secureOrigin],
  });
  expect(secureAuth.options.advanced.useSecureCookies).toBe(true);
  const response = await secureAuth.handler(
    new Request(`${secureOrigin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: secureOrigin, "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Secure-better-auth.session_token="));
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("HttpOnly");
});

test("all account token fields and verification fields round-trip without enabling OAuth or mail", async () => {
  const user = await register();
  const { internalAdapter } = await auth.$context;
  const expiresAt = new Date(Date.now() + 60_000);
  const account = await internalAdapter.createAccount({
    userId: user.user.id,
    accountId: crypto.randomUUID(),
    providerId: "mapping-test-only",
    accessToken: "test-access",
    refreshToken: "test-refresh",
    idToken: "test-id",
    accessTokenExpiresAt: expiresAt,
    refreshTokenExpiresAt: expiresAt,
    scope: "test-scope",
    password: null,
  });
  const stored = await db
    .selectFrom("accounts")
    .selectAll()
    .where("id", "=", account.id)
    .executeTakeFirstOrThrow();
  expect(stored.access_token).toBe("test-access");
  expect(stored.refresh_token).toBe("test-refresh");
  expect(stored.id_token).toBe("test-id");
  expect(stored.access_token_expires_at).toEqual(expiresAt);
  expect(stored.refresh_token_expires_at).toEqual(expiresAt);
  expect(stored.scope).toBe("test-scope");
  expect(stored.created_at).toBeInstanceOf(Date);
  expect(stored.updated_at).toBeInstanceOf(Date);
  expect(
    (await internalAdapter.findAccounts(user.user.id)).find(
      (row) => row.id === account.id,
    ),
  ).toMatchObject({
    accessToken: "test-access",
    refreshToken: "test-refresh",
    idToken: "test-id",
    accessTokenExpiresAt: expiresAt,
    refreshTokenExpiresAt: expiresAt,
  });
  const identifier = crypto.randomUUID();
  const verification = await internalAdapter.createVerificationValue({
    identifier,
    value: "test-value",
    expiresAt,
  });
  const storedVerification = await db
    .selectFrom("verifications")
    .selectAll()
    .where("id", "=", verification.id)
    .executeTakeFirstOrThrow();
  expect(storedVerification).toMatchObject({
    identifier,
    value: "test-value",
    expires_at: expiresAt,
  });
  expect(storedVerification.created_at).toBeInstanceOf(Date);
  expect(storedVerification.updated_at).toBeInstanceOf(Date);
  expect(await internalAdapter.findVerificationValue(identifier)).toMatchObject(
    { id: verification.id, expiresAt },
  );
});

test("the maintained adapter rolls back multiple auth writes in a real PostgreSQL transaction", async () => {
  const { adapter } = await auth.$context;
  const email = `${crypto.randomUUID()}@example.test`;
  const identifier = crypto.randomUUID();
  const failed = adapter.transaction(async (tx) => {
    await tx.create({
      model: "user",
      data: {
        name: "Rollback",
        email,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await tx.create({
      model: "verification",
      data: {
        identifier,
        value: "rollback",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    throw new Error("Injected auth transaction failure");
  });
  // Bun types async rejection assertions as void even though they must be awaited.
  // eslint-disable-next-line @typescript-eslint/await-thenable
  await expect(failed).rejects.toThrow("Injected auth transaction failure");
  expect(
    await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", email)
      .execute(),
  ).toEqual([]);
  expect(
    await db
      .selectFrom("verifications")
      .select("id")
      .where("identifier", "=", identifier)
      .execute(),
  ).toEqual([]);
});

test("mail/recovery/cache stay disabled and auth does not generate a second schema", async () => {
  expect(auth.options.emailAndPassword.requireEmailVerification).toBe(false);
  expect("sendResetPassword" in auth.options.emailAndPassword).toBe(false);
  expect("emailVerification" in auth.options).toBe(false);
  expect("socialProviders" in auth.options).toBe(false);
  expect("secondaryStorage" in auth.options).toBe(false);
  expect(auth.options.session.cookieCache.enabled).toBe(false);
  expect(auth.options.disabledPaths).toEqual([
    "/request-password-reset",
    "/reset-password",
    "/send-verification-email",
    "/verify-email",
    "/update-user",
    "/change-email",
    "/change-password",
    "/delete-user",
  ]);
  for (const path of auth.options.disabledPaths) {
    expect(
      (
        await request(path, {
          method: "POST",
          body: { email: "nobody@example.test", redirectTo: origin },
        })
      ).status,
    ).toBe(404);
  }
  expect(await columns()).toEqual(baselineColumns);
  expect(await migrateDatabase(db)).toEqual([]);
  const history = await sql<{
    name: string;
  }>`select name from kysely_migration`.execute(db);
  expect(history.rows).toEqual([{ name: "001_initial" }]);
});
