import { expect, spyOn, test } from "bun:test";
import { createSqlDatabase } from "@api/db/kysely";
import { createConversationStreams } from "@api/modules/conversations/streams";

// Capacity and lifecycle checks must not query SQL. An unreachable local-only
// URL makes accidental database access fail rather than borrowing a working DB.
const db = createSqlDatabase("postgres://unused:unused@localhost:1/unused");

function open(
  streams: ReturnType<typeof createConversationStreams>,
  userId = "user",
  signal = new AbortController().signal,
) {
  const response = streams.connect(userId, "session", signal);
  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing SSE body");
  return reader;
}

async function connected(reader: ReadableStreamDefaultReader<Uint8Array>) {
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    ": connected\n\n",
  );
}

test("eight tabs coexist; ninth is refused without SSE or eviction; cancel frees only its slot", async () => {
  const streams = createConversationStreams(db);
  const readers = Array.from({ length: 8 }, () => open(streams));
  try {
    await Promise.all(readers.map(connected));
    const refused = streams.connect(
      "user",
      "session",
      new AbortController().signal,
    );
    expect(refused.status).toBe(429);
    expect(refused.headers.get("content-type")).toContain("application/json");
    expect(await refused.json()).toEqual({
      error: {
        code: "SSE_CAPACITY_EXCEEDED",
        message: "Message event stream capacity exceeded",
      },
    });
    const remaining = readers.slice(1).map((reader) => {
      const state = { settled: false };
      const pending = reader.read().then((value) => {
        state.settled = true;
        return value;
      });
      return { state, pending };
    });
    await readers[0]!.cancel();
    const replacement = open(streams);
    await connected(replacement);
    expect(
      streams.connect("user", "session", new AbortController().signal).status,
    ).toBe(429);
    expect(remaining.every(({ state }) => !state.settled)).toBe(true);
    streams.close();
    for (const { pending } of remaining)
      expect((await pending).done).toBe(true);
    expect((await replacement.read()).done).toBe(true);
  } finally {
    streams.close();
  }
});

test("instance capacity is 128 across users; abort and shutdown release all stream sets", async () => {
  const streams = createConversationStreams(db);
  const abort = new AbortController();
  const readers = Array.from({ length: 128 }, (_, index) =>
    open(streams, `user-${Math.floor(index / 8)}`, abort.signal),
  );
  try {
    await Promise.all(readers.map(connected));
    expect(streams.connect("new-user", "session", abort.signal).status).toBe(
      429,
    );
    await readers[0]!.cancel();
    const replacement = open(streams, "new-user", abort.signal);
    await connected(replacement);
    expect(
      streams.connect("another-user", "session", abort.signal).status,
    ).toBe(429);
    abort.abort();
    for (const reader of readers) expect((await reader.read()).done).toBe(true);
    expect((await replacement.read()).done).toBe(true);
    const afterAbort = open(streams);
    await connected(afterAbort);
    streams.close();
    expect((await afterAbort.read()).done).toBe(true);
    expect(streams.connect("user", "session", abort.signal).status).toBe(503);
  } finally {
    streams.close();
  }
});

test("reconnect churn and already-aborted signals do not leak slots or heartbeat timers", async () => {
  const streams = createConversationStreams(db);
  const intervals = spyOn(globalThis, "setInterval");
  const clear = spyOn(globalThis, "clearInterval");
  try {
    for (let i = 0; i < 160; i++) {
      const abort = new AbortController();
      const reader = open(streams, "user", abort.signal);
      await connected(reader);
      abort.abort();
      expect((await reader.read()).done).toBe(true);
    }
    expect(intervals.mock.calls).toHaveLength(160);
    expect(clear.mock.calls).toHaveLength(160);
    const aborted = new AbortController();
    aborted.abort();
    for (let i = 0; i < 160; i++)
      expect((await open(streams, "user", aborted.signal).read()).done).toBe(
        true,
      );
    expect(intervals.mock.calls).toHaveLength(160);
    const readers = Array.from({ length: 8 }, () => open(streams));
    await Promise.all(readers.map(connected));
    streams.close();
    for (const reader of readers) expect((await reader.read()).done).toBe(true);
    expect(clear.mock.calls).toHaveLength(168);
  } finally {
    streams.close();
    intervals.mockRestore();
    clear.mockRestore();
  }
});
