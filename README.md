# Aster

Платформа для поиска напарников и команд для стартапов, хакатонов и пет-проектов: русский SPA и типизированный API в Bun-монорепозитории.

## Возможности

- Регистрация и вход по email и паролю.
- Профессиональные профили с навыками и целями сотрудничества.
- Поиск напарников и взаимные совпадения.
- Проекты, заявки на участие и управление командой.
- Личные и командные текстовые чаты с обновлениями в реальном времени.

Проект предназначен для локальной разработки и пока не готов к публичному запуску.

## Стек

Bun · TypeScript · React · Vite · Tailwind CSS/shadcn · React Hook Form · TanStack Query · Elysia/Eden · PostgreSQL/Kysely · Better Auth · Caddy

## Запуск через Docker

Нужны Docker и Docker Compose.

```sh
cp -n .env.example .env
docker compose up --build
```

Приложение: **http://localhost:8080**. Caddy отдаёт SPA и проксирует `/api/*` и `/health` в API; миграции и справочники запускаются до API. Bun на хосте не нужен. PostgreSQL сохраняется в named volume; обычный старт не добавляет демоданные.

Настройки — в `.env.example`. При смене `WEB_PORT` обновите `BETTER_AUTH_URL` и `TRUSTED_ORIGINS` под тот же внешний адрес. Существующий `.env` не перезаписывается: проверьте старые значения `localhost:3000` вручную. API отдельно доступен на loopback-порту 3000, но браузер использует единый адрес приложения.

Необязательное тестовое наполнение реальной БД — только явной командой:

```sh
docker compose run --rm --no-deps migrate bun run db:seed:dev --acknowledge-local-aster=db:5432/aster
```

Локальные аккаунты, пароли и политика безопасного повторного запуска описаны в [development seed](apps/api/dev-seed.md). Не публикуйте стенд с известными тестовыми паролями. Сидер не сбрасывает БД и не восстанавливает изменённые/удалённые данные.

Остановка без удаления данных:

```sh
docker compose stop
```

## Разработка

Для запуска API вне контейнера нужен Bun 1.4.4.

```sh
cp -n .env.example .env
bun install --frozen-lockfile
docker compose up -d --wait db
bun run db:migrate
bun run db:seed
BETTER_AUTH_URL=http://localhost:5175 TRUSTED_ORIGINS=http://localhost:5175 bun run dev
# В другом терминале:
bun run dev:web
```

Откройте **http://localhost:5175**, не `127.0.0.1`: origin и cookies должны совпадать. Vite проксирует API на порт 3000; для другого порта задайте `API_PROXY_TARGET=http://127.0.0.1:<порт>` при запуске `dev:web`. Подробности и архитектура — [apps/web](apps/web/README.md). Локальные прототипы и `DESIGN.md` не нужны для сборки.

Основные команды:

```sh
bun run check          # ESLint + Prettier: линтинг и проверка форматирования
bun run check:fix      # Автоисправления ESLint и форматирование Prettier
bun run typecheck      # Проверка типов
bun run test:unit      # Unit-тесты
bun run build          # Сборка API, browser-safe клиента и SPA
```

Integration-тесты с отдельной тестовой БД:

```sh
docker compose --profile test run --build --rm integration
```
