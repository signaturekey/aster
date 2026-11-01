export type Direction = -1 | 1;

// Match the approved prototype: distances scale with card width, while a flick
// needs both real travel and same-direction velocity to reject accidental taps.
export const SWIPE = {
  distanceRatio: 0.3,
  flickVelocity: 650,
  flickMinDistance: 28,
  maxTilt: 13,
  depthY: 17,
  depthScale: 0.055,
  depthTilt: -3.2,
  returnSpring: { type: "spring", stiffness: 130, damping: 23, mass: 1.25 },
  exitMinSeconds: 0.18,
  exitMaxSeconds: 0.38,
  exitPixelsPerSecond: 3000,
  exitEase: [0.2, 0.65, 0.45, 1],
  reducedFadeSeconds: 0.12,
} as const;

export function swipeDecision(
  offset: number,
  velocity: number,
  width: number,
): Direction | null {
  if (Math.abs(offset) >= width * SWIPE.distanceRatio)
    return offset > 0 ? 1 : -1;
  if (
    Math.abs(offset) >= SWIPE.flickMinDistance &&
    Math.abs(velocity) >= SWIPE.flickVelocity &&
    Math.sign(offset) === Math.sign(velocity)
  )
    return offset > 0 ? 1 : -1;
  return null;
}

export function exitTarget(viewportWidth: number, cardWidth: number) {
  return viewportWidth / 2 + cardWidth;
}
export function exitDuration(
  offset: number,
  viewportWidth: number,
  cardWidth: number,
) {
  return Math.max(
    SWIPE.exitMinSeconds,
    Math.min(
      SWIPE.exitMaxSeconds,
      (exitTarget(viewportWidth, cardWidth) - Math.abs(offset)) /
        SWIPE.exitPixelsPerSecond,
    ),
  );
}
