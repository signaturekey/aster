# Aster

Бэкенд платформы для поиска напарников и команд для стартапов, хакатонов и пет-проектов.

## Возможности

- Регистрация и вход по email и паролю.
- Профессиональные профили с навыками и целями сотрудничества.
- Поиск напарников и взаимные совпадения.
- Проекты, заявки на участие и управление командой.
- Личные и командные текстовые чаты с обновлениями в реальном времени.

Проект предназначен для локальной разработки и пока не готов к публичному запуску.

## Стек

Bun · TypeScript · Elysia · Eden · PostgreSQL · Prisma · Better Auth

## Запуск через Docker

Нужны Docker и Docker Compose.

```sh
cp -n .env.example .env
docker compose up --build
```

API: `http://localhost:3000`. Проверка доступности: `GET /health`.
Настройки портов и окружения — в `.env.example`.

Остановка без удаления данных:

```sh
docker compose stop
```

> В текущем локальном окружении сборка блокируется сетевой ошибкой загрузки
> Prisma engine. Полный запуск стека пока не подтверждён; сборка образа в CI проходит.

## Разработка

Для запуска API вне контейнера нужен Bun 1.4.4.

```sh
cp -n .env.example .env
bun install --frozen-lockfile
bun run db:generate
docker compose up -d --wait db
bun run db:migrate
bun run db:seed
bun run dev
```

Основные команды:

```sh
bun run check          # ESLint + Prettier: линтинг и проверка форматирования
bun run check:fix      # Автоисправления ESLint и форматирование Prettier
bun run typecheck      # Проверка типов
bun run test:unit      # Unit-тесты
bun run build          # Сборка API и клиента
```

Integration-тесты с отдельной тестовой БД:

```sh
docker compose --profile test run --build --rm integration
```
