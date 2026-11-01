# Projects

Named route exports (mount within the authenticated shell):

- `ProjectsPage` — `/projects`
- `MyProjectsPage` — `/my-projects`
- `ProjectDetailPage` — `/projects/:projectId`
- `ProjectManagePage` — `/projects/:projectId/manage`
- `ProjectFormPage` — `/projects/new` and `/projects/:projectId/edit`
- `ApplicationsPage` — `/applications`

## Behavior

Eden-derived DTOs and authenticated HTTP are the only data source. No prototype
fixtures or totals are used. Catalogue `q`/`goalId` live in the URL, combine with
AND on the server, and form part of account-scoped Query keys. Changing filters
starts a fresh cursor chain. Lists/roster/history use explicit load-more controls,
newest-created first, deduplicating cursor overlap; they are not snapshots.
“My projects” means current owner/member projects, not accepted application history.

RHF converts newline-separated roles and selected dictionary IDs to the current
API payload. Title/description/roles/skills/application bounds match the API;
Unicode lengths count code points. Server validation remains authoritative and
unknown 422 errors are form-level errors. Creation requires a complete profile
and opens recruitment. Edit/management require the current project owner.

Application history retains terminal outcomes. Pending applications can be
withdrawn; rejected/withdrawn applicants can revisit an open project to apply
again. Accepted history never proves current membership. Participation checks
traverse `/me/projects` and, for nonmembers, `/me/applications` rather than assuming
the first public roster page is complete. Owner acceptance is hidden when closed;
rejection and withdrawal remain available. The server resolves races and stale
permissions. Conflicts/transport failures reconcile affected Query roots instead
of fabricating optimistic membership. Repeated clicks are guarded; writes never
automatically retry. Application cards link to real candidate profiles.

Removal, leave and transfer use accessible Radix confirmation dialogs with
cancel-first focus and errors inside the dialog. Transfer targets are current
loaded nonowner roster members. Owners must transfer before leaving. Removing or
leaving revokes team-chat access; accepted history does not restore it. Chat links
resolve the persisted conversation ID through authenticated conversation pages.
There is no arbitrary create-chat operation or assumed project/conversation ID.

Mutations invalidate `projects`, `applications`, `conversations`, and `messages`
roots, including current participation. Query/navigation/focus/reconnect and
explicit refresh reconcile remote changes; there is no polling or project SSE.
Session `run` plus combined abort signals reject old-account completions; callbacks
check their original session signal before navigation/reset. Drafts remain only
in component memory. Unsaved forms warn on reload/close and link navigation.
The shared data-router blocker also warns on Back/Forward traversal. No reload persistence is provided.

## Verification

Pure helper suite: `bun test apps/web/src/entities/project/helpers.test.ts`.
Run web typecheck and scoped ESLint/Prettier for the three project directories.

Still requires real two-account browser verification: filter matches beyond page
one, load-more and cursor recovery; create/edit/save/reload and close/reopen;
apply/duplicate/withdraw/reapply; accept/reject versus closure races; transfer then
leave, removal and revoked chat history; stale owner URLs; network/expiry/account
switch during writes; dialog focus restoration, dirty warnings and visual checks
at 390/1440 plus narrow overflow and keyboard/reduced-motion review. No DB tests,
backend race verification, screenshots, hosted CI or container execution are
claimed by this feature implementation.
