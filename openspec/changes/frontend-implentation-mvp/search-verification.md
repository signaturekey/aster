# Project catalogue search — task 5.1

## API contract

Authenticated `GET /api/v1/projects` accepts optional scalar filters alongside the existing `limit` and `cursor`:

- `q`: PostgreSQL-safe text, at most 200 supplied characters before trimming. Leading/trailing whitespace is trimmed; empty/whitespace-only text adds no text condition. Matching is a case-insensitive literal substring of **title OR description**. `%`, `_` and `\` are escaped as literal characters; the SQL pattern is parameterized, not interpolated SQL.
- `goalId`: one existing dictionary goal identifier, 1–80 characters. It combines with the complete text condition using **AND**. Unknown identifiers return HTTP 422 / `INVALID_DICTIONARY_VALUE`, even if the text would match nothing. Empty/oversized/unsafe fields and repeated `q`/`goalId` parameters return HTTP 422 / `VALIDATION_ERROR`.
- Filters apply in PostgreSQL before cursor slicing and `limit + 1`. Ordering remains descending `(created_at, id)`; responses remain `{ items, nextCursor }`, with default limit 20 and maximum 50. Closed recruitment projects remain searchable. There are no totals or relevance ranking.
- Keep the same filters on subsequent cursor requests. Restart pagination when filters change; cursors do not encode filter context. Existing invalid-cursor handling is unchanged.
- `/api/v1/me/projects` and other collection route schemas are unchanged; this addition belongs to the public authenticated catalogue only.

Example: `/api/v1/projects?q=design&goalId=startup&limit=20`. Use normal URL encoding for literal wildcard/backslash searches.

## Index review

Reviewed `001_initial.sql` and `002_membership_user_indexes.sql`. The existing `projects_created_at_id_idx` supports the retained ordering/cursor tuple. Ordinary B-tree text indexes do not address leading-wildcard `ILIKE '%text%'` searches. No representative-scale performance evidence establishes a need for a goal/order composite index, trigram extension/index, or dedicated search infrastructure in this local MVP. No migration or speculative index is added. These functional tests are not a production-scale performance claim.

## Local verification

Verified on 2026-10-31 in the approved frontend worktree, using Bun 1.4.4. All database commands targeted only the provided disposable `aster_test` database on `localhost:56443` with user `aster_test`; no working database reset occurred. The new suite creates/migrates/seeds a randomly named private schema and drops only that schema on completion. Existing project regression suites retain their existing disposable-database behavior. No concurrent integration runner was used.

Passed:

```sh
bunx eslint apps/api/src/modules/projects/{schemas,routes,service}.ts apps/api/tests/{unit,integration}/project-search.test.ts
bun test apps/api/tests/unit/project-search.test.ts apps/api/tests/unit/pagination.test.ts apps/api/tests/unit/strings.test.ts
bun run --filter @aster/api typecheck
ASTER_INTEGRATION=1 DATABASE_URL="$ISOLATED_TEST_DATABASE_URL" bun test --isolate apps/api/tests/integration/project-search.test.ts apps/api/tests/integration/projects.test.ts apps/api/tests/integration/kysely-projects.test.ts
bunx prettier --check apps/api/src/modules/projects/{schemas,routes,service}.ts apps/api/tests/{unit,integration}/project-search.test.ts openspec/changes/frontend-implentation-mvp/search-verification.md
```

`ISOLATED_TEST_DATABASE_URL` above denotes the supplied disposable URL, not an ordinary development connection. Unit result: **8 passed, 0 failed**, including **2 new search tests**. PostgreSQL result: **28 passed, 0 failed**, including **6 new search tests**. API typecheck and scoped ESLint passed.

New coverage includes matches outside the first default unfiltered page, title/description case-insensitive OR, trimmed and blank text, combined goal/text traversal across multiple pages, tied creation timestamps and ID ordering, literal `%`/`_`/backslash and SQL-looking input, valid 200-character and invalid 201-character inputs, unknown/empty/oversized/unsafe/repeated goals, repeated text, existing cursor/limit errors, authentication, and unchanged inclusion of closed recruitment projects. Unit schemas also reject lone UTF-16 surrogates without relying on URL encoding behavior.

Initial local failures were corrected: the private-schema fixture now initializes Better Auth after migration; repeated scalar filters are explicitly rejected because Elysia otherwise selects a single value. A test assertion's unnecessary `await` was removed to satisfy the repository's type-aware lint rule. Final commands above passed after those fixes.

Limitations: scoped verification only, not the full repository checks/builds, Docker startup, frontend/manual browser acceptance, or hosted CI. No commits or pushes. Task checklist and main `verification.md` deliberately unchanged by this task owner. Canonical specs are unchanged; the existing canonical capabilities contain no project-search requirements, and synchronization is a separate workflow.
