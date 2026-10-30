import { createApiClient } from "@aster/api-client";

const api = createApiClient("http://localhost:3000", {
  fetch: { credentials: "include" },
});

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type Health = Awaited<ReturnType<typeof api.health.get>>;
export type HealthIsTyped = AssertFalse<IsAny<Health>>;
export type HealthDataIsTyped = AssertFalse<IsAny<Health["data"]>>;
export type HealthErrorIsTyped = AssertFalse<IsAny<Health["error"]>>;
export type HealthRequestIsTyped = AssertFalse<
  IsAny<Parameters<typeof api.health.get>[0]>
>;

export async function readHealth() {
  const result = await api.health.get();
  if (result.error) throw result.error;
  const status: "ok" = result.data.status;
  // @ts-expect-error The contract must reject incompatible response fields.
  const invalid: number = result.data.status;
  // @ts-expect-error No private account data belongs in health.
  result.data.email;
  return { status, invalid };
}

export async function readProfile() {
  const result = await api.api.v1.me.profile.get();
  if (result.error) {
    const code: string = result.error.value.error.code;
    return code;
  }
  const timestamp: string = result.data.createdAt;
  // @ts-expect-error Product timestamps are serialized strings, never Dates.
  const date: Date = result.data.createdAt;
  // @ts-expect-error Public profiles must not include account email.
  result.data.email;
  return { timestamp, date };
}

export type ProfileDataIsTyped = AssertFalse<
  IsAny<Awaited<ReturnType<typeof api.api.v1.me.profile.get>>["data"]>
>;
export type ProfileErrorIsTyped = AssertFalse<
  IsAny<Awaited<ReturnType<typeof api.api.v1.me.profile.get>>["error"]>
>;

// @ts-expect-error Health has no mutation route.
api.health.post;
// @ts-expect-error Invalid fetch credentials must not be accepted.
createApiClient("http://localhost:3000", { fetch: { credentials: "invalid" } });

export async function collaborationExamples() {
  const deck = await api.api.v1.discovery.get({
    query: { limit: 20, skillIds: ["typescript"], goalIds: ["startup"] },
  });
  if (deck.error) return deck.error.value.error.code;
  const profile = deck.data.items[0];
  if (profile)
    await api.api.v1.discovery
      .decisions({ targetUserId: profile.userId })
      .put({ value: "interested" });
  const projects = await api.api.v1.projects.get({ query: { limit: 20 } });
  if (projects.error) return projects.error.value.error.code;
  const project = projects.data.items[0];
  if (project)
    await api.api.v1
      .projects({ projectId: project.id })
      .applications.post({ text: "I can help" });
  const conversations = await api.api.v1.conversations.get({
    query: { limit: 20 },
  });
  if (conversations.error) return conversations.error.value.error.code;
  const conversation = conversations.data.items[0];
  if (conversation) {
    const result = await api.api.v1
      .conversations({ conversationId: conversation.id })
      .messages.post({ text: "Hello", requestId: "client-request-1" });
    if (result.error) return result.error.value.error.code;
    const timestamp: string = result.data.createdAt;
    // @ts-expect-error Messages must not expose private sender email.
    result.data.email;
    return timestamp;
  }
}
