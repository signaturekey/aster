# Aster Backend

Бэкенд платформы для поиска напарников и формирования команд для IT-проектов.
Реализация MVP выполняется по `openspec/changes/define-it-matchmaking-mvp/`.
Сейчас доступны `GET /health`, Better Auth email/password, current-user/profile endpoints
и словари PostgreSQL/Prisma. Контракты и лимиты — [API.md](API.md). Health не требует БД.
Frontend, мобильное приложение и deployment не входят в этот change.

## Стек и установка

Bun **1.4.4**, Elysia **1.4.30**, Eden **1.4.10**, strict TypeScript и Biome.
Версия Bun закреплена в `.bun-version` и `packageManager`. Пакеты устанавливаются
из публичного npm registry (проектный `bunfig.toml`).

```sh
bun install --frozen-lockfile
bun run db:generate
bun run dev
```

API доступен на `http://localhost:3000`. Другой порт:

```sh
PORT=4000 bun run dev
```

## Структура

```text
apps/api/
  src/app.ts                  # Elysia app и inferred App, без listener
  src/contract.ts             # Только экспорт типа App
  src/index.ts                # Запуск и остановка сервера
  tests/unit/health.test.ts   # In-process HTTP и Eden
packages/api-client/
  src/index.ts                # Browser-safe Eden client
  tests/client.test.ts        # Передача fetch/credentials
fixtures/api-consumer/        # Отдельный TypeScript-потребитель, не frontend
scripts/build-client.ts      # Browser build с проверкой входных модулей
openspec/                    # План и реализованные спецификации
```

Все пакеты используют общий strict baseline и собственные TypeScript configs.
В контракте нет неоднозначного backend-алиаса `@/`.

## API и общий клиент

`GET /health` возвращает `200`, JSON `{ "status": "ok" }`, без проверки внешних
сервисов. Импорт приложения не открывает порт.

```ts
import { createApiClient } from "@aster/api-client";

const api = createApiClient("http://localhost:3000", {
  fetch: { credentials: "include" },
});
const { data, error } = await api.health.get();
if (error) throw error;
console.log(data.status); // "ok"
```

`@aster/api/contract` имеет только `types` export. API — devDependency клиента,
а не runtime dependency. Browser build проверяет, что в bundle есть Eden HTTP,
но нет Elysia server, API или Prisma runtime. Отдельный consumer fixture проверяет
inferred request/response/error types, отсутствие `any` и негативные assertions.
Cookie-сессии и trusted-origin credentialed CORS реализованы. Для host dev нужны
`DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ символа), `BETTER_AUTH_URL` и `TRUSTED_ORIGINS`;
безопасные local-only примеры в `.env.example`.

## Команды

| Команда                          | Назначение                                                 |
| -------------------------------- | ---------------------------------------------------------- |
| `bun run dev`                    | API с watch                                                |
| `bun run start`                  | Собранный API                                              |
| `bun run check`                  | Biome                                                      |
| `bun run check:fix`              | Форматирование и автоисправления                           |
| `bun run typecheck`              | Root scripts, API, client, client tests и consumer fixture |
| `bun test` / `bun run test:unit` | Unit/in-process тесты без listener и БД                    |
| `bun run test:watch`             | Watch тестов                                               |
| `bun run build`                  | API и проверяемая browser-сборка клиента                   |
| `bun run build:api`              | Bun bundle в `apps/api/dist/`                              |
| `bun run build:client`           | Browser bundle в `packages/api-client/dist/`               |

`bun build` не заменяет проверку TypeScript. Перед коммитом:

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run test:unit
bun run build
```

## CI и ограничения текущего этапа

GitHub Actions выполняет эти же проверки на push в `main` и pull requests,
с минимальными read permissions, ограничением времени и закреплёнными версиями.
Добавлены Prisma generation, migrations/seed, PostgreSQL integration tests,
Compose validation и Docker image build. CI использует разные `aster_ci_work`
и `aster_test`. Smoke/E2E/browser suites, публикация образов и deployment не предусмотрены.
Локальные проверки не заменяют green Actions для точного последнего pushed SHA.

## PostgreSQL, миграции и словари

Prisma/client/adapter **7.10.1**, `pg` **8.23.1**, PostgreSQL **18.3**.
Generated client не коммитится; после frozen install запустите `bun run db:generate`.
`bun run db:migrate` применяет только committed migrations (без reset/db push),
`bun run db:seed` идемпотентно обновляет стабильные ID и labels. Обе команды требуют
явный `DATABASE_URL`; CLI config имеет только нерабочий fallback для генерации.

Engineering-default seed IDs (`apps/api/prisma/dictionaries.ts`):
- Specializations: backend, frontend, fullstack, mobile, devops, data, design, qa, product.
- Skills: typescript, javascript, python, go, rust, java, sql, react, docker, figma.
- Experience: beginner, junior, middle, senior, lead.
- Goals: startup, hackathon, side-project, learning, pair-programming.

Словари доступны через защищённый `GET /api/v1/dictionaries`.

## Контейнеры и integration tests

Полные инструкции — [CONTAINERS.md](CONTAINERS.md). Конфигурация обычного запуска:

```sh
docker compose up --build
```

Контейнеры не требуют host Bun. Рабочая БД сохраняет volume при stop/start.
Тестовый PostgreSQL изолирован и disposable:

```sh
docker compose --profile test up -d --wait test-db
DATABASE_URL=postgresql://aster:aster_local_password@127.0.0.1:55432/aster \
TEST_DATABASE_URL=postgresql://aster_test:aster_test_local_password@127.0.0.1:55433/aster_test \
bun run test:integration
# Или полностью внутри контейнеров:
docker compose --profile test run --build --rm integration
```

Integration runner требует явный `TEST_DATABASE_URL`, допускает только `aster_test`
и отказывает при совпадении с рабочей БД даже через другой hostname/credentials.
Он применяет миграции и seed до in-process тестов; не сбрасывает БД. `bun test`
без выбора suite захватывает integration-файлы и намеренно откажет без runner:
используйте `bun run test:unit` или `bun run test:integration`.

Текущее ограничение окружения: полный local Docker build блокируется сетевой
ошибкой загрузки Prisma schema-engine с `binaries.prisma.sh`. Проверены Compose config,
dependency stages и PostgreSQL stop/start persistence, но migration/API containers
ещё не запускались. Image build и полноценный container startup не объявлены успешными.
