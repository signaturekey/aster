# Discovery and matches

Route components exported for app/router composition:

- `DiscoveryPage` from `@web/pages/discovery/DiscoveryPage` → `/discover`.
- `MatchesPage` from `@web/pages/discovery/MatchesPage` → `/matches`.

Both run inside the existing authenticated route guard, SessionProvider and QueryClientProvider. They link to `/people/:personId` and `/messages/:conversationId`; routing itself is owned by app, not this slice.

## Real API behavior

All transport types are inferred from Eden. No fixture or prototype store is imported. Discovery requires a server-complete profile (name, specialization, at least one skill and goal) and explicit discovery opt-in. Ineligible people get a profile-settings link, not a fabricated deck; other product routes remain available. The server rechecks prerequisites and current target state on every decision.

URL filters use `specializationId`, `experienceId`, repeated `skillIds` and repeated `goalIds`. Categories combine with AND, all skills must match, any selected goal may match. IDs, not dictionary labels, are sent. Blank values are omitted; arrays are deduplicated/sorted for stable account-scoped Query keys. Unknown IDs reach server validation, while oversized URLs show a recoverable filter error. Changing filters discards any URL cursor; each normalized filter key owns fresh infinite-query pagination. Browser back/forward restores filter contexts. Clear filters does not clear decisions.

The deck reads cursor pages, deduplicates people by user ID and offers explicit load-more without invented totals. A consumed loaded page with a next cursor is not exhaustion. No items and no next cursor means no eligible undecided people **in this current filter context**, not that no people exist globally. Decisions persist on the server across reloads. There is no reset/undo. Refresh restarts cursor loading and reloads own profile; focus/reconnect use Query reconciliation, not polling or non-message SSE.

Like/skip uses a synchronous token guard shared by gesture, buttons and arrow-key input; automatic mutation retries are disabled. The next card appears only after HTTP acknowledgement and the exit animation. Failure retains the card, returns its position and explains that no decision was confirmed. A lost response may already have committed server-side: users can explicitly retry or refresh, but the browser never invents success. Pending requests cancel in-flight discovery reads and suppress focus/reconnect reads until completion; session-generation checks and an unmount check reject late UI completions. Other cached discovery filter contexts lose only the confirmed person.

Motion mirrors the interface reference: width-relative displacement, same-direction flick threshold, weighted spring return, responsive stacked depth/tilt and bounded tween exits. Reduced motion keeps direct pointer tracking but removes tilt/depth interpolation and uses a brief fade instead of an offscreen exit. `touch-action: pan-y` retains native vertical scrolling; card content can expand for long real skills/names. Buttons and unmodified, non-repeating left/right arrows are alternatives; editable controls, links, buttons and dialogs do not trigger global arrows.

Celebration is an accessible Radix dialog shown only when the decision response includes an actual match. A one-sided like does not open a chat. Matches load persisted cursor pages and hydrate only the existing public profile projection because match DTOs contain participant IDs, not names. A failed peer-profile load does not erase an existing match or its server-provided conversation link. Match/conversation caches invalidate on confirmed decisions. Match/profile lists refresh on focus/reconnect/navigation and have explicit refresh controls; no immediate remote non-message push is promised.

## Verification boundaries

Pure tests in `entities/discovery/filters.test.ts` cover URL normalization, AND/ALL/ANY transport mapping, filter/account cache separation and limits. `features/discovery/decision-guard.test.ts` covers duplicate commands, failure recovery, stale completions and swipe thresholds. They do not claim PostgreSQL filtering, server race or browser gesture coverage.

Remaining manual acceptance (not executed by this slice): a real two-account reciprocal match, one-sided like, skip/reload persistence, API filtering across cursor pages, opt-out/stale eligibility, unavailable/offline response and explicit recovery. Inspect 390/1440 and narrow/wide layouts, actual Cyrillic typography, long real profiles, modal keyboard focus/return, drag/flick/cancel/spring return, reduced motion and native vertical touch scrolling on a real touch device. No browser tests or database tests were added or run for this work.
