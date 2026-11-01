import { createApiClient } from "@aster/api-client";
import { createAuthClient } from "better-auth/react";

// The proxy preserves one browser origin for cookies, CSRF and both API surfaces.
export const api = createApiClient(window.location.origin, {
  fetch: { credentials: "include" },
});
export const auth = createAuthClient({ baseURL: window.location.origin });
