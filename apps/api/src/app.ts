import type { Database } from "@api/db/client";
import { conversationRoutes } from "@api/modules/conversations/routes";
import { createConversationStreams } from "@api/modules/conversations/streams";
import { discoveryRoutes } from "@api/modules/discovery/routes";
import type { Auth } from "@api/modules/identity/service";
import { projectRoutes } from "@api/modules/projects/routes";
import { productRoutes } from "@api/product";
import { Elysia, t } from "elysia";

const health = () =>
  new Elysia({ normalize: false }).get(
    "/health",
    () => ({ status: "ok" as const }),
    {
      response: {
        200: t.Object({ status: t.Literal("ok") }),
      },
    },
  );

export const app = health();
export const createApp = (
  db: Database,
  auth: Auth,
  trustedOrigins: string[],
  streams = createConversationStreams(db),
) =>
  health()
    .use(productRoutes(db, auth, trustedOrigins))
    .use(discoveryRoutes(db, auth, trustedOrigins))
    .use(projectRoutes(db, auth, trustedOrigins))
    .group("/api/v1", (routes) =>
      routes.use(conversationRoutes(db, auth, trustedOrigins, streams)),
    );

export type App = ReturnType<typeof createApp>;
