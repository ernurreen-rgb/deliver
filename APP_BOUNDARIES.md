# App Boundaries

Цель этого документа - подготовить Deliver к будущему разделению на несколько приложений, не делая само разделение сейчас.

Сейчас проект остается одним Next.js App Router приложением и одной кодовой базой. Границы нужны, чтобы новые фичи не смешивали роли и не усложняли будущий перенос в `apps/customer`, `apps/restaurant`, `apps/courier`, `apps/operator`, `apps/admin`, `apps/api` и `apps/worker`.

## Текущие границы

| Surface | Текущая папка | Будущий пакет | Доступ |
| --- | --- | --- | --- |
| Customer web | `src/app/(customer)` | `apps/customer` | public + customer session |
| Restaurant cabinet | `src/app/restaurant` | `apps/restaurant` | `restaurant_staff`, `admin` with explicit `restaurant_staff` row |
| Courier cabinet | `src/app/courier` | `apps/courier` | `courier`, `admin` |
| Operator back-office | `src/app/operator` | `apps/operator` | `operator`, `admin` |
| Admin back-office | `src/app/admin` | `apps/admin` | `admin` |
| Backend API | `src/app/api` | `apps/api` | public/service endpoints with handler-level auth |
| Worker | `src/workers` | `apps/worker` | background runtime |

Авторитетная карта этих границ находится в `src/platform/app-boundaries.ts`.
Навигация и shell-конфигурация находятся в `src/platform/navigation.ts`.

## Правила для новых изменений

1. Route files в `src/app/*` должны быть тонким слоем композиции: получить доступ, вызвать доменный query/action, отрендерить UI.
2. Route files не импортируют другие route files из `src/app`.
3. Каждый user-facing surface имеет свой `layout.tsx`, который рендерит `RoleShell` со своим `surface`.
4. Каждый surface импортирует только свои разрешенные domain-модули. Например, `src/app/courier` не должен напрямую импортировать `menu`, а `src/app/restaurant` не должен напрямую импортировать `couriers`.
5. `src/domains/*` не импортирует `src/app/*`, `src/components/*` или `src/workers/*`.
6. Shared UI в `src/components/*` не импортирует route files и worker code.
7. Worker code не импортирует App Router и UI.
8. База данных остается общей. Доступ к Prisma идет через `src/lib/db/prisma`.
9. Server Actions пока могут жить в domain-модулях и делать `redirect(...)`. Перед физическим split эти actions нужно будет обернуть в per-app adapters, чтобы доменные операции не знали URL конкретного приложения.

## Проверка

Запуск:

```powershell
npm run architecture:check
```

Команда проверяет импорты и падает, если новый код нарушает текущие app boundaries. Она также включена в `npm run release:gate`.

## Как развивать дальше

- Если страница становится большой, сначала выделяем surface-level feature module рядом с route, но не переносим весь проект в monorepo.
- Если одна операция нужна нескольким surfaces, выносим ее в domain/service функцию без UI и без route-specific redirect.
- Если нужно новое приложение, сначала добавляем его в `src/platform/app-boundaries.ts`, затем обновляем `scripts/check-app-boundaries.ts`, и только после этого создаем отдельный пакет.
