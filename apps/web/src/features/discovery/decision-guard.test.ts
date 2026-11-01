import { describe, expect, test } from "bun:test";
import { DecisionGuard } from "./decision-guard";
import { exitDuration, exitTarget, SWIPE, swipeDecision } from "./motion";

describe("once-only decision guard", () => {
  test("one unresolved command rejects repeated keys/buttons/gestures for any person", () => {
    const guard = new DecisionGuard();
    const token = guard.begin("a");
    expect(token).not.toBeNull();
    expect(guard.begin("a")).toBeNull();
    expect(guard.begin("b")).toBeNull();
    expect(guard.settle(token!, "a", true)).toBe(true);
    expect(guard.begin("a")).toBeNull();
    expect(guard.begin("b")).not.toBeNull();
  });
  test("failure retains recoverability, and stale completions cannot release a newer attempt", () => {
    const guard = new DecisionGuard();
    const failed = guard.begin("a")!;
    expect(guard.settle(failed, "a", false)).toBe(true);
    const retry = guard.begin("a")!;
    expect(retry).not.toBe(failed);
    expect(guard.settle(failed, "a", true)).toBe(false);
    expect(guard.begin("b")).toBeNull();
    expect(guard.settle(retry, "a", true)).toBe(true);
    expect(guard.begin("a")).toBeNull();
  });
  test("a stale token cannot consume a card", () => {
    const guard = new DecisionGuard();
    expect(guard.settle(Symbol(), "a", true)).toBe(false);
    expect(guard.begin("a")).not.toBeNull();
  });
});

describe("approved swipe thresholds", () => {
  test("distance scales to card width and taps/reversals do not flick", () => {
    expect(swipeDecision(120, 0, 400)).toBe(1);
    expect(swipeDecision(-120, 0, 400)).toBe(-1);
    expect(swipeDecision(90, 0, 300)).toBe(1);
    expect(swipeDecision(27, 900, 400)).toBeNull();
    expect(swipeDecision(40, -900, 400)).toBeNull();
    expect(swipeDecision(40, 649, 400)).toBeNull();
    expect(swipeDecision(28, 650, 400)).toBe(1);
    expect(swipeDecision(-28, -650, 400)).toBe(-1);
  });
  test("bounded exits clear the viewport without an invisible spring tail", () => {
    expect(exitTarget(1440, 420)).toBe(1140);
    expect(exitDuration(0, 1440, 420)).toBeLessThanOrEqual(
      SWIPE.exitMaxSeconds,
    );
    expect(exitDuration(10000, 390, 350)).toBe(SWIPE.exitMinSeconds);
  });
});
