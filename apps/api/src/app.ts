import { Elysia, t } from "elysia";
import type { Database } from "./db/client";
import type { Auth } from "./modules/identity/service";
import { productRoutes } from "./product";

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
export const createApp = (db: Database, auth: Auth, trustedOrigins: string[]) =>
  health().use(productRoutes(db, auth, trustedOrigins));

export type App = ReturnType<typeof createApp>;
