import { Elysia, t } from "elysia";

export const app = new Elysia().get(
  "/health",
  () => ({ status: "ok" as const }),
  {
    response: {
      200: t.Object({ status: t.Literal("ok") }),
    },
  },
);

export type App = typeof app;
