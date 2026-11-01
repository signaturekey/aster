# Aster web

Russian-language React SPA in the root Bun workspace. Install from the repository root with `bun install --frozen-lockfile`; this package has no separate lockfile.

```sh
bun run --filter @aster/web dev
bun run --filter @aster/web typecheck
bun run --filter @aster/web build
```

The development server listens on loopback port 5175 and proxies `/api` and `/health` to port 3000. For real authentication, run the API with `BETTER_AUTH_URL=http://localhost:5175` and `TRUSTED_ORIGINS=http://localhost:5175`, then open that exact localhost origin. Do not disable origin/CSRF checks. The original isolated preview must not occupy the same port.

## Boundaries

- `app`: router, providers, global styles and authenticated lifecycle.
- `pages`: route composition and page-local UI.
- `features`: user actions and forms.
- `entities`: domain queries/adapters and reusable domain UI.
- `shared`: UI primitives, Eden setup and genuinely shared utilities.

Use downward dependencies, not feature-to-feature internal imports. Do not create empty layers or generic infrastructure. TanStack Query owns server state, React Hook Form owns forms, the URL owns filters, and React state owns transient UI. No Axios, Zod or speculative Zustand.

`@aster/api-client` supplies Eden's inferred product contract. `@aster/contracts/events` is browser-safe runtime event validation. Do not import server schemas/runtime into browser code; `@api/*` is mapped only to follow the type graph. TypeScript checks are separate from Vite builds.

Root `DESIGN.md` and `prototypes/interface` are local ignored visual references, not build dependencies. Application source and packaged fonts remain self-contained. This workspace is under implementation; no complete product/runtime acceptance is claimed by scaffold builds.
