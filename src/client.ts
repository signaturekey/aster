import { treaty } from "@elysia/eden";
import type { App } from "@/app";

export const createClient = (baseUrl: string) => treaty<App>(baseUrl);
