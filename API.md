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
completeness. Discovery/project operations will enforce completeness as introduced.

## Product errors and pagination conventions

Product errors: `{ error: { code, message } }`; 401 no session, 403 forbidden visible
management/origin, 404 unavailable/hidden resource, 409 state conflict, 422 invalid input,
500 safe internal failure. No SQL or stack trace is returned. Native auth errors are not
wrapped. Profile codes include PROFILE_NOT_FOUND, INVALID_DICTIONARY_VALUE,
PROFILE_INCOMPLETE, DISCOVERY_DISABLED. Request schemas are the contract authority.

Collections added in later slices use default20/max50, cursor max512 characters,
canonical base64url encoding of ISO creation timestamp and stable ID; malformed cursors
are rejected. No collection endpoint is implemented yet.

## Client

`@aster/api-client` exports `createApiClient(baseUrl, { fetch: { credentials: "include" } })`.
See `fixtures/api-consumer/index.ts` for type-checked health/profile/error usage and
negative assertions. No frontend or browser tests are required.
