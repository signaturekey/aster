# Design

## Boundary

A standalone Bun-managed React + TypeScript + Vite + Motion experiment in `prototypes/swipe-cards`, not an API workspace or the start of `apps/web`. Root API scripts and lockfile remain unchanged. No backend imports, fetches, storage or authentication. Save/skip outcomes live in memory and reset on reload/restart.

## Sources inspected on 2026-10-31

- Official guide: https://raw.githubusercontent.com/anthropics/skills/main/skills/brand-guidelines/SKILL.md — palette and Poppins/Lora fallback guidance.
- https://www.anthropic.com/ — inspected in Chromium at 1440 and 390 px, including screenshots and computed CSS. Background rgb(250,249,245), text rgb(20,20,19), proprietary anthropicSerif/anthropicSans, spacious editorial sans/serif pairing, restrained borders. Adapt the pairing with open, Cyrillic-capable Lora and Manrope, not proprietary font assets or branding.
- https://motion.dev/docs/react-drag — horizontal drag, no release inertia, motion values and offset/velocity.
- https://motion.dev/docs/react-accessibility — reducedMotion and useReducedMotion; imperative motion-value animations require explicit reduced-motion alternatives too.

Original proposals: abstract line illustrations, paper deck, six fictional projects, and tuned swipe physics. No other gallery references. The first asymmetric composition was superseded by the user's 2026-10-31 refinement: a horizontally centered deck with a compact centered introduction, stronger Lora 500/Manrope 500 weights, and slower automatic springs. Direct pointer tracking and reduced-motion alternatives remain unchanged. A subsequent user review requested the news page's stronger typography: https://www.anthropic.com/news was inspected at 1440/390 in Chromium (headings 700, body 16–17px, labels 13–15px). That pass used Manrope 700 headings and a 16px body, but the user found the scale oversized. The subsequent user-selected reference is https://github.com/signaturekey/avel/tree/main: catalog, assistant-run and login screenshots were inspected alongside index.css, assistant-card, button, topbar, brand and catalog source. Its compact 13–14px body, restrained bold names, selective italic serif introduction, white rounded surfaces and pill controls inform the current adaptation. The user subsequently explicitly requested Avel's actual fonts, not substitutes. Preserve the original official palette but replace Manrope/Lora with locally bundled Plus Jakarta Sans, Fraunces and JetBrains Mono and Avel's exact fallback chains, base 14px/1.45/-0.005em, description 13px/1.5, project name 15px/700/-0.01em. Cyrillic glyphs missing from the fonts follow the original system fallback stack (verified via Chromium platform-font inspection). Card headlines remain 22–23px, serif introduction 30–36px and controls 14px. Header wordmark/note share centered 36px flex boxes without the earlier manual offset. Leave 76px after the deck's layout box, yielding 33–41px after rotated back layers. Centered deck, 20px card radii and reduced empty height keep the swipe interaction dominant.

## Interaction

Keep stable keyed card components as they move through three deck depths. Shared horizontal motion value drives the active card directly (no smoothing spring on pointer tracking), rotation, gradual action stamps, and the next cards' interpolated depth transforms. Imperative animation handles spring return and off-viewport exit. Hold the decision lock from acceptance until the outgoing card's rotated bounding box clears the viewport plus shadow clearance, then increment exactly once and stop its invisible spring tail. Guard the visibility and completion callbacks together so they cannot consume twice. The drag guard prevents keyboard/button input from racing an active pointer gesture. Cancelled touch gestures return home.

Distance threshold is a fraction of measured card width; a short fast flick requires a minimum intentional travel, velocity threshold, and same-direction travel/velocity. All thresholds, depth offsets and spring settings are exported from one settings file. Reduced motion removes tilt/depth motion and replaces exit travel with a brief fade; direct user-controlled horizontal movement remains available. `touch-action: pan-y` reserves vertical native scrolling; clip outgoing cards at the page shell, not the deck.

## Verification

Use existing cached Playwright/Chromium for one-off browser inspection, not a committed E2E suite. Check 390 and 1440, return, slow distance and fast velocity decisions, buttons, keys, repeated commands, full deck/restart, scroll width during exit, mobile native touch scrolling and reduced motion. Run standalone typecheck/build/unit checks and root lint/types/unit/build for regression. PostgreSQL, Docker and hosted CI are not touched; no commits/pushes are authorized, so hosted verification cannot be claimed.

## Page composition refinement — 2026-10-31

The user requested a fuller composition after reviewing the sparse centered page. Keep the deck horizontally centered and retain its typography, gestures and button-free controls. At wide desktop widths, flank it with quiet editorial context: example project formats on the left and an explanation of collaboration on the right. These are static copy, not filters, activity counts or new functionality. Decorative overlapping paper shapes suggest collaboration without representing real users. Below the three-column breakpoint, show this supporting material after the deck. Bound extra vertical whitespace rather than anchoring the footer to arbitrarily tall viewports. Preserve mobile reading order, native scrolling and the existing palette; no backend or product behavior changes.

## Latest control refinement

Permanent action buttons and visible save/skip captions were removed at the user request. Keyboard arrows and drag-only stamps remain. Accepted exits now use monotonic 180–380ms tweens independent of release velocity; spring return remains unchanged. Actual physical trackpad/Zen behavior requires user confirmation.
