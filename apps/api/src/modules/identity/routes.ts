import { ProductError } from "@api/lib/errors";
import type { Auth } from "@api/modules/identity/service";
import { Elysia } from "elysia";

export function identityGuard(auth: Auth, trustedOrigins: string[]) {
  return new Elysia({ name: "identity-guard" }).resolve(
    { as: "scoped" },
    async ({ request, set }) => {
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
      const { response: session, headers } = await auth.api.getSession({
        headers: request.headers,
        returnHeaders: true,
      });
      // Keep renewal/clearing cookies, including separate Set-Cookie values.
      // Cache metadata belongs to the product route (in particular SSE), not
      // the provider's internal get-session response.
      const cookies = headers.getSetCookie();
      if (cookies.length) {
        const existing = set.headers["set-cookie"];
        set.headers["set-cookie"] = [
          ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
          ...cookies,
        ];
      }
      if (!session)
        throw new ProductError(401, "UNAUTHENTICATED", "Sign in is required");
      return { actor: session.user, session: session.session };
    },
  );
}
