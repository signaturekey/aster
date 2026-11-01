import type { api } from "@web/shared/api/client";

type Routes = ReturnType<typeof api.api.v1.conversations>;
type Data<T extends (...args: never[]) => unknown> = NonNullable<
  Awaited<ReturnType<T>> extends { data: infer D } ? D : never
>;

export type ConversationPage = Data<typeof api.api.v1.conversations.get>;
export type Conversation = Data<Routes["get"]>;
export type MessagePage = Data<Routes["messages"]["get"]>;
export type Message = MessagePage["items"][number];

export type SendAttempt = Readonly<{
  conversationId: string;
  senderId: string;
  requestId: string;
  text: string;
  createdAt: string;
  status: "pending" | "failed" | "saved";
  message?: Message;
  error?: unknown;
}>;
