import type { App } from "@aster/api/contract";
import { treaty } from "@elysia/eden";

export const createApiClient = (
  baseUrl: string,
  options?: Parameters<typeof treaty<App>>[1],
) => treaty<App>(baseUrl, { ...options, parseDate: false });
