import type { SqlDatabase } from "@api/db/kysely";
import type { ConversationEvent } from "@api/events";
import { ProductError } from "@api/lib/errors";
import { logUnexpectedError } from "@api/lib/diagnostics";
import { requireConversationMember } from "@api/modules/conversations/service";

const MAX_QUEUED_EVENTS = 32;
const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

type PendingEvent = { event: ConversationEvent; done: () => void };
type Connection = {
  sessionId: string;
  active: () => boolean;
  enqueue: (frame: string) => void;
  schedule: (event: ConversationEvent) => Promise<void>;
  close: () => void;
};

// Deliberately single-instance and lossy: bounded connections are not an outbox.
// HTTP history is authoritative; consumers deduplicate notifications by messageId.
export function createConversationStreams(db: SqlDatabase) {
  const connections = new Map<string, Connection>();
  const publications: PendingEvent[] = [];
  let selecting = false;
  let stopped = false;

  async function deliver(
    userId: string,
    connection: Connection,
    event?: ConversationEvent,
  ) {
    if (!connection.active()) return;
    try {
      await db.transaction().execute(async (tx) => {
        // Pool acquisition and row locks may wait past disconnect. Never start
        // the next query or enqueue a frame for a closed/replaced connection.
        if (!connection.active()) return;
        await tx
          .selectFrom("sessions")
          .select("id")
          .where("id", "=", connection.sessionId)
          .forShare()
          .execute();
        if (!connection.active()) return;
        const session = await tx
          .selectFrom("sessions")
          .select(["user_id as userId", "expires_at as expiresAt"])
          .where("id", "=", connection.sessionId)
          .executeTakeFirst();
        if (!connection.active()) return;
        if (
          !session ||
          session.userId !== userId ||
          session.expiresAt.getTime() <= Date.now()
        ) {
          connection.close();
          return;
        }
        if (event) {
          await requireConversationMember(
            tx,
            userId,
            event.conversationId,
            connection.active,
          );
          // Keep the shared project lock through enqueue so revocation cannot
          // commit between checking current membership and emitting the frame.
          if (session.expiresAt.getTime() <= Date.now()) {
            connection.close();
            return;
          }
        }
        if (!connection.active()) return;
        connection.enqueue(
          event
            ? `id: ${event.messageId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
            : ": heartbeat\n\n",
        );
      });
    } catch (error) {
      // A revoked member may still receive notifications for other conversations.
      if (!(error instanceof ProductError && error.status === 404)) {
        logUnexpectedError(error, {
          operation: event ? "sse.delivery" : "sse.heartbeat",
        });
        connection.close();
      }
    }
  }

  function connect(userId: string, sessionId: string, signal: AbortSignal) {
    if (stopped) return new Response(null, { status: 503 });
    connections.get(userId)?.close();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let running = false;
    let heartbeatPending = false;
    const pending: PendingEvent[] = [];
    const close = () => {
      if (closed) return;
      closed = true;
      heartbeatPending = false;
      for (const item of pending.splice(0)) item.done();
      if (timer) clearInterval(timer);
      signal.removeEventListener("abort", close);
      if (connections.get(userId) === connection) connections.delete(userId);
      try {
        controller.close();
      } catch {
        // A consumer may already have cancelled its stream.
      }
    };
    async function drain() {
      if (running || closed) return;
      running = true;
      try {
        while (!closed && (pending.length || heartbeatPending)) {
          const item = pending.shift();
          // An event checks the session too, so it subsumes a queued heartbeat.
          heartbeatPending = false;
          await deliver(userId, connection, item?.event);
          item?.done();
        }
      } finally {
        running = false;
      }
    }
    const connection: Connection = {
      sessionId,
      close,
      active: () => !closed && connections.get(userId) === connection,
      schedule(event) {
        if (closed) return Promise.resolve();
        if (pending.length >= MAX_QUEUED_EVENTS) {
          close();
          return Promise.resolve();
        }
        const completion = Promise.withResolvers<void>();
        pending.push({ event, done: completion.resolve });
        void drain();
        return completion.promise;
      },
      enqueue(frame) {
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) {
          close();
          return;
        }
        controller.enqueue(encoder.encode(frame));
      },
    };
    const stream = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value;
          connections.set(userId, connection);
          signal.addEventListener("abort", close, { once: true });
          if (signal.aborted) close();
          else {
            connection.enqueue(": connected\n\n");
            timer = setInterval(() => {
              // One active delivery and one coalesced heartbeat per connection,
              // even if authorization takes longer than the heartbeat interval.
              if (!running) {
                heartbeatPending = true;
                void drain();
              }
            }, HEARTBEAT_MS);
            timer.unref();
          }
        },
        cancel: close,
      },
      { highWaterMark: MAX_QUEUED_EVENTS },
    );
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  async function selectRecipients() {
    if (selecting) return;
    selecting = true;
    try {
      while (!stopped && publications.length) {
        const publication = publications.shift();
        if (!publication) break;
        const current = new Map(connections);
        const userIds = [...current.keys()];
        if (!userIds.length) {
          publication.done();
          continue;
        }
        try {
          const members = await db
            .selectFrom("conversation_members")
            .select("user_id as userId")
            .where("conversation_id", "=", publication.event.conversationId)
            .where("user_id", "in", userIds)
            .execute();
          // Do not stall subsequent recipient lookups behind one blocked client.
          // Each connection owns a bounded serial delivery queue of its own.
          const deliveries = members.map(({ userId }) => {
            const connection = current.get(userId);
            return connection?.active()
              ? connection.schedule(publication.event)
              : undefined;
          });
          void Promise.all(deliveries).then(publication.done);
        } catch (error) {
          logUnexpectedError(error, { operation: "sse.recipients" });
          publication.done();
        }
      }
    } finally {
      selecting = false;
    }
  }

  return {
    connect,
    // Only invoke after commit. The returned completion is useful for explicit
    // delivery synchronization, but HTTP acknowledgements need not await it.
    publish(event: ConversationEvent): Promise<void> {
      if (stopped || !connections.size) return Promise.resolve();
      if (publications.length >= MAX_QUEUED_EVENTS) {
        // Recipient lookup itself may be blocked. Bound ingress as well as each
        // recipient queue; force history recovery rather than retaining work.
        for (const connection of connections.values()) connection.close();
        for (const item of publications.splice(0)) item.done();
        return Promise.resolve();
      }
      const completion = Promise.withResolvers<void>();
      publications.push({ event, done: completion.resolve });
      void selectRecipients();
      return completion.promise;
    },
    close() {
      stopped = true;
      for (const item of publications.splice(0)) item.done();
      for (const connection of connections.values()) connection.close();
    },
  };
}
