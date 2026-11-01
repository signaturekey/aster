import { describe, expect, test } from "bun:test";
import {
  ApiError,
  errorMessage,
  responseError,
  unwrap,
} from "@web/shared/api/errors";
import {
  fieldLimits,
  nonblank,
  parseLinks,
  safeReturnPath,
  textLength,
  validateLinks,
  within,
} from "@web/shared/lib/forms";
import {
  SessionChanged,
  SessionLifecycle,
  SessionScope,
  type SessionState,
} from "@web/shared/lib/session-scope";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const rejectionOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("Expected the operation to reject");
    },
    (error: unknown) => error,
  );

describe("public errors", () => {
  test("normalizes native auth and product envelopes without exposing internal messages", () => {
    expect(
      responseError(409, {
        error: { code: "CONFLICT", message: "private SQL" },
      }).code,
    ).toBe("CONFLICT");
    const auth = responseError(401, {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "private provider",
    });
    expect(errorMessage(auth)).toBe("Неверная почта или пароль.");
    expect(errorMessage(new ApiError(500, "private SQL"))).not.toContain("SQL");
    expect(errorMessage(new Error("offline"))).toContain("соединение");
    expect(errorMessage(new ApiError(401, "UNAUTHENTICATED"))).toContain(
      "Войдите",
    );
  });
  test("unwrap retains inferred data and rejects API failures", async () => {
    expect(
      await unwrap(Promise.resolve({ data: { value: 1 }, error: null })),
    ).toEqual({ value: 1 });
    expect(
      unwrap(
        Promise.resolve({ data: null, error: { status: 403, value: {} } }),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("form boundaries", () => {
  test("counts Unicode code points and requires nonblank input", () => {
    expect(textLength("😀")).toBe(1);
    expect(within("😀".repeat(80), 80)).toBe(true);
    expect(within("a".repeat(81), 80)).not.toBe(true);
    expect(nonblank(" \n ")).not.toBe(true);
    expect(nonblank("Привет")).toBe(true);
  });
  test("converts links and validates supported URL shapes", () => {
    expect(
      parseLinks(" https://example.com\n\nhttp://example.org "),
    ).toHaveLength(2);
    expect(validateLinks("https://example.com")).toBe(true);
    for (const value of [
      "javascript:alert(1)",
      "https:example.com",
      "https://host/a b",
      "https:///host",
      Array(6).fill("https://a.test").join("\n"),
    ])
      expect(validateLinks(value)).not.toBe(true);
  });
  test("accepts profile text and portfolio limits exactly, not one beyond", () => {
    expect(fieldLimits).toMatchObject({
      displayName: 80,
      bio: 2000,
      skills: 20,
      goals: 5,
      links: 5,
      link: 2048,
    });
    for (const max of [fieldLimits.displayName, fieldLimits.bio]) {
      expect(within("😀".repeat(max), max)).toBe(true);
      expect(within("😀".repeat(max + 1), max)).not.toBe(true);
      // An incomplete profile is allowed to save; nonblank is not a save rule.
      expect(within("", max)).toBe(true);
    }
    const link = "https://a.test/";
    const atLimit = link + "a".repeat(fieldLimits.link - link.length);
    expect(validateLinks(atLimit)).toBe(true);
    expect(validateLinks(atLimit + "a")).not.toBe(true);
    expect(validateLinks(Array(5).fill(link).join("\n"))).toBe(true);
    expect(validateLinks(Array(6).fill(link).join("\n"))).not.toBe(true);
    expect(validateLinks("")).toBe(true);
  });
  test("only accepts safe internal redirects", () => {
    expect(safeReturnPath("/projects/a?tab=team")).toBe("/projects/a?tab=team");
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/%2f%2fevil.test",
      "/\\evil.test",
      "/%5cevil.test",
      "/sign-in",
      null,
    ])
      expect(safeReturnPath(value)).toBe("/discover");
  });
});

const person = (id: string): NonNullable<SessionState["me"]> => ({
  id,
  email: `${id}@example.test`,
  name: id,
  profile: {
    userId: id,
    displayName: id,
    bio: "",
    specializationId: null,
    experienceId: null,
    skillIds: [],
    goalIds: [],
    portfolioLinks: [],
    discoverable: false,
    complete: false,
    missingFields: ["specializationId", "skillIds", "goalIds"],
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
  },
});
const sessionHarness = () => {
  let state: SessionState = { me: null, loading: true, error: null };
  let cleared = 0;
  const requests: ReturnType<
    typeof deferred<NonNullable<SessionState["me"]>>
  >[] = [];
  const session = new SessionLifecycle(
    () => {
      const request = deferred<NonNullable<SessionState["me"]>>();
      requests.push(request);
      return request.promise;
    },
    () => {
      cleared += 1;
    },
    (next) => {
      state = next;
    },
  );
  return {
    session,
    requests,
    get state() {
      return state;
    },
    get cleared() {
      return cleared;
    },
  };
};

describe("session lifecycle", () => {
  test("StrictMode abandoned bootstrap cannot dismiss the replay loading guard", async () => {
    const h = sessionHarness();
    const first = h.session.refresh();
    h.session.scope.reset();
    const replay = h.session.refresh();
    h.requests[0]!.resolve(person("old"));
    expect(await first).toBeNull();
    expect(h.state).toEqual({ me: null, loading: true, error: null });
    h.requests[1]!.resolve(person("current"));
    expect((await replay)?.id).toBe("current");
    expect(h.state.loading).toBe(false);
    expect(h.state.me?.id).toBe("current");
  });

  test("newer refresh wins over older success, 401 and network failure", async () => {
    for (const late of [
      person("old"),
      new ApiError(401, "EXPIRED"),
      new Error("offline"),
    ]) {
      const h = sessionHarness();
      const old = h.session.refresh();
      const next = h.session.refresh();
      h.requests[1]!.resolve(person("current"));
      await next;
      h.session.scope.setDraft("thread", "current account");
      if (late instanceof Error) h.requests[0]!.reject(late);
      else h.requests[0]!.resolve(late);
      expect(await old).toBeNull();
      expect(h.state.me?.id).toBe("current");
      expect(h.state.error).toBeNull();
      expect(h.session.scope.draft("thread")).toBe("current account");
      expect(h.cleared).toBe(0);
    }
  });

  test("account replacement clears cache, drafts, resources and late operations", async () => {
    const h = sessionHarness();
    const first = h.session.refresh();
    h.requests[0]!.resolve(person("a"));
    await first;
    let closed = 0;
    h.session.scope.onReset(() => {
      closed += 1;
    });
    h.session.scope.setDraft("thread", "private a");
    const pending = deferred<string>();
    const stale = h.session.run(() => pending.promise);
    const refresh = h.session.refresh();
    h.requests[1]!.resolve(person("b"));
    await refresh;
    pending.resolve("private a");
    expect(await rejectionOf(stale)).toBeInstanceOf(SessionChanged);
    expect(h.state.me?.id).toBe("b");
    expect(h.state.loading).toBe(false);
    expect(h.session.scope.draft("thread")).toBe("");
    expect(closed).toBe(1);
    expect(h.cleared).toBe(1);
  });

  test("network failure preserves a valid account but product 401 expires it", async () => {
    const h = sessionHarness();
    const first = h.session.refresh();
    h.requests[0]!.resolve(person("a"));
    await first;
    h.session.scope.setDraft("thread", "recoverable");
    const refresh = h.session.refresh();
    const offline = new Error("offline");
    h.requests[1]!.reject(offline);
    expect(await rejectionOf(refresh)).toBe(offline);
    expect(h.state.me?.id).toBe("a");
    expect(h.state.error).toBe(offline);
    expect(h.session.scope.draft("thread")).toBe("recoverable");
    expect(
      await rejectionOf(
        h.session.run(() => Promise.reject(new ApiError(401, "EXPIRED"))),
      ),
    ).toBeInstanceOf(ApiError);
    expect(h.state).toEqual({ me: null, loading: false, error: null });
    expect(h.session.scope.draft("thread")).toBe("");
    expect(h.cleared).toBe(1);
  });

  test("logout failure preserves the session and successful logout blocks late refresh", async () => {
    const h = sessionHarness();
    const first = h.session.refresh();
    h.requests[0]!.resolve(person("a"));
    await first;
    h.session.scope.setDraft("thread", "draft");
    const offline = new Error("offline");
    expect(
      await rejectionOf(h.session.logout(() => Promise.reject(offline))),
    ).toBe(offline);
    expect(h.state.me?.id).toBe("a");
    expect(h.session.scope.draft("thread")).toBe("draft");
    const late = h.session.refresh();
    await h.session.logout(() => Promise.resolve());
    h.requests[1]!.resolve(person("a"));
    expect(await late).toBeNull();
    expect(h.state).toEqual({ me: null, loading: false, error: null });
    expect(h.session.scope.draft("thread")).toBe("");
  });

  test("authentication isolates bootstrap, suppresses focus and restores the new account", async () => {
    const h = sessionHarness();
    const bootstrap = h.session.refresh();
    const credentials = deferred<void>();
    h.session.scope.setDraft("thread", "previous");
    const auth = h.session.authenticate(() => credentials.promise);
    expect(h.session.scope.draft("thread")).toBe("");
    expect(await h.session.refresh()).toBeNull();
    expect(h.requests).toHaveLength(1);
    h.requests[0]!.reject(new ApiError(401, "OLD_SESSION"));
    await bootstrap;
    expect(h.state.loading).toBe(true);
    credentials.resolve();
    // Flush only the async credential exchange; no timer or browser required.
    await Promise.resolve();
    await Promise.resolve();
    h.requests[1]!.resolve(person("b"));
    expect((await auth)?.id).toBe("b");
    expect(h.state).toEqual({ me: person("b"), loading: false, error: null });
    expect(h.cleared).toBe(1);
  });

  test("credential errors stay local and clear old bootstrap network error", async () => {
    const h = sessionHarness();
    const bootstrap = h.session.refresh();
    h.requests[0]!.reject(new Error("offline"));
    expect(await rejectionOf(bootstrap)).toBeInstanceOf(Error);
    const wrong = new ApiError(401, "INVALID_EMAIL_OR_PASSWORD");
    expect(
      await rejectionOf(h.session.authenticate(() => Promise.reject(wrong))),
    ).toBe(wrong);
    expect(h.state).toEqual({ me: null, loading: false, error: null });
    // One reset starts authentication; native 401 does not expire it again.
    expect(h.cleared).toBe(1);
  });

  test("late native authentication cannot publish over another auth attempt", async () => {
    const h = sessionHarness();
    const old = deferred<void>();
    const first = h.session.authenticate(() => old.promise);
    const current = deferred<void>();
    const second = h.session.authenticate(() => current.promise);
    old.resolve();
    expect(await rejectionOf(first)).toBeInstanceOf(SessionChanged);
    expect(h.state.loading).toBe(true);
    expect(h.requests).toHaveLength(0);
    current.resolve();
    await Promise.resolve();
    await Promise.resolve();
    h.requests[0]!.resolve(person("b"));
    await second;
    expect(h.state.me?.id).toBe("b");
  });
});

describe("session generations", () => {
  test("cancels requests, clears drafts and closes event resources", async () => {
    const scope = new SessionScope();
    let closed = 0;
    scope.onReset(() => {
      closed += 1;
    });
    scope.setDraft("a", "Первый");
    scope.setDraft("b", "Второй");
    const signal = scope.signal;
    const pending = deferred<string>();
    const request = scope.run(() => pending.promise);
    scope.reset();
    pending.resolve("old account");
    expect(request).rejects.toBeInstanceOf(SessionChanged);
    expect(signal.aborted).toBe(true);
    expect(scope.draft("a")).toBe("");
    expect(scope.draft("b")).toBe("");
    expect(closed).toBe(1);
    expect(await scope.run(() => Promise.resolve("new account"))).toBe(
      "new account",
    );
  });
  test("late failures cannot expire a subsequent account", async () => {
    const scope = new SessionScope();
    const pending = deferred<string>();
    const request = scope.run(() => pending.promise);
    scope.reset();
    pending.reject(new ApiError(401, "OLD_SESSION"));
    expect(request).rejects.toBeInstanceOf(SessionChanged);
  });
  test("drafts belong to individual conversations", () => {
    const scope = new SessionScope();
    scope.setDraft("a", "A");
    scope.setDraft("b", "B");
    scope.setDraft("a", "");
    expect(scope.draft("a")).toBe("");
    expect(scope.draft("b")).toBe("B");
  });
});
