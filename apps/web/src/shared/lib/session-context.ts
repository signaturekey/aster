import { createContext, useContext } from "react";
import type { api } from "@web/shared/api/client";
import type { SessionScope } from "@web/shared/lib/session-scope";

type Me = NonNullable<Awaited<ReturnType<typeof api.api.v1.me.get>>["data"]>;
export type SessionValue = {
  me: Me | null;
  loading: boolean;
  error: unknown;
  scope: SessionScope;
  refresh: () => Promise<Me | null>;
  authenticate: (
    operation: (signal: AbortSignal) => Promise<unknown>,
  ) => Promise<Me | null>;
  logout: () => Promise<void>;
  run: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<T>;
};

// Lower layers consume this boundary, never the app's provider implementation.
export const SessionContext = createContext<SessionValue | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session provider is missing");
  return session;
}
