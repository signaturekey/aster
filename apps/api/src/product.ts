import type { Database } from "@api/db/client";
import { errorBody, errorResponses, ProductError } from "@api/lib/errors";
import { identityGuard } from "@api/modules/identity/routes";
import type { Auth } from "@api/modules/identity/service";
import {
  dictionariesSchema,
  profilePatchSchema,
  profileSchema,
} from "@api/modules/profiles/schemas";
import {
  getDictionaries,
  getProfile,
  updateProfile,
} from "@api/modules/profiles/service";
import cors from "@elysiajs/cors";
import { Elysia, t } from "elysia";

export function productRoutes(
  db: Database,
  auth: Auth,
  trustedOrigins: string[],
) {
  return new Elysia({ normalize: false })
    .use(
      cors({
        origin: trustedOrigins,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
      }),
    )
    .onError({ as: "global" }, ({ error, code, status }) => {
      if (error instanceof ProductError)
        return status(error.status, errorBody(error.code, error.message));
      if (code === "VALIDATION" || code === "PARSE")
        return status(422, errorBody("VALIDATION_ERROR", "Request is invalid"));
      if (code === "NOT_FOUND")
        return status(404, errorBody("NOT_FOUND", "Resource not found"));
      return status(
        500,
        errorBody("INTERNAL_ERROR", "An internal error occurred"),
      );
    })
    .mount(auth.handler)
    .group("/api/v1", (app) =>
      app
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
        )
        .get("/me/profile", ({ actor }) => getProfile(db, actor.id), {
          response: { 200: profileSchema, ...errorResponses },
        })
        .patch(
          "/me/profile",
          ({ actor, body }) => updateProfile(db, actor.id, body),
          {
            body: profilePatchSchema,
            response: { 200: profileSchema, ...errorResponses },
          },
        )
        .get(
          "/profiles/:userId",
          ({ params }) => getProfile(db, params.userId),
          {
            params: t.Object({
              userId: t.String({ minLength: 1, maxLength: 128 }),
            }),
            response: { 200: profileSchema, ...errorResponses },
          },
        )
        .get("/dictionaries", () => getDictionaries(db), {
          response: { 200: dictionariesSchema, ...errorResponses },
        }),
    );
}
