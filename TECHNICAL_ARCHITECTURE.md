# Technical Architecture

## 1. Подход

Проект строим как модульный монолит:

- один основной Next.js-проект;
- разные интерфейсы внутри одного приложения;
- единая база данных PostgreSQL;
- доменная логика отделена от UI;
- фоновые задачи вынесены в отдельный worker-процесс;
- структура должна позволять позже разделить клиентское, ресторанное, курьерское и админское приложения.

Главная цель первой технической версии - не быстрый прототип, а нормальный фундамент для production-сервиса доставки еды.

## 2. Основные интерфейсы

В первой версии все интерфейсы находятся в одном Next.js-приложении:

- `/` - клиентская витрина;
- `/account` - профиль клиента, адреса, история заказов;
- `/restaurant` - кабинет ресторана;
- `/courier` - кабинет курьера;
- `/operator` - панель оператора;
- `/admin` - админка сервиса.

В будущем эти зоны можно вынести в отдельные приложения:

- customer app;
- restaurant app;
- courier app;
- operator back-office;
- admin back-office;
- standalone backend API;
- worker/jobs service.

## 3. Предлагаемая структура проекта

```text
src/
  app/
    (customer)/
      page.tsx
      restaurants/
      account/
    restaurant/
    courier/
    operator/
    admin/
    api/
  components/
    ui/
    layout/
    shared/
  config/
  domains/
    auth/
    users/
    restaurants/
    menu/
    cart/
    orders/
    delivery/
    couriers/
    payments/
    promotions/
    notifications/
    localization/
  lib/
    db/
    auth/
    i18n/
    money/
    validation/
  workers/
  types/
```

## 4. Доменные модули

### `auth`

- OTP login/register flow.
- Dev OTP mode for local development.
- Sessions.
- Role checks.
- Production provider abstraction for future SMS/WhatsApp/Telegram OTP.

### `users`

- User profile.
- Phone number.
- Preferred language.
- Customer addresses.
- Role assignments.

### `restaurants`

- Restaurant profile.
- Status: active, inactive, paused.
- Working hours.
- Delivery radius.
- Commission settings.
- Staff access.

### `menu`

- Menu categories.
- Menu items.
- Item options/modifiers.
- Availability and stop-list.
- Russian and Kazakh translations.

### `cart`

- Client-side cart state.
- Server-side validation before order creation.
- Promo code preview.
- Delivery price preview.

### `orders`

- Order creation.
- Order status lifecycle.
- Order item snapshots.
- Address/contact snapshots.
- Order financial snapshots.

### `delivery`

- Distance-based delivery fee.
- Delivery assignment.
- Manual operator override.
- Delivery status tracking.

### `couriers`

- Courier profile.
- Courier type: `staff` or `partner`.
- Availability.
- Assigned orders.
- Courier internal balance.

### `payments`

- Cash to courier.
- Online card payment abstraction.
- Payment transactions.
- Webhook handling.
- Restaurant/courier settlements.

### `promotions`

- Promo codes.
- Usage limits.
- Restaurant restrictions.
- Discount calculation.
- Redemption history.

### `notifications`

- In-app notifications.
- Future Telegram/SMS/WhatsApp notifications.
- Queue-based sending.

### `localization`

- Interface dictionaries.
- Content translations.
- Fallback to Russian when Kazakh content is missing.

## 5. App Router Strategy

Use Next.js App Router.

Default rule:

- Server Components for read-heavy pages.
- Client Components only for interactive controls.
- Server Actions for internal form mutations.
- Route Handlers for external APIs, webhooks and future mobile clients.

Important:

- Do not rely on route/proxy checks as the only authorization layer.
- Re-check user role in Server Components, Server Actions and Route Handlers.
- Database, Redis and payment clients must be lazy initialized, not created at module scope.

## 6. Route Groups

Recommended route groups:

```text
src/app/
  (customer)/
    page.tsx
    restaurants/
    account/
    checkout/
    orders/
  restaurant/
  courier/
  operator/
  admin/
  api/
```

The customer route group keeps public storefront URLs clean while allowing internal organization.

## 7. Authorization Model

Roles:

- `customer`;
- `restaurant_staff`;
- `operator`;
- `courier`;
- `admin`.

Access rules:

- Customer can access only own profile, addresses and orders.
- Restaurant staff can access only assigned restaurants.
- Courier can access only assigned deliveries.
- Operator can access operational order and delivery views.
- Admin can manage platform configuration.

## 8. Worker Service

The worker should run separately from request/response rendering.

Responsibilities:

- notification delivery;
- payment webhook follow-up tasks;
- balance recalculations;
- settlement jobs;
- stale order checks;
- future courier assignment automation.

For local development it can be a separate npm script inside the same repository. Later it can become a separate service.

## 9. Integration Layer

Restaurant integration modes:

- `dashboard` - first version, restaurant works in our cabinet;
- `iiko` - future POS integration;
- `r_keeper` - future POS integration;
- `custom_api` - future integration for restaurant chains.

All order dispatch to restaurants should go through an integration boundary, even when the first implementation only writes to our own dashboard.

## 10. Payment Boundary

Payment methods:

- `cash_to_courier`;
- `online_card`.

Payment provider must be abstracted:

- create payment;
- check status;
- handle webhook;
- refund;
- reconcile.

Courier internal balance is not a bank account, card or wallet. It is only accounting inside the platform.

## 11. Split Later Strategy

To make future separation realistic:

- keep domain services independent from route components;
- avoid importing UI into domain modules;
- keep validation schemas close to domain boundaries;
- keep API contracts explicit;
- keep background jobs in `workers`;
- avoid role-specific business rules scattered across UI files.

The first codebase can be one deployable app, but each domain should already look like it could be moved later.
