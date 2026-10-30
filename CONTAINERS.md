# Local containers

This is a local-only backend stack: Bun 1.4.4 and PostgreSQL 18.3. Docker Engine
(or Docker Desktop) with Docker Compose is required. Host Bun, Node.js and
PostgreSQL are **not** required for normal container startup.

## Start and stop

From the repository root:

```sh
# Optional: defaults already work without a .env file.
cp .env.example .env

docker compose up --build
```

Compose waits for a healthy `db`, runs committed migrations with `db:migrate`
and idempotent dictionary seeding with `db:seed`, then starts the API. A failed
migration or seed blocks API startup rather than hiding the error. The image
build generates Prisma's client explicitly; generated code need not be committed.
The migration image retains the Prisma CLI/config/schema/migrations and seed
source; the API runtime starts the bundled `apps/api/dist/index.js` as the
unprivileged `bun` user. Prisma commands run through Bun rather than requiring
host Node.js.

Default host endpoints are `http://localhost:3000` for the API and
`127.0.0.1:55432` for the working database. Only loopback host ports are exposed;
this is not a public deployment configuration. `GET /health` is public liveness,
not an assertion that all product modules are implemented or a database probe.

For detached operation and useful diagnostics:

```sh
docker compose up --build -d
docker compose ps -a
docker compose logs --tail=100 migrate api
```

Do not share logs or rendered Compose configuration containing local credentials.

Stop the foreground stack with Ctrl-C, or use:

```sh
docker compose stop
# Resume using up so migration/seed dependencies are respected.
docker compose up -d
# Remove this project's containers/network; keep its working data volume.
docker compose down
```

The API receives SIGTERM through Compose's init process and has 30 seconds to
finish graceful shutdown. The entrypoint handles SIGINT/SIGTERM with Elysia's
stop operation. PostgreSQL also has a 30-second stop grace period. Interruptions
in active requests may still require client retries; shutdown is not a guarantee
of unlimited draining.

The `aster_postgres-data` named volume persists normal stop/start and `down`.
Do not run `down --volumes`, `prisma migrate reset`, or `db push` against the
working database. There is no automatic destructive reset. PostgreSQL 18's
volume is mounted at `/var/lib/postgresql` (versioned data directories below it),
not the older `/var/lib/postgresql/data` mount convention.

## Environment and networking

`.env.example` contains safe local examples only. Copying it is optional because
Compose has local defaults. `API_PORT`, `DB_PORT` and `TEST_DB_PORT` change the
published host ports (defaults 3000, 55432 and 55433). The API always listens on
port 3000 inside Compose. `PORT` instead controls optional **host** Bun startup.

Compose deliberately constructs its service `DATABASE_URL` with `db:5432` and
`TEST_DATABASE_URL` with `test-db:5432`. A host `.env` URL using `127.0.0.1:55432`
is not forwarded into the API container: loopback inside a container is not the
database service. Host tools use the sample URLs in `.env.example`.

`POSTGRES_USER` and `POSTGRES_PASSWORD` configure the local working database.
Use URL-safe password characters when changing them, or percent-encode URL
components consistently. PostgreSQL initialization variables only apply to an
empty volume; changing `.env` does not change credentials in existing data.
Do not delete a working volume to fix a credential mismatch. Restore the correct
local credentials or perform an intentional database administration change.

The integration service has its own fixed, local-only test credentials, separate
host port and disposable tmpfs storage. Nothing should point at an unrelated
machine database. `.env`, local generated files, node_modules, build output,
Git history and local docs are excluded from the Docker context; secrets are not
build arguments or image environment values.

## Apply new committed migrations

Regular `docker compose up --build` applies pending committed migrations and
seeds before starting the API. To run that one-shot step explicitly:

```sh
docker compose run --build --rm migrate
```

Do not use this command to generate migrations in the running working stack.
Review and commit migration SQL through the development workflow first.

## Isolated PostgreSQL integration tests

No browser, external listening API or smoke/E2E suite is used. Tests invoke the
app in-process and use real PostgreSQL. Run with only Docker installed:

```sh
docker compose --profile test run --build --rm integration
```

This starts `test-db`, not the working database/API. `test-db` uses a separate
`aster_test` database and user on disposable tmpfs; it never mounts
`postgres-data`. The integration runner requires an explicit `TEST_DATABASE_URL`,
checks that its database name is `aster_test`, rejects the working database, and
runs migrations and idempotent seeds before the tests. Test data is disposable.

Release the disposable test database without removing the working stack:

```sh
docker compose --profile test stop test-db
docker compose --profile test rm -f test-db
```

For optional host Bun development:

```sh
docker compose --profile test up -d test-db
# Supply both URLs explicitly; do not rely on an implicit test database fallback.
DATABASE_URL=postgresql://aster:aster_local_password@127.0.0.1:55432/aster \
TEST_DATABASE_URL=postgresql://aster_test:aster_test_local_password@127.0.0.1:55433/aster_test \
bun run test:integration
```

The working database need not be running for integration tests. Do not set
`DATABASE_URL` to the test URL to bypass safety validation.

## Verification commands and limits

```sh
docker compose --profile test config --quiet
docker build --target runtime --tag aster-api:local .
```

Configuration validation and image build alone do **not** demonstrate that the
stack started. If startup is exercised, record it separately (including migration
exit status, API lifecycle and persistence observations). CI performs frozen
install, Prisma generation, Biome, workspace/consumer type checks, unit tests,
committed migrations and seeds on a clean CI work database, PostgreSQL integration
tests on a distinct `aster_test` database, API/browser-safe client builds, Compose
configuration validation and an image build. It does not publish an image or
deploy. Hosted verification is complete only when the actual Actions run for the
latest pushed commit is green.
