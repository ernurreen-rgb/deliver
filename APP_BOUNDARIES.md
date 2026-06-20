# App Boundaries

Цель этого документа - подготовить Deliver к будущему разделению на несколько приложений, не делая само разделение сейчас.

Сейчас проект остается одним Next.js App Router приложением и одной кодовой базой. Границы нужны, чтобы новые фичи не смешивали роли и не усложняли будущий перенос в `apps/customer`, `apps/restaurant`, `apps/courier`, `apps/operator`, `apps/admin`, `apps/api` и `apps/worker`.

## Текущие границы

| Surface | Текущая папка | Будущий пакет | Доступ |
| --- | --- | --- | --- |
| Customer web | `apps/web/src/app/(customer)` | `apps/customer` | public + customer session |
| Restaurant cabinet | `apps/web/src/app/restaurant` | `apps/restaurant` | `restaurant_staff`, `admin` with explicit `restaurant_staff` row |
| Courier cabinet | `apps/web/src/app/courier` | `apps/courier` | `courier`, `admin` |
| Operator back-office | `apps/web/src/app/operator` | `apps/operator` | `operator`, `admin` |
| Admin back-office | `apps/web/src/app/admin` | `apps/admin` | `admin` |
| Backend API | `apps/web/src/app/api` | `apps/api` | public/service endpoints with handler-level auth |
| Worker | `apps/web/src/workers` | `apps/worker` | background runtime |

Авторитетная карта этих границ находится в `apps/web/src/platform/app-boundaries.ts`.
Навигация и shell-конфигурация находятся в `apps/web/src/platform/navigation.ts`.

## Правила для новых изменений

1. Route files в `apps/web/src/app/*` должны быть тонким слоем композиции: получить доступ, вызвать доменный query/action, отрендерить UI.
2. Route files не импортируют другие route files из `apps/web/src/app`.
3. Каждый user-facing surface имеет свой `layout.tsx`, который рендерит `RoleShell` со своим `surface`.
4. Каждый surface импортирует только свои разрешенные domain-модули. Например, `apps/web/src/app/courier` не должен напрямую импортировать `menu`, а `apps/web/src/app/restaurant` не должен напрямую импортировать `couriers`.
5. `apps/web/src/domains/*` не импортирует `apps/web/src/app/*`, `apps/web/src/components/*` или `apps/web/src/workers/*`.
6. Shared UI в `apps/web/src/components/*` не импортирует route files и worker code.
7. Worker code не импортирует App Router и UI.
8. База данных остается общей. Новый общий доступ к Prisma идет через `@deliver/database`; `apps/web/src/lib/db/prisma` остается только compatibility wrapper для существующего web-кода.
9. Server Actions пока могут жить в domain-модулях и делать `redirect(...)`. Перед физическим split эти actions нужно будет обернуть в per-app adapters, чтобы доменные операции не знали URL конкретного приложения.

## Shared packages

Текущие workspace-пакеты:

| Package | Назначение | Ограничения |
| --- | --- | --- |
| `@deliver/contracts` | Общие DTO и типы для API/domain boundary. | Не зависит от app-кода, Next.js, React или базы. |
| `@deliver/domain` | Чистая доменная логика без framework/runtime привязки. | Может зависеть только от `@deliver/contracts`. |
| `@deliver/database` | Runtime database config, lazy Prisma client и generated Prisma exports. | Не импортирует app-код. Generated client находится в `packages/database/src/generated/prisma`. |
| `@deliver/auth` | Auth/session helpers и role-access helpers. | Может зависеть от `@deliver/contracts` и `@deliver/database`, но не от route/UI кода. |

## Проверка

Запуск:

```powershell
npm run architecture:check
```

Команда проверяет импорты в `apps/web/src` и `packages/*/src` и падает, если новый код нарушает текущие app/package boundaries. Она также включена в `npm run release:gate`.

## Как развивать дальше

- Если страница становится большой, сначала выделяем surface-level feature module рядом с route, но не переносим весь проект в monorepo.
- Если одна операция нужна нескольким surfaces, выносим ее в domain/service функцию без UI и без route-specific redirect.
- Если нужно новое приложение, сначала добавляем его в `apps/web/src/platform/app-boundaries.ts`, затем обновляем `scripts/check-app-boundaries.ts`, и только после этого создаем отдельный workspace.
