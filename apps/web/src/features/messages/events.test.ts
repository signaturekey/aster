import { describe, expect, test } from "bun:test";
import {
  createMessageCoordinator,
  parseMessageEvent,
  reconnectDelay,
} from "./events";
import { SessionScope } from "@web/shared/lib/session-scope";

type Callbacks = Parameters<
  Parameters<typeof createMessageCoordinator>[0]["connect"]
>[0];
const hint = JSON.stringify({
  type: "message.created",
  conversationId: "thread",
  messageId: "message",
});
function setup(
  revalidate: () => Promise<boolean> = () => Promise.resolve(true),
) {
  const streams: { callbacks: Callbacks; closed: number }[] = [];
  const timers: { callback: () => void; delay: number; cancelled: boolean }[] =
    [];
  const reconciled: (string | undefined)[] = [];
  const coordinator = createMessageCoordinator({
    connect: (callbacks) => {
      const stream = { callbacks, closed: 0 };
      streams.push(stream);
      return {
        close: () => {
          stream.closed++;
        },
      };
    },
    revalidate,
    reconcile: (id) => {
      reconciled.push(id);
    },
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    state: () => undefined,
    random: () => 1,
  });
  return { coordinator, streams, timers, reconciled };
}
const flush = () => Promise.resolve();

describe("message-only event coordination", () => {
  test("rejects malformed, unrelated, oversized and extra-field payloads", () => {
    expect(parseMessageEvent(hint)?.messageId).toBe("message");
    for (const value of [
      "{",
      "null",
      "[]",
      "{}",
      JSON.stringify({
        type: "project.updated",
        conversationId: "thread",
        messageId: "message",
      }),
      JSON.stringify({
        type: "message.created",
        conversationId: "x".repeat(129),
        messageId: "message",
      }),
      JSON.stringify({
        type: "message.created",
        conversationId: "thread",
        messageId: "message",
        text: "private",
      }),
    ])
      expect(parseMessageEvent(value)).toBeNull();
  });
  test("open, recovery, reconnect and valid hints reconcile HTTP, never fabricate messages", async () => {
    const state = setup();
    state.streams[0]!.callbacks.open();
    state.streams[0]!.callbacks.message("invalid");
    state.streams[0]!.callbacks.message(hint);
    state.coordinator.recover();
    expect(state.reconciled).toEqual([undefined, "thread", undefined]);
    state.streams[0]!.callbacks.error();
    await flush();
    expect(state.timers).toHaveLength(1);
    state.timers[0]!.callback();
    state.streams[1]!.callbacks.open();
    expect(state.reconciled.at(-1)).toBeUndefined();
    expect(state.reconciled).toHaveLength(4);
    state.coordinator.stop();
  });
  test("closes native reconnect immediately and ignores duplicate/stale callbacks", async () => {
    const state = setup();
    state.streams[0]!.callbacks.error();
    state.streams[0]!.callbacks.error();
    state.streams[0]!.callbacks.message(hint);
    state.streams[0]!.callbacks.open();
    expect(state.streams[0]!.closed).toBe(1);
    await flush();
    expect(state.timers).toHaveLength(1);
    expect(state.reconciled).toEqual([]);
    state.coordinator.stop();
    expect(state.timers[0]!.cancelled).toBe(true);
  });
  test("confirmed auth loss stops, transport failure backs off without signout", async () => {
    const expired = setup(() => Promise.resolve(false));
    expired.streams[0]!.callbacks.error();
    await flush();
    expect(expired.timers).toHaveLength(0);
    expired.coordinator.recover();
    expect(expired.reconciled).toHaveLength(0);
    const offline = setup(() => Promise.reject(new TypeError("offline")));
    offline.streams[0]!.callbacks.error();
    await flush();
    expect(offline.timers).toHaveLength(1);
    expect(offline.timers[0]!.delay).toBe(1000);
    offline.timers[0]!.callback();
    offline.streams[1]!.callbacks.open();
    offline.streams[1]!.callbacks.error();
    await flush();
    expect(offline.timers[1]!.delay).toBe(2000);
    offline.coordinator.stop();
  });
  test("scope reset cancels the stream and ignores late session revalidation", async () => {
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>((done) => {
      resolve = done;
    });
    const state = setup(() => pending);
    const scope = new SessionScope();
    scope.onReset(state.coordinator.stop);
    state.streams[0]!.callbacks.error();
    scope.reset();
    resolve(true);
    await flush();
    expect(state.timers).toHaveLength(0);
    state.streams[0]!.callbacks.message(hint);
    expect(state.reconciled).toHaveLength(0);
  });
  test("backoff starts at 1s and includes jitter within the 30s cap", () => {
    expect(reconnectDelay(0, 0)).toBe(1000);
    expect(reconnectDelay(0, 1)).toBe(1000);
    expect(reconnectDelay(1, 0)).toBe(1000);
    expect(reconnectDelay(1, 1)).toBe(2000);
    expect(reconnectDelay(1000, 1)).toBe(30000);
    expect(reconnectDelay(1000, 0)).toBe(15000);
  });
});
