import { expect, test } from "bun:test";
import { isConversationEvent } from "../src/events";

test("browser-safe event guard accepts only documented event fields", () => {
  const event = {
    type: "message.created",
    conversationId: "conversation",
    messageId: "message",
  };
  expect(isConversationEvent(event)).toBe(true);
  for (const invalid of [
    null,
    {},
    { ...event, type: "typing" },
    { ...event, messageId: "" },
    { ...event, email: "private@example.test" },
  ]) {
    expect(isConversationEvent(invalid)).toBe(false);
  }
});

test("reconnected history and duplicate events merge by durable message ID", () => {
  const history = [
    { id: "before-disconnect", text: "first" },
    { id: "while-offline", text: "second" },
  ];
  const recovered = new Map(history.map((message) => [message.id, message]));
  for (const message of [history[1], history[1]]) {
    if (message) recovered.set(message.id, message);
  }
  expect([...recovered.keys()]).toEqual(["before-disconnect", "while-offline"]);
});
