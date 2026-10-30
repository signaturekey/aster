# Aster API (implemented endpoints)

Public liveness: `GET /health` → `{ status: "ok" }`, no database required.
Product prefix `/api/v1`, all product endpoints require a Better Auth session cookie.
Native Better Auth endpoints under `/api/auth` retain the provider's JSON/error contract.

## Identity

- `POST /api/auth/sign-up/email`: `{ name, email, password }` (password provider default 8–128); registers without email verification or mail.
- `POST /api/auth/sign-in/email`: `{ email, password }`; sets HttpOnly session cookie.
- `POST /api/auth/sign-out`: revokes current session.
- `GET /api/auth/get-session`: provider-owned session response.
- `GET /api/v1/me`: own `{ id, email, name, profile }`. Email is not in public profiles.

Configure `BETTER_AUTH_SECRET` (32+ characters), `BETTER_AUTH_URL`, comma-separated
`TRUSTED_ORIGINS`. Origin/CSRF checks explicitly remain enabled in tests and runtime.
Local HTTP cookies are HttpOnly/SameSite=Lax without Secure; HTTPS enables Secure.
Cookie cache is disabled. Database session expiration and revocation are authoritative.
CORS credentials are enabled only for configured trusted origins. Product mutations
reject an untrusted Origin or cross-site Fetch Metadata; JSON requests without browser
metadata support nonbrowser clients. Never trust a caller-supplied actor ID.

No OAuth, SMTP, email verification, password reset, account deletion or image upload.
Recovery/verification/profile-account mutation endpoints are explicitly disabled;
provider-required optional auth schema fields do not enable these product features.

## Profiles

- `GET /api/v1/me/profile`: own professional profile (empty default initialized lazily).
- `PATCH /api/v1/me/profile`: partial professional update, empty object allowed.
- `GET /api/v1/profiles/:userId`: known-ID professional profile, independent of discovery opt-in.
- `GET /api/v1/dictionaries`: stable ID/label arrays `specializations`, `skills`, `experienceLevels`, `goals`.

Profile fields: `userId`, `displayName`, `bio`, nullable `specializationId`/`experienceId`,
`skillIds`, `goalIds`, `portfolioLinks`, `discoverable`, `complete`, `missingFields`,
`createdAt`, `updatedAt`. All timestamps are ISO strings. No email/password/token or
private account relations are projected. PATCH accepts only editable fields, not userId,
completeness or timestamps; unsupported properties return 422 rather than being stripped.

Engineering limits: name80, bio2000, IDs80, skills20 unique, goals5 unique,
portfolio links5 of at most2048 characters each, absolute HTTP(S). Dictionary IDs
must exist; invalid values cause no partial update. Null clears specialization/experience;
empty arrays clear skills/goals/links. Completeness needs nonblank name, specialization,
at least one skill and goal. Discoverable defaults false and persists independently of
completeness. Discovery decisions, project creation and applications enforce completeness;
discovery also requires actor opt-in.

## Product errors and pagination conventions

Product errors: `{ error: { code, message } }`; 401 no session, 403 forbidden visible
management/origin, 404 unavailable/hidden resource, 409 state conflict, 422 invalid input,
500 safe internal failure. No SQL or stack trace is returned. Native auth errors are not
wrapped. Profile codes include PROFILE_NOT_FOUND, INVALID_DICTIONARY_VALUE,
PROFILE_INCOMPLETE, DISCOVERY_DISABLED. Request schemas are the contract authority.

All collection endpoints use `{ items, nextCursor }`, default20/max50, cursor max512
characters, canonical base64url encoding of ISO creation timestamp and stable ID;
malformed cursors and out-of-range limits return422. Order is newest-first by
`createdAt DESC, id DESC` (profile/roster use userId). The cursor resumes strictly
below both values; IDs break timestamp ties. Every page reapplies access/filter rules.

## Client

`@aster/api-client` exports `createApiClient(baseUrl, { fetch: { credentials: "include" } })`.
See `fixtures/api-consumer/index.ts` for type-checked health/profile/error usage and
negative assertions. No frontend or browser tests are required.

## Discovery and matches

- `GET /api/v1/discovery`: query `specializationId`, `experienceId`, repeated `skillIds`,
  repeated `goalIds`, `limit`, `cursor`. AND across categories, ALL skills, ANY goals.
  Excludes self, hidden/incomplete, decided and already matched profiles. No deck reset.
- `PUT /api/v1/discovery/decisions/:targetUserId`: `{value:"interested"|"skipped"}` →
  `{value,match:null|{id,participantIds,conversationId,createdAt}}`. Explicit pre-match
  revisions allowed for still-eligible targets; decisions have no expiry. One-sided
  interest is private, no incoming-interest endpoint. Pair locking makes reciprocal
  requests atomic; canonical match order is independent of database locale.
