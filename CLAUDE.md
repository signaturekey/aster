# Aster Backend

A platform for finding collaborators and forming teams for IT projects. Currently, only `GET /health` is implemented.

## Stack and structure

- Bun, Elysia, Eden, strict TypeScript, ESM.
- Biome for linting and formatting; `bun test` for tests.
- `src/app.ts` exports the application and its `App` type without starting the server.
- Chain route definitions to preserve Eden's route type inference.
- `src/index.ts` starts the HTTP server. `PORT` defaults to 3000.
- `src/client.ts` exports an Eden client factory and imports `App` as a type only.
- `tests/` contains tests using `app.handle()` and Eden without opening a port.
- PostgreSQL and Prisma are planned for persistence but are not configured yet.

## Development guidelines

- Stay within the requested scope; do not add infrastructure ahead of need.
- Use the `@/` alias for imports from `src/`, without file extensions (for example, `@/app`). It is defined in `tsconfig.json`; Bun resolves it during execution and builds.
- Use Bun for dependency installation, scripts, tests, builds, and production execution.
- Keep one `tsconfig.json` for type checking. `bun build` generates the production bundle but does not check types.
- Cover behavior changes with tests.
- Do not add ESLint or Prettier; use Biome.
- Do not commit secrets or local `.env` files.

## Validation

Run these commands before completing a task:

```sh
bun run check
bun run typecheck
bun test
bun run build
```

Report which checks were run and disclose any failures.
