import { expect, test } from "bun:test";
import { auth, db, origin, register, request } from "./helpers";

test("email/password registration, cookie sessions, bad credentials and sign-out", async () => {
  const user = await register();
  expect(user.setCookie).toContain("HttpOnly");
  expect(user.setCookie.toLowerCase()).not.toContain("secure");
  const sessionResponse = await request("/api/auth/get-session", {
    cookie: user.cookie,
  });
  expect(sessionResponse.status).toBe(200);
  const sessionBody = await sessionResponse.json();
  expect(sessionBody.user.id).toBe(user.id);
  expect(sessionBody.session.userId).toBe(user.id);
  const me = await request("/api/v1/me", { cookie: user.cookie });
  expect(me.status).toBe(200);
  expect((await me.json()).email).toBe(user.email);
  const bad = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: user.email, password: "wrong-password" },
  });
  expect(bad.status).toBe(401);
  const good = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  expect(good.status).toBe(200);
  const account = await db
    .selectFrom("accounts")
    .select("password")
    .where("user_id", "=", user.id)
    .executeTakeFirstOrThrow();
  expect(account.password).not.toBe(user.password);
  expect(
    (
      await request("/api/auth/sign-out", {
        method: "POST",
        cookie: user.cookie,
        body: {},
      })
    ).status,
  ).toBe(200);
  expect((await request("/api/v1/me", { cookie: user.cookie })).status).toBe(
    401,
  );
});

test("missing/expired sessions deny access and untrusted origins cannot mutate", async () => {
  expect((await request("/api/v1/me")).status).toBe(401);
  const user = await register();
  expect(
    (
      await request("/api/v1/me/profile", {
        method: "PATCH",
        cookie: user.cookie,
        origin: "http://evil.example",
        body: { displayName: "Forged" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request("/api/auth/sign-out", {
        method: "POST",
        cookie: user.cookie,
        origin: "http://evil.example",
        body: {},
      })
    ).status,
  ).toBe(403);
  expect((await request("/api/v1/me", { cookie: user.cookie })).status).toBe(
    200,
  );
  await db
    .updateTable("sessions")
    .set({ expires_at: new Date(0) })
    .where("user_id", "=", user.id)
    .execute();
  expect((await request("/api/v1/me", { cookie: user.cookie })).status).toBe(
    401,
  );
});

test.each(["/api/v1/me", "/api/v1/events"])(
  "renews an aged session in the database and response cookie on %s",
  async (path) => {
    const user = await register();
    const { expiresIn, updateAge } = (await auth.$context).sessionConfig;
    const agedAt = new Date(Date.now() - (updateAge + 60) * 1000);
    const oldExpiry = new Date(agedAt.getTime() + expiresIn * 1000);
    const session = await db
      .selectFrom("sessions")
      .select("id")
      .where("user_id", "=", user.id)
      .executeTakeFirstOrThrow();
    await db
      .updateTable("sessions")
      .set({ updated_at: agedAt, expires_at: oldExpiry })
      .where("id", "=", session.id)
      .execute();
    const response = await request(path, { cookie: user.cookie });
    try {
      expect(response.status).toBe(200);
      const renewed = await db
        .selectFrom("sessions")
        .select(["expires_at", "updated_at"])
        .where("id", "=", session.id)
        .executeTakeFirstOrThrow();
      expect(renewed.expires_at.getTime()).toBeGreaterThan(oldExpiry.getTime());
      expect(renewed.updated_at.getTime()).toBeGreaterThan(agedAt.getTime());
      const setCookie = response.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith("better-auth.session_token="));
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain(`Max-Age=${expiresIn}`);
      expect(setCookie?.split(";")[0]).toBe(user.cookie);
      if (path === "/api/v1/events") {
        expect(response.headers.get("content-type")).toBe("text/event-stream");
        expect(response.headers.get("cache-control")).toBe(
          "no-cache, no-transform",
        );
        if (!response.body) throw new Error("Expected SSE response stream");
        const reader = response.body.getReader();
        try {
          const frame = await reader.read();
          expect(new TextDecoder().decode(frame.value)).toBe(": connected\n\n");
        } finally {
          reader.releaseLock();
        }
      } else {
        expect((await response.json()).email).toBe(user.email);
      }
    } finally {
      if (!response.body?.locked) await response.body?.cancel();
    }
  },
);

test("no mail/cache/OAuth configured and recovery routes are disabled", async () => {
  expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
  expect("sendResetPassword" in auth.options.emailAndPassword).toBe(false);
  expect("emailVerification" in auth.options).toBe(false);
  expect("socialProviders" in auth.options).toBe(false);
  expect(auth.options.session?.cookieCache?.enabled).toBe(false);
  for (const path of [
    "request-password-reset",
    "send-verification-email",
    "delete-user",
  ]) {
    expect(
      (
        await request(`/api/auth/${path}`, {
          method: "POST",
          body: { email: "nobody@example.test", redirectTo: origin },
        })
      ).status,
    ).toBe(404);
  }
});
