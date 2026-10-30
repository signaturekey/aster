# Aster Backend

Бэкенд платформы для поиска напарников и формирования команд для IT-проектов.

## Стек

- Bun 1.4.4 — runtime, зависимости, сборка и тесты
- Elysia — HTTP API
- Eden Treaty — типизированный клиент API
- TypeScript (strict) — проверка типов
- Biome — линтинг и форматирование

Prisma и PostgreSQL будут подключены при добавлении моделей данных. Текущий каркас не требует базы данных.

## Запуск

Установи [Bun](https://bun.sh/docs/installation), версия проекта указана в `.bun-version`.

```sh
bun install --frozen-lockfile
bun run dev
```

Сервер доступен на `http://localhost:3000`. Порт можно изменить через переменную окружения `PORT`:

```sh
PORT=4000 bun run dev
```

## API

### `GET /health`

Проверка работоспособности HTTP-приложения, без проверки внешних сервисов.

```sh
curl http://localhost:3000/health
```

Ответ: `200 OK`, `Content-Type: application/json`.

```json
{ "status": "ok" }
```

## Eden

`src/client.ts` экспортирует фабрику клиента. Тип `App` импортируется через `import type`, поэтому серверный код не попадает в клиентскую сборку.

```ts
import { createClient } from "@/client";

const api = createClient("http://localhost:3000");
const { data, error } = await api.health.get();

if (error) throw error;
console.log(data.status); // тип: "ok"
```

Для будущего фронтенда на другом origin потребуется настроить CORS или dev-прокси. Сейчас фронтенд и монорепо не добавлены.

## Команды

| Команда              | Назначение                                  |
| -------------------- | ------------------------------------------- |
| `bun run dev`        | Сервер с перезапуском при изменениях        |
| `bun run build`      | Сборка для Bun в `dist/`                    |
| `bun run start`      | Запуск собранного сервера на Bun            |
| `bun run check`      | Проверка Biome                              |
| `bun run check:fix`  | Форматирование и безопасные автоисправления |
| `bun run typecheck`  | Проверка типов                              |
| `bun test`           | Однократный запуск тестов                   |
| `bun run test:watch` | Тесты в режиме наблюдения                   |

Сборка не проверяет типы. Перед деплоем запускай `check`, `typecheck`, тесты и сборку.

## Структура

```text
src/
  app.ts       # Elysia-приложение и тип App, без открытия порта
  client.ts    # Фабрика типизированного Eden-клиента
  index.ts     # Запуск HTTP-сервера
tests/
  health.test.ts
```

Тесты вызывают `app.handle()` и Eden Treaty без запуска HTTP-сервера. Один `tsconfig.json` проверяет исходники и тесты; сборку выполняет Bun. Относительные импорты пишутся без расширений.
