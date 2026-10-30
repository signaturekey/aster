# Aster Backend

Бэкенд платформы для поиска напарников и формирования команд для IT-проектов.
Реализация MVP выполняется по `openspec/changes/define-it-matchmaking-mvp/`.
Сейчас реализован только публичный `GET /health`: база данных и auth пока не нужны.
Frontend, мобильное приложение и deployment не входят в этот change.

## Стек и установка

Bun **1.4.4**, Elysia **1.4.30**, Eden **1.4.10**, strict TypeScript и Biome.
Версия Bun закреплена в `.bun-version` и `packageManager`. Пакеты устанавливаются
из публичного npm registry (проектный `bunfig.toml`).

```sh
bun install --frozen-lockfile
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
Настройка credentials подготовлена для будущих cookie-сессий; auth/CORS ещё не реализованы.

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
Prisma generation, PostgreSQL migrations/integration tests и Docker image build
будут добавлены вместе с реальной инфраструктурой БД/контейнеров. Сейчас workflow
не выдаёт отсутствие этих этапов за успешную проверку. Smoke/E2E/browser suites,
публикация образов и deployment не предусмотрены.

Dockerfile/Compose пока не реализованы; `docker compose up --build` ещё не является
доступным способом запуска. Локальные проверки не доказывают успешный hosted CI:
завершение goal требует green Actions для точного последнего pushed SHA.
