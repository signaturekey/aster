import {
  isConversationEvent,
  type ConversationEvent,
} from "@aster/api-client/events";

export function parseMessageEvent(data: string): ConversationEvent | null {
  try {
    const value: unknown = JSON.parse(data);
    return isConversationEvent(value) ? value : null;
  } catch {
    return null;
  }
}

export function reconnectDelay(failures: number, random = Math.random()) {
  // Equal jitter retains a positive delay even at capacity; the cap includes jitter.
  const ceiling = Math.min(
    30_000,
    1000 * 2 ** Math.min(20, Math.max(0, failures)),
  );
  const floor = Math.max(1000, ceiling / 2);
  return Math.round(
    floor + (ceiling - floor) * Math.min(1, Math.max(0, random)),
  );
}

type Callbacks = {
  open: () => void;
  error: () => void;
  message: (data: string) => void;
};
type Options = {
  connect: (callbacks: Callbacks) => { close: () => void };
  revalidate: () => Promise<boolean>;
  reconcile: (conversationId?: string) => void;
  schedule: (callback: () => void, delay: number) => () => void;
  state: (state: "connecting" | "connected" | "recovering" | "stopped") => void;
  random?: () => number;
};

export function createMessageCoordinator(options: Options) {
  let stopped = false;
  let stream: { close: () => void } | undefined;
  let cancelTimer: (() => void) | undefined;
  let version = 0;
  let failures = 0;
  const stop = () => {
    stopped = true;
    version += 1;
    stream?.close();
    stream = undefined;
    cancelTimer?.();
    cancelTimer = undefined;
    options.state("stopped");
  };
  const connect = () => {
    if (stopped) return;
    cancelTimer = undefined;
    const current = ++version;
    options.state("connecting");
    const live = () => !stopped && current === version;
    const error = () => {
      if (!live()) return;
      // Closing immediately disables EventSource's native retry. Only this
      // coordinator schedules reconnects; repeated errors cannot start loops.
      version += 1;
      stream?.close();
      stream = undefined;
      options.state("recovering");
      void (async () => {
        let authenticated = true;
        try {
          authenticated = await options.revalidate();
        } catch {
          /* A network outage is not evidence of session expiry. */
        }
        if (stopped) return;
        if (!authenticated) {
          stop();
          return;
        }
        const delay = reconnectDelay(failures++, options.random?.());
        cancelTimer = options.schedule(connect, delay);
      })();
    };
    try {
      stream = options.connect({
        open: () => {
          if (!live()) return;
          // Do not reset on every short-lived open: flapping streams must back
          // off too. A valid notification proves useful delivery and resets it.
          options.state("connected");
          options.reconcile();
        },
        message: (data) => {
          if (!live()) return;
          const event = parseMessageEvent(data);
          if (!event) return;
          failures = 0;
          options.reconcile(event.conversationId);
        },
        error,
      });
    } catch {
      error();
    }
  };
  connect();
  return {
    stop,
    recover: () => {
      if (!stopped) options.reconcile();
    },
  };
}
