import { Elysia } from "elysia";
import type { Database } from "../../db/client";
import { errorResponses } from "../../lib/errors";
import { pageQuerySchema } from "../../lib/pagination";
import { identityGuard } from "../identity/routes";
import type { Auth } from "../identity/service";
import {
  conversationPageSchema,
  conversationParamsSchema,
  messagePageSchema,
  messageSchema,
  sendMessageSchema,
} from "./schemas";
import { getMessages, listConversations, sendMessage } from "./service";
import { createConversationStreams } from "./streams";

// Mount under /api/v1, inside the product error/CORS boundary.
export function conversationRoutes(
  db: Database,
  auth: Auth,
  trustedOrigins: string[],
  streams = createConversationStreams(db),
) {
  return new Elysia({ name: "conversations", normalize: false })
    .use(identityGuard(auth, trustedOrigins))
    .onStop(() => streams.close())
    .get(
      "/conversations",
      ({ actor, query }) => listConversations(db, actor.id, query),
      {
        query: pageQuerySchema,
        response: { 200: conversationPageSchema, ...errorResponses },
      },
    )
    .get(
      "/conversations/:conversationId/messages",
      ({ actor, params, query }) =>
        getMessages(db, actor.id, params.conversationId, query),
      {
        params: conversationParamsSchema,
        query: pageQuerySchema,
        response: { 200: messagePageSchema, ...errorResponses },
      },
    )
    .post(
      "/conversations/:conversationId/messages",
      async ({ actor, params, body }) => {
        const result = await sendMessage(
          db,
          actor.id,
          params.conversationId,
          body,
        );
        if (result.created)
          await streams.publish({
            type: "message.created",
            conversationId: result.message.conversationId,
            messageId: result.message.id,
          });
        return result.message;
      },
      {
        params: conversationParamsSchema,
        body: sendMessageSchema,
        response: { 200: messageSchema, ...errorResponses },
      },
    )
    .get("/events", ({ actor, session, request }) =>
      streams.connect(actor.id, session.id, request.signal),
    );
}
