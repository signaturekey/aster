import { api } from "@web/shared/api/client";
import { unwrap } from "@web/shared/api/errors";

export type DiscoveryQuery = NonNullable<
  NonNullable<Parameters<typeof api.api.v1.discovery.get>[0]>["query"]
>;
export type DiscoveryFilters = Pick<
  DiscoveryQuery,
  "specializationId" | "experienceId" | "skillIds" | "goalIds"
>;
export type Decision = Parameters<
  ReturnType<typeof api.api.v1.discovery.decisions>["put"]
>[0]["value"];

export const loadDiscovery = (
  filters: DiscoveryFilters,
  cursor: string | undefined,
  signal: AbortSignal,
) =>
  unwrap(
    api.api.v1.discovery.get({
      query: { ...filters, limit: 20, ...(cursor ? { cursor } : {}) },
      fetch: { signal },
    }),
  );
export const saveDecision = (
  targetUserId: string,
  value: Decision,
  signal: AbortSignal,
) =>
  unwrap(
    api.api.v1.discovery
      .decisions({ targetUserId })
      .put({ value }, { fetch: { signal } }),
  );
export const loadMatches = (cursor: string | undefined, signal: AbortSignal) =>
  unwrap(
    api.api.v1.matches.get({
      query: { limit: 20, ...(cursor ? { cursor } : {}) },
      fetch: { signal },
    }),
  );
export type DiscoveryPageData = Awaited<ReturnType<typeof loadDiscovery>>;
export type Person = DiscoveryPageData["items"][number];
export type Match = Awaited<ReturnType<typeof loadMatches>>["items"][number];
export type DecisionResult = Awaited<ReturnType<typeof saveDecision>>;
