import { expect, test } from "bun:test";
import { createApiClient } from "../src/index";

test("browser client infers list and deep-link summary context with string timestamps", async () => {
  const timestamp = "2026-10-30T12:34:56.000Z";
  const direct = {
    id: "direct-1",
    kind: "direct" as const,
    matchId: "match-1",
    projectId: null,
    createdAt: timestamp,
    lastActivityAt: timestamp,
    peer: { userId: "peer-1", displayName: "Public name" },
    project: null,
    latestMessage: {
      id: "message-1",
      senderId: "peer-1",
      text: timestamp,
      createdAt: timestamp,
    },
  };
  const project = {
    ...direct,
    id: "team-1",
    kind: "project",
    matchId: null,
    projectId: "project-1",
    peer: null,
    project: { id: "project-1", title: "Team" },
    latestMessage: null,
  };
  const client = createApiClient("http://localhost:3000", {
    parseDate: true,
    fetcher: (async (input) =>
      Response.json(
        String(input).endsWith("/conversations")
          ? { items: [direct, project], nextCursor: null }
          : direct,
      )) as typeof fetch,
  });
  const list = await client.api.v1.conversations.get();
  if (!list.data) throw new Error("Missing typed summary page");
  for (const row of list.data.items) {
    const activity: string = row.lastActivityAt;
    expect(activity).toBe(timestamp);
    const createdAt: string = row.createdAt;
    expect(createdAt).toBe(timestamp);
    if (row.kind === "direct") {
      const displayName: string = row.peer.displayName;
      const matchId: string = row.matchId;
      const noProject: null = row.project;
      expect(displayName).toBe("Public name");
      expect(matchId).toBe("match-1");
      expect(noProject).toBeNull();
    } else {
      const title: string = row.project.title;
      const noPeer: null = row.peer;
      expect(title).toBe("Team");
      expect(noPeer).toBeNull();
    }
  }
  const detail = await client.api.v1
    .conversations({ conversationId: direct.id })
    .get();
  if (!detail.data) throw new Error("Missing typed summary detail");
  expect(detail.data).toEqual(direct);
  const messageTime: string | undefined = detail.data.latestMessage?.createdAt;
  const text: string | undefined = detail.data.latestMessage?.text;
  expect(messageTime).toBe(timestamp);
  expect(text).toBe(timestamp);
});