- `GET /api/v1/matches` and `GET /api/v1/matches/:matchId`: participants only (404 otherwise).
  Matches survive later opt-out/incompleteness; interested retry returns the match,
  skipped after matching is409. No unmatch endpoint or arbitrary direct-chat creation.

## Projects and teams

- `GET /api/v1/projects`, `POST /api/v1/projects`.
- `GET/PATCH /api/v1/projects/:projectId`: authenticated detail; owner-only PATCH.
- `GET /api/v1/me/projects`: owned/joined catalogue.
- `GET /api/v1/projects/:projectId/members`: authenticated roster with public profile and
  computed role `owner|member` (project ownerId is the sole ownership authority).
- `POST /api/v1/projects/:projectId/applications`: `{text}`; complete-profile nonmember,
  open recruitment, no match requirement. One pending per user/project, no global quota.
- `GET /api/v1/projects/:projectId/applications`: current owner only.
- `GET /api/v1/me/applications`: applicant's private history across projects.
- `POST /api/v1/applications/:applicationId/accept|reject`: current owner only.
- `POST /api/v1/applications/:applicationId/withdraw`: applicant only.
- `DELETE /api/v1/projects/:projectId/members/me`: leave, except current owner.
- `DELETE /api/v1/projects/:projectId/members/:userId`: owner removes non-owner.
- `POST /api/v1/projects/:projectId/transfer-ownership`: `{userId}`, current owner transfers
  to existing member. Transfer before owner leaves. DELETE returns `{removed:true}`.

Creation fields: `title`1..120, `description`1..5000, `goalId`, `requiredRoles`1..10
nonblank strings of1..80, `requiredSkillIds`0..20 unique dictionary IDs. PATCH is partial
and additionally accepts `recruitmentOpen`. Creation always opens recruitment and
atomically establishes project, sole owner membership and project conversation.
Public project fields add id,ownerId,recruitmentOpen,ISO createdAt/updatedAt.
No position records or seat quotas. Applications use nonblank text1..2000, public-to-
owner/applicant `{id,projectId,userId,text,state,createdAt,updatedAt}`. States pending,
accepted,rejected,withdrawn. Matching outcomes retry idempotently after current
permission checks; conflicting terminal outcomes409. Rejected/withdrawn/former members
may create a new application; histories remain. Retrying an old acceptance never
re-adds a departed member. Closing blocks new submissions/acceptance, preserving pending
applications/team/chat. Reopening resumes the same project/conversation.

## Conversations and messages

- `GET /api/v1/conversations`: current-member list `{id,matchId,projectId,createdAt}`.
- `GET /api/v1/conversations/:conversationId/messages`: current-member history.
- `POST /api/v1/conversations/:conversationId/messages`: `{requestId,text}` → persisted
  `{id,conversationId,senderId,requestId,text,createdAt}`.

Text is preserved exactly,1..4000 characters and nonblank after trimming. Request ID
is1..128 characters, unique per sender+conversation. Exact retries return the original;
different text (including whitespace differences) returns409. New/returning project
members see all earlier history. Removal/leave revokes reads/writes/events; returning
requires a new accepted application. Project locks serialize revocation with history,
message persistence and final event authorization. No attachments/edit/delete/presence.

## SSE and reconnect recovery

`GET /api/v1/events` is a cookie-authenticated SSE response. One stream per user; opening
another closes the old one. Event name `message.created`, SSE id is messageId, JSON data:

```json
{
  "type": "message.created",
  "conversationId": "conversation-id",
  "messageId": "message-id"
}
```

IDs1..128, no extra fields. The single schema authority is `@aster/contracts/events`,
reexported from `@aster/api-client/events` as conversationEventSchema, ConversationEvent,
and isConversationEvent. No API/Prisma runtime is required in the browser.

Only committed writes publish. Before enqueue, delivery checks current database session
and current membership under the project/conversation lock; connection-time access
alone is insufficient. A15-second heartbeat rechecks session, but each event independently
checks it immediately. Queue is bounded to32 frames; slow clients disconnect. Abort,
cancel, replacement and shutdown clean up. Failed live delivery does not undo a committed
message. Previously downloaded data cannot be recalled after revocation.

Single instance, no durable replay/outbox and no exactly-once guarantee. After reconnect,
fetch current authorized HTTP history pages; merge messages by persisted message ID and
ignore duplicate event IDs. SSE is a notification, not the authoritative message body.
For browser EventSource use `{withCredentials:true}` when cross-origin and configure the
exact trusted origin. Validate parsed event data with isConversationEvent. No Redis,
Socket.IO, typing/read receipts, or mandatory browser/E2E suite.
