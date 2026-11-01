import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@web/shared/lib/session-context";
import { reconcileConversations } from "@web/entities/conversation/queries";
import { createMessageCoordinator } from "@web/features/messages/events";
import { Button } from "@web/shared/ui/button";

/** Mount once under the authenticated Shell, never once per thread or query. */
export function MessageEvents() {
  const session = useSession();
  const latest = useRef(session);
  latest.current = session;
  const client = useQueryClient();
  const accountId = session.me?.id;
  const scope = session.scope;
  const [state, setState] = useState("connecting");
  const recovery = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    const signal = scope.signal;
    let queued = false;
    let reconciling = false;
    // Coalesce bursts; one trailing refresh catches a hint arriving while an
    // earlier HTTP request was in flight. Reconcile all active histories so a
    // missed hint in another thread is never treated as durable absence.
    const reconcile = () => {
      if (!active) return;
      if (reconciling) {
        queued = true;
        return;
      }
      reconciling = true;
      void (async () => {
        try {
          do {
            queued = false;
            await reconcileConversations(client, accountId, undefined, signal);
          } while (queued && active);
        } finally {
          reconciling = false;
        }
      })().catch(() => undefined);
    };
    const coordinator = createMessageCoordinator({
      connect: (callbacks) => {
        const source = new EventSource("/api/v1/events", {
          withCredentials: true,
        });
        source.onopen = callbacks.open;
        source.onerror = callbacks.error;
        source.addEventListener(
          "message.created",
          (event: MessageEvent<string>) => callbacks.message(event.data),
        );
        return {
          close: () => {
            source.onopen = null;
            source.onerror = null;
            source.close();
          },
        };
      },
      revalidate: async () => (await latest.current.refresh()) !== null,
      reconcile,
      schedule: (callback, delay) => {
        const timer = window.setTimeout(callback, delay);
        return () => window.clearTimeout(timer);
      },
      state: (value) => {
        if (active) setState(value);
      },
    });
    recovery.current = coordinator.recover;
    window.addEventListener("focus", coordinator.recover);
    window.addEventListener("online", coordinator.recover);
    const stop = () => {
      active = false;
      coordinator.stop();
    };
    const offReset = scope.onReset(stop);
    return () => {
      stop();
      offReset();
      recovery.current = () => undefined;
      window.removeEventListener("focus", coordinator.recover);
      window.removeEventListener("online", coordinator.recover);
    };
  }, [accountId, scope, client]);

  if (!accountId || state === "connected") return null;
  return (
    <aside
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
    >
      <p>
        {state === "connecting"
          ? "Подключаем обновления сообщений…"
          : "Обновления сообщений временно недоступны. Переподключаемся; историю можно обновить вручную."}
      </p>
      <Button variant="ghost" size="sm" onClick={() => recovery.current()}>
        Обновить сообщения
      </Button>
    </aside>
  );
}
