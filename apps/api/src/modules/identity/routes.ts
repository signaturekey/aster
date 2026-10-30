import type { Database } from "@api/db/client";
import { errorResponses, ProductError } from "@api/lib/errors";
import { profileSchema } from "@api/modules/profiles/schemas";
import { getProfile } from "@api/modules/profiles/service";
import type { Auth } from "@api/modules/identity/service";
import { Elysia, t } from "elysia";

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

export function identityRoutes(
  db: Database,
  auth: Auth,
  trustedOrigins: string[],
) {
  return new Elysia({ prefix: "/api/v1", normalize: false })
    .use(identityGuard(auth, trustedOrigins))
    .get(
      "/me",
      async ({ actor }) => ({
        id: actor.id,
        email: actor.email,
        name: actor.name,
        profile: await getProfile(db, actor.id),
      }),
      {
        response: {
          200: t.Object({
            id: t.String(),
            email: t.String(),
            name: t.String(),
            profile: profileSchema,
          }),
          ...errorResponses,
        },
      },
    );
}
