import type { api } from "@web/shared/api/client";
import { ApiError } from "@web/shared/api/errors";

export class SessionChanged extends Error {
  constructor() {
    super("Session changed while the operation was in progress");
    this.name = "SessionChanged";
  }
}

export class SessionScope {
  private generation = 0;
  private controller = new AbortController();
  private readonly cleanup = new Set<() => void>();
  private readonly drafts = new Map<string, string>();

  get signal() {
    return this.controller.signal;
  }

  onReset(cleanup: () => void) {
    this.cleanup.add(cleanup);
    return () => this.cleanup.delete(cleanup);
  }

  reset() {
    // Increment before cancellation: even uncancellable provider work must not
    // publish its completion into the next account's cache or UI.
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
    this.drafts.clear();
    for (const cleanup of this.cleanup) cleanup();
  }

  async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const generation = this.generation;
    try {
      const result = await operation(this.controller.signal);
      if (generation !== this.generation) throw new SessionChanged();
      return result;
    } catch (error) {
      if (generation !== this.generation) throw new SessionChanged();
      throw error;
    }
  }

  draft(id: string) {
    return this.drafts.get(id) ?? "";
  }

  setDraft(id: string, text: string) {
    if (text) this.drafts.set(id, text);
    else this.drafts.delete(id);
  }
}

type Me = NonNullable<Awaited<ReturnType<typeof api.api.v1.me.get>>["data"]>;
export type SessionState = {
  me: Me | null;
  loading: boolean;
  error: unknown;
};

// Keep async publication in one testable boundary: React effect replay and
// overlapping focus/online refreshes must obey the same account lifetime.
export class SessionLifecycle {
  readonly scope = new SessionScope();
  private account: string | null = null;
  private refreshVersion = 0;
  private authenticating: symbol | null = null;
  private state: SessionState = { me: null, loading: true, error: null };

  constructor(
    private readonly loadMe: (signal: AbortSignal) => Promise<Me>,
    private readonly clearCache: () => void,
    private readonly publish: (state: SessionState) => void,
  ) {}

  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.publish(this.state);
  }

  private clear() {
    this.scope.reset();
    this.authenticating = null;
    this.account = null;
    this.clearCache();
    this.update({ me: null, error: null, loading: false });
  }

  readonly refresh = async (): Promise<Me | null> => {
    // A focus event during native sign-in cannot revalidate the old cookie or
    // cancel the authentication attempt with an unrelated bootstrap 401.
    if (this.authenticating) return null;
    const version = ++this.refreshVersion;
    const signal = this.scope.signal;
    const current = () =>
      signal === this.scope.signal && version === this.refreshVersion;
    try {
      const next = await this.scope.run(this.loadMe);
      if (!current()) return null;
      if (this.account && this.account !== next.id) this.clear();
      this.account = next.id;
      this.update({ me: next, error: null, loading: false });
      return next;
    } catch (error) {
      if (error instanceof SessionChanged || !current()) return null;
      if (error instanceof ApiError && error.status === 401) {
        this.clear();
        return null;
      }
      this.update({ error });
      throw error;
    } finally {
      // The abandoned first StrictMode bootstrap must not dismiss the replay's
      // loading guard; the same applies to superseded focus/online requests.
      if (current()) this.update({ loading: false });
    }
  };

  readonly run = async <T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const signal = this.scope.signal;
    try {
      const result = await this.scope.run(operation);
      if (signal !== this.scope.signal) throw new SessionChanged();
      return result;
    } catch (error) {
      // Cancellation can occur between the scope promise settling and this
      // continuation; never interpret that old lifetime's 401 as current.
      if (signal !== this.scope.signal) throw new SessionChanged();
      if (error instanceof ApiError && error.status === 401) this.clear();
      throw error;
    }
  };

  readonly authenticate = async (
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<Me | null> => {
    // Native credential errors are not product-session expiry. Start a fresh
    // lifetime before invoking auth so old requests, streams and drafts cannot
    // survive the cookie transition, including ambiguous transport failures.
    this.clear();
    const attempt = Symbol();
    this.authenticating = attempt;
    const signal = this.scope.signal;
    this.update({ loading: true });
    try {
      await this.scope.run(operation);
      if (signal !== this.scope.signal) throw new SessionChanged();
      this.authenticating = null;
      return await this.refresh();
    } finally {
      // Once credential exchange succeeds, refresh owns the loading guard.
      if (this.authenticating === attempt) {
        this.authenticating = null;
        if (signal === this.scope.signal) this.update({ loading: false });
      }
    }
  };

  readonly logout = async (
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<void> => {
    // A transport failure cannot prove that the server discarded its cookie.
    const signal = this.scope.signal;
    await this.run(operation);
    if (signal !== this.scope.signal) throw new SessionChanged();
    this.clear();
  };
}
