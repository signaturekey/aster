# Tasks

## 1. Isolated foundation and navigation

- [x] 1.1 Create `prototypes/interface` with pinned React/TypeScript/Vite/Motion/Router and actual Avel fonts, strict self-contained config and alias; verify frozen install, standalone typecheck/build and no backend workspace changes.
- [x] 1.2 Implement DESIGN.md tokens, shared UI primitives, responsive app shell, route map, active navigation, document titles, fallback page and visible demo/reset controls; verify direct URLs/back-forward and 390/1440 navigation, document startup at port 5175 and the untouched 5173 prototype.
- [x] 1.3 Add coherent fictional in-memory fixtures and small reducer/validation helpers; unit-test reset and core immutable transitions, document no API/storage/credential persistence and verify local-only network requests.

## 2. Identity and profiles

- [x] 2.1 Build sign-in/register local-preview forms with clear demo entry, validation and no stored password; verify keyboard submit, invalid input, onward navigation and document the difference from real authentication.
- [x] 2.2 Build onboarding, own/public profile and profile editing with skills/goals/links, completeness and opt-in; unit-test field limits/completeness, verify edits propagate and foreign professional views omit private account data.

## 3. People discovery and matches

- [x] 3.1 Implement people deck, filters, profile links, counter and incomplete/opt-out/empty treatments using stable keyed motion and dislike/like/arrow alternatives; unit-test filtering/once decisions and inspect short return, flick, bounded exit, mobile scroll and repeated commands in Chromium.
- [x] 3.2 Build local people-match celebration, matches list and direct-thread links without incoming-like or arbitrary-chat features; verify reciprocal fixture outcome, focus/Escape, reduced motion, once-only records and demo reset, and document the people/project distinction.

## 4. Projects and applications

- [x] 4.1 Build project catalogue, detail/roster and my-project views with local navigation/search and recruitment status; verify open/closed/member/owner fixture layouts at 390/1440 and document fixture coverage.
- [x] 4.2 Build create/edit project forms and recruitment close/reopen with current contract limits and owner-only actions; unit-test validation/permissions and verify new/edited content propagates across local lists and detail.
- [x] 4.3 Build application compose/history/withdraw and owner accept/reject inbox; unit-test duplicate pending prevention, rejected/withdrawn resubmission, closed-recruitment blocking and accepted membership; verify the applicant/owner local journey and record it.
- [x] 4.4 Build owner roster management, transfer and member leave/remove confirmations; unit-test owner leave restriction and current-membership changes, verify UI role changes and no re-add from old accepted outcomes.

## 5. Conversations and state previews

- [x] 5.1 Build responsive conversation list/direct and project threads with composer and local history; unit-test nonblank/4000 limit and once append, verify retained drafts on invalid send, current-member access, project history and no fake delivery/presence indicators.
- [x] 5.2 Add segregated state-preview controls and meaningful loading/empty/error/expired/unavailable/conflict/validation treatments; verify documented preview URLs/actions, keyboard recovery, meaningful focus and absence of real service failure/success claims.

## 6. Integrated verification

- [x] 6.1 Drive the complete local journey through all routes at 390/1440 (spot-check 320/768/2560), review screenshots against DESIGN.md/Avel, inspect overflow, form errors, modal focus, keyboard, reset, reduced motion and touch scroll; record captures and precise limitations in the prototype verification document.
- [x] 6.2 Run prototype frozen install/typecheck/unit/build and root check/typecheck/unit/API-client builds; verify original prototype still builds and no backend/runtime requests leak into the new UI, record results without claiming database/Docker/hosted CI verification.

## Workflow follow-up

- Planning does not mark any implementation task complete. Present artifacts before the apply workflow; wait for the next explicit user request as required by propose.
- Keep both prototypes and canonical backend specs unchanged until implemented verification or separate follow-up warrants changes.
- No commits/pushes/deployment are authorized. Hosted CI remains unverified; do not equate local completion with project-wide hosted completion.

## 7. User refinements

- [x] 7.1 Restore text `aster.` wordmark with trailing orange dot in app and authentication pages; verify desktop/mobile rendering, strict build and lint without adding an unapproved landing page.
- [x] 7.2 Correct original logo-only Manrope 600 and circular trailing dot; fix input/select/textarea values inheriting semibold labels, verify Avel source comparison, computed styles at 390/1440 and build/lint.
- [x] 7.3 Research requested landing references, build original motion landing at `/` preserving current app routes and branding, verify 390/1440 composition, CTA/anchor navigation, scroll effects, reduced motion, overflow and checks; document unavailable sources honestly.
- [x] 7.4 Slow landing card assembly to 1.55s and extend scroll convergence without altering app swipe physics; verify moving/settled positions at 390/1440, reduced motion, build and lint.
