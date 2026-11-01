import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, auth } from "@web/shared/api/client";
import { responseError, unwrap } from "@web/shared/api/errors";
import {
  SessionLifecycle,
  type SessionState,
} from "@web/shared/lib/session-scope";
import { SessionContext } from "@web/shared/lib/session-context";

const loadMe = (signal: AbortSignal) =>
  unwrap(api.api.v1.me.get({ fetch: { signal } }));

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({
    me: null,
    loading: true,
    error: null,
  });
  const [lifecycle] = useState(
    () =>
      new SessionLifecycle(
        loadMe,
        () => {
          void queryClient.cancelQueries();
          queryClient.clear();
        },
        setState,
      ),
  );
  const logout = () =>
    lifecycle.logout(async (signal) => {
      const result = await auth.signOut({ fetchOptions: { signal } });
      if (result.error) throw responseError(result.error.status, result.error);
    });

  useEffect(() => {
    const refreshSafely = () => {
      void lifecycle.refresh().catch(() => undefined);
    };
    refreshSafely();
    window.addEventListener("focus", refreshSafely);
    window.addEventListener("online", refreshSafely);
    return () => {
      window.removeEventListener("focus", refreshSafely);
      window.removeEventListener("online", refreshSafely);
      lifecycle.scope.reset();
    };
  }, [lifecycle]);

  return (
    <SessionContext.Provider
      value={{
        ...state,
        scope: lifecycle.scope,
        refresh: lifecycle.refresh,
        authenticate: lifecycle.authenticate,
        logout,
        run: lifecycle.run,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
