import type { Database } from "@api/db/client";
import { errorResponses } from "@api/lib/errors";
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
import { Elysia, t } from "elysia";

export function profileRoutes(
  db: Database,
  auth: Auth,
  trustedOrigins: string[],
) {
  return new Elysia({ prefix: "/api/v1", normalize: false })
    .use(identityGuard(auth, trustedOrigins))
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
    .get("/profiles/:userId", ({ params }) => getProfile(db, params.userId), {
      params: t.Object({ userId: t.String({ minLength: 1, maxLength: 128 }) }),
      response: { 200: profileSchema, ...errorResponses },
    })
    .get("/dictionaries", () => getDictionaries(db), {
      response: { 200: dictionariesSchema, ...errorResponses },
    });
}
