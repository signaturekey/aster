import { ProductError } from "@api/lib/errors";
import type { Auth } from "@api/modules/identity/service";
import { Elysia } from "elysia";

export function identityGuard(auth: Auth, trustedOrigins: string[]) {
  return new Elysia({ name: "identity-guard" }).resolve(
    { as: "scoped" },
    async ({ request }) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");
        const site = request.headers.get("sec-fetch-site");
        if (
          (origin && !trustedOrigins.includes(origin)) ||
          (!origin && site === "cross-site")
        ) {
          throw new ProductError(
            403,
            "UNTRUSTED_ORIGIN",
            "Origin is not trusted",
          );
        }
      }
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session)
        throw new ProductError(401, "UNAUTHENTICATED", "Sign in is required");
      return { actor: session.user, session: session.session };
    },
  );
}
