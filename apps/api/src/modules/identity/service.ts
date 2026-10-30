import type { Database } from "@api/db/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

export function createAuth(
  db: Database,
  config: { baseURL: string; secret: string; trustedOrigins: string[] },
) {
  return betterAuth({
    appName: "Aster",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    session: { cookieCache: { enabled: false } },
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
    // Product account reads initialize the optional profile idempotently.
  });
}

export type Auth = ReturnType<typeof createAuth>;
