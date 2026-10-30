import type { Database } from "../../db/client";
import type { ConversationEvent } from "../../events";
import { ProductError } from "../../lib/errors";
import { requireConversationMember } from "./service";

const MAX_QUEUED_EVENTS = 32;
const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

type Connection = {
  sessionId: string;
  enqueue: (frame: string) => void;
  close: () => void;
};

// Deliberately single-instance and lossy: bounded connections are not an outbox.
// HTTP history is authoritative; consumers deduplicate notifications by messageId.
export function createConversationStreams(db: Database) {
  const connections = new Map<string, Connection>();

  async function deliver(
    userId: string,
    connection: Connection,
    event?: ConversationEvent,
  ) {
    try {
      await db.$transaction(async (tx) => {
        // Coordinate sign-out/deletion with the final session check and enqueue.
        await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${connection.sessionId} FOR SHARE`;
        const session = await tx.session.findUnique({
          where: { id: connection.sessionId },
          select: { userId: true, expiresAt: true },
        });
        if (
          !session ||
          session.userId !== userId ||
          session.expiresAt.getTime() <= Date.now()
        ) {
          connection.close();
          return;
        }
        if (event) {
          await requireConversationMember(tx, userId, event.conversationId);
          // The Project lock remains held until enqueue: revocation cannot commit
          // between the membership check and handing this frame to the stream.
          if (session.expiresAt.getTime() <= Date.now()) {
            connection.close();
            return;
          }
        }
        if (connections.get(userId) !== connection) return;
        connection.enqueue(
          event
            ? `id: ${event.messageId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
            : ": heartbeat\n\n",
        );
      });
    } catch (error) {
      // A revoked member may still receive notifications for other conversations.
      if (!(error instanceof ProductError && error.status === 404))
        connection.close();
    }
  }

  function connect(userId: string, sessionId: string, signal: AbortSignal) {
    connections.get(userId)?.close();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      signal.removeEventListener("abort", close);
      if (connections.get(userId) === connection) connections.delete(userId);
      try {
        controller.close();
      } catch {
        // A consumer may already have cancelled its stream.
      }
    };
    const connection: Connection = {
      sessionId,
      close,
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
              void deliver(userId, connection);
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

  return {
    connect,
    // Only invoke after the write transaction resolves. Delivery failures cannot
    // turn an already committed send into an HTTP failure or trigger a retry.
    async publish(event: ConversationEvent) {
      await Promise.all(
        [...connections].map(([userId, connection]) =>
          deliver(userId, connection, event),
        ),
      );
    },
    close() {
      for (const connection of connections.values()) connection.close();
    },
  };
}
