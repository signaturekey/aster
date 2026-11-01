// Landing-only motion: native scrolling remains in charge. User-driven deck physics
// live separately so editorial tuning cannot reintroduce the old swipe settling tail.
export const LANDING_MOTION = {
  reveal: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  // A duration-based assembly keeps the full approach visible instead of snapping
  // through most of the distance in the first few spring frames.
  assemble: { type: "tween", duration: 1.55, ease: [0.25, 0.1, 0.25, 1] },
  storyProgressEnd: 0.95,
  staggerSeconds: 0.075,
  heroDrift: 55,
  storyTravel: 58,
  reducedFadeSeconds: 0.15,
} as const;
