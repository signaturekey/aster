import type { Database } from "@api/db/client";
import { errorResponses } from "@api/lib/errors";
import { pageQuerySchema } from "@api/lib/pagination";
import {
  decisionResultSchema,
  decisionSchema,
  discoveryPageSchema,
  discoveryQuerySchema,
  matchPageSchema,
  matchSchema,
} from "@api/modules/discovery/schemas";
import {
  discover,
  getMatch,
  listMatches,
  setDecision,
} from "@api/modules/discovery/service";
import { identityGuard } from "@api/modules/identity/routes";
import type { Auth } from "@api/modules/identity/service";
import { Elysia, t } from "elysia";

export function discoveryRoutes(db: Database, auth: Auth, origins: string[]) {
  return new Elysia({ prefix: "/api/v1", normalize: false })
    .use(identityGuard(auth, origins))
    .get("/discovery", ({ actor, query }) => discover(db, actor.id, query), {
      query: discoveryQuerySchema,
      response: { 200: discoveryPageSchema, ...errorResponses },
    })
    .put(
      "/discovery/decisions/:targetUserId",
      ({ actor, params, body }) =>
        setDecision(db, actor.id, params.targetUserId, body.value),
      {
        params: t.Object({
          targetUserId: t.String({ minLength: 1, maxLength: 80 }),
        }),
        body: decisionSchema,
        response: { 200: decisionResultSchema, ...errorResponses },
      },
    )
    .get("/matches", ({ actor, query }) => listMatches(db, actor.id, query), {
      query: pageQuerySchema,
      response: { 200: matchPageSchema, ...errorResponses },
    })
    .get(
      "/matches/:matchId",
      ({ actor, params }) => getMatch(db, actor.id, params.matchId),
      { response: { 200: matchSchema, ...errorResponses } },
    );
}
