import type { SqlDatabase } from "@api/db/kysely";
import { betterAuth } from "better-auth";

export function createAuth(
  db: SqlDatabase,
  config: { baseURL: string; secret: string; trustedOrigins: string[] },
) {
  return betterAuth({
    appName: "Aster",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    // The application owns this connection and the committed SQL migrations.
    // Better Auth uses its maintained adapter, not a separate pool or generator.
    database: { db, type: "postgres", transaction: true },
    user: {
      modelName: "users",
      fields: {
        name: "name",
        email: "email",
        emailVerified: "email_verified",
        image: "image",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "sessions",
      fields: {
        expiresAt: "expires_at",
        token: "token",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        scope: "scope",
        password: "password",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "verifications",
      fields: {
        identifier: "identifier",
        value: "value",
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: new URL(config.baseURL).protocol === "https:",
    },
    disabledPaths: [
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
      "/update-user",
      "/change-email",
      "/change-password",
      "/delete-user",
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
