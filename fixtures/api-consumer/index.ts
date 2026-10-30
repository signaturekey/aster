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

// @ts-expect-error Health has no mutation route.
api.health.post;
// @ts-expect-error Invalid fetch credentials must not be accepted.
createApiClient("http://localhost:3000", { fetch: { credentials: "invalid" } });
