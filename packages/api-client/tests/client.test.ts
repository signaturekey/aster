import { expect, test } from "bun:test";
import { createApiClient } from "../src/index";

test("passes credentialed browser configuration to fetch", async () => {
  let credentials: RequestCredentials | undefined;
  const client = createApiClient("http://localhost:3000", {
    fetch: { credentials: "include" },
    fetcher: (async (_input, init) => {
      credentials = init?.credentials;
      return Response.json({ status: "ok" });
    }) as typeof fetch,
  });
  const result = await client.health.get();
  expect(credentials).toBe("include");
  expect(result.data).toEqual({ status: "ok" });
});

test.each([undefined, true])(
  "keeps typed profile/message timestamps and date-like text as strings (parseDate: %s)",
  async (parseDate) => {
    const timestamp = "2026-10-30T12:34:56.000Z";
    const profile = {
      userId: "user-1",
      displayName: "Aster Test",
      bio: "",
      specializationId: null,
      experienceId: null,
      skillIds: [],
      goalIds: [],
      portfolioLinks: [],
      discoverable: false,
      complete: false,
      missingFields: ["specializationId", "skillIds", "goalIds"],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const message = {
      id: "message-1",
      conversationId: "conversation-1",
      senderId: profile.userId,
      requestId: "request-1",
      text: timestamp,
      createdAt: timestamp,
    };
    const client = createApiClient("http://localhost:3000", {
      ...(parseDate === undefined ? {} : { parseDate }),
      fetcher: (async (input) =>
        Response.json(
          String(input).endsWith("/me/profile") ? profile : message,
        )) as typeof fetch,
    });
    const profileResult = await client.api.v1.me.profile.get();
    if (!profileResult.data) throw new Error("Expected typed profile response");
    const createdAt: string = profileResult.data.createdAt;
    const updatedAt: string = profileResult.data.updatedAt;
    expect(createdAt).toBe(timestamp);
    expect(updatedAt).toBe(timestamp);
    const messageResult = await client.api.v1
      .conversations({ conversationId: message.conversationId })
      .messages.post({ text: message.text, requestId: message.requestId });
    if (!messageResult.data) throw new Error("Expected typed message response");
    const messageCreatedAt: string = messageResult.data.createdAt;
    const text: string = messageResult.data.text;
    expect(messageCreatedAt).toBe(timestamp);
    expect(text).toBe(timestamp);
  },
);
