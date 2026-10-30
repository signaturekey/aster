# Health

## Purpose

Describe the existing liveness endpoint independently of future product features.

## Requirements

### Requirement: HTTP liveness

The API SHALL expose an unauthenticated `GET /health` endpoint returning HTTP 200 and the JSON object `{ "status": "ok" }` without requiring a database or another external service.

#### Scenario: Application is responding

- **WHEN** a client requests `GET /health`
- **THEN** the API returns HTTP 200 with a JSON content type and `{ "status": "ok" }`

#### Scenario: Typed client access

- **WHEN** an Eden Treaty client calls `health.get()` against the application
- **THEN** the successful response data has the TypeScript type `{ status: "ok" }`
