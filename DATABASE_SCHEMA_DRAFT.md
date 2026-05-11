# Database Schema Draft

## 1. Общие правила

- Основная база: PostgreSQL.
- ORM: Prisma.
- ID: UUID.
- Время: `created_at`, `updated_at`, где нужно `deleted_at`.
- Деньги хранить целыми числами в minor units и всегда рядом хранить `currency`, например `KZT`.
- Заказы должны хранить snapshots: блюда, цены, контактные данные, адрес, расчет доставки и финансовые итоги на момент оформления.
- Для аудита важных действий использовать историю статусов и `audit_logs`.
- Для русского и казахского контента использовать таблицы переводов.

## 2. Enums

```text
user_role:
  customer
  restaurant_staff
  courier
  operator
  admin

order_status:
  created
  pending_confirmation
  accepted
  preparing
  ready_for_pickup
  courier_assigned
  picked_up
  delivering
  delivered
  cancelled

payment_method:
  cash_to_courier
  online_card

payment_status:
  pending
  authorized
  paid
  failed
  cancelled
  refunded
  partially_refunded

courier_type:
  staff
  partner

courier_status:
  inactive
  available
  busy
  suspended

restaurant_integration_mode:
  dashboard
  iiko
  r_keeper
  custom_api

language:
  ru
  kk

promo_discount_type:
  percent
  fixed_amount
  free_delivery
  delivery_discount
```

## 3. Users and Auth

### `users`

- `id`
- `phone`
- `phone_verified_at`
- `name`
- `status`
- `created_at`
- `updated_at`

### `user_roles`

- `id`
- `user_id`
- `role`
- `created_at`

### `user_preferences`

- `id`
- `user_id`
- `language`
- `created_at`
- `updated_at`

### `auth_verification_codes`

- `id`
- `phone`
- `code_hash`
- `purpose`
- `expires_at`
- `consumed_at`
- `attempt_count`
- `created_at`

For development, OTP can use a dev provider. Production provider is selected later.

### `user_sessions`

- `id`
- `user_id`
- `session_token_hash`
- `expires_at`
- `created_at`
- `revoked_at`

## 4. Addresses

### `addresses`

- `id`
- `user_id`
- `label`
- `city`
- `address_line`
- `street`
- `house`
- `apartment`
- `entrance`
- `floor`
- `intercom`
- `comment`
- `latitude`
- `longitude`
- `created_at`
- `updated_at`

## 5. Restaurants

### `restaurants`

- `id`
- `slug`
- `status`
- `integration_mode`
- `phone`
- `address_line`
- `latitude`
- `longitude`
- `delivery_radius_meters`
- `minimum_order_amount`
- `default_commission_percent`
- `created_at`
- `updated_at`

### `restaurant_translations`

- `id`
- `restaurant_id`
- `language`
- `name`
- `description`
- `created_at`
- `updated_at`

### `restaurant_staff`

- `id`
- `restaurant_id`
- `user_id`
- `role`
- `created_at`

### `restaurant_categories`

- `id`
- `slug`
- `sort_order`
- `is_active`
- `created_at`
- `updated_at`

### `restaurant_category_translations`

- `id`
- `category_id`
- `language`
- `name`

### `restaurant_working_hours`

- `id`
- `restaurant_id`
- `weekday`
- `opens_at`
- `closes_at`
- `is_closed`

## 6. Menu

### `menu_categories`

- `id`
- `restaurant_id`
- `sort_order`
- `is_active`
- `created_at`
- `updated_at`

### `menu_category_translations`

- `id`
- `menu_category_id`
- `language`
- `name`

### `menu_items`

- `id`
- `restaurant_id`
- `menu_category_id`
- `price`
- `currency`
- `image_url`
- `is_active`
- `is_available`
- `sort_order`
- `created_at`
- `updated_at`

### `menu_item_translations`

- `id`
- `menu_item_id`
- `language`
- `name`
- `description`

### `menu_item_options`

- `id`
- `menu_item_id`
- `type`
- `is_required`
- `min_selected`
- `max_selected`
- `created_at`
- `updated_at`

### `menu_item_option_values`

- `id`
- `option_id`
- `price_delta`
- `currency`
- `is_available`
- `sort_order`

### `menu_item_option_value_translations`

- `id`
- `option_value_id`
- `language`
- `name`

## 7. Orders

### `orders`

- `id`
- `public_number`
- `customer_id`
- `restaurant_id`
- `status`
- `payment_method`
- `payment_status`
- `customer_comment`
- `restaurant_comment`
- `created_at`
- `accepted_at`
- `cancelled_at`
- `delivered_at`
- `updated_at`

### `order_items`

- `id`
- `order_id`
- `menu_item_id`
- `name_snapshot`
- `description_snapshot`
- `unit_price`
- `quantity`
- `total_price`
- `currency`
- `options_snapshot`
- `comment`
- `created_at`

### `order_delivery_address`

- `id`
- `order_id`
- `name_snapshot`
- `phone_snapshot`
- `city`
- `address_line`
- `street`
- `house`
- `apartment`
- `entrance`
- `floor`
- `intercom`
- `comment`
- `latitude`
- `longitude`

### `order_status_history`

- `id`
- `order_id`
- `from_status`
- `to_status`
- `changed_by_user_id`
- `comment`
- `created_at`

### `order_financials`

- `id`
- `order_id`
- `items_subtotal`
- `delivery_fee`
- `service_fee`
- `discount_total`
- `customer_total`
- `restaurant_commission`
- `restaurant_payout`
- `courier_earning`
- `platform_revenue`
- `currency`
- `created_at`

## 8. Delivery

### `deliveries`

- `id`
- `order_id`
- `courier_id`
- `status`
- `assigned_by_user_id`
- `assigned_at`
- `picked_up_at`
- `delivered_at`
- `created_at`
- `updated_at`

### `delivery_fee_calculations`

- `id`
- `order_id`
- `restaurant_latitude`
- `restaurant_longitude`
- `customer_latitude`
- `customer_longitude`
- `distance_meters`
- `base_fee`
- `per_km_fee`
- `min_fee`
- `max_fee`
- `manual_adjustment`
- `final_fee`
- `currency`
- `source`
- `created_at`

### `delivery_pricing_rules`

- `id`
- `name`
- `base_fee`
- `per_km_fee`
- `min_fee`
- `max_fee`
- `is_active`
- `created_at`
- `updated_at`

## 9. Couriers

### `couriers`

- `id`
- `user_id`
- `type`
- `status`
- `created_at`
- `updated_at`

### `courier_profiles`

- `id`
- `courier_id`
- `full_name`
- `phone`
- `transport_type`
- `document_number`
- `created_at`
- `updated_at`

### `courier_availability`

- `id`
- `courier_id`
- `status`
- `latitude`
- `longitude`
- `updated_at`

### `courier_balances`

- `id`
- `courier_id`
- `balance`
- `currency`
- `updated_at`

### `courier_ledger_entries`

- `id`
- `courier_id`
- `order_id`
- `type`
- `amount`
- `currency`
- `description`
- `created_at`

Examples:

- courier earning;
- cash collected from customer;
- cash returned to service;
- payout to courier;
- manual adjustment.

## 10. Payments and Settlements

### `payments`

- `id`
- `order_id`
- `method`
- `status`
- `amount`
- `currency`
- `provider`
- `created_at`
- `updated_at`

### `payment_transactions`

- `id`
- `payment_id`
- `provider`
- `provider_transaction_id`
- `type`
- `status`
- `amount`
- `currency`
- `raw_payload`
- `created_at`

### `restaurant_balances`

- `id`
- `restaurant_id`
- `balance`
- `currency`
- `updated_at`

### `restaurant_ledger_entries`

- `id`
- `restaurant_id`
- `order_id`
- `type`
- `amount`
- `currency`
- `description`
- `created_at`

### `settlements`

- `id`
- `target_type`
- `target_id`
- `amount`
- `currency`
- `status`
- `period_from`
- `period_to`
- `created_at`
- `paid_at`

## 11. Promo Codes

### `promocodes`

- `id`
- `code`
- `discount_type`
- `discount_value`
- `min_order_amount`
- `starts_at`
- `ends_at`
- `total_usage_limit`
- `per_user_usage_limit`
- `is_active`
- `created_at`
- `updated_at`

### `promocode_restaurants`

- `id`
- `promocode_id`
- `restaurant_id`

If no rows exist for a promo code, it applies to all restaurants.

### `promocode_redemptions`

- `id`
- `promocode_id`
- `user_id`
- `order_id`
- `discount_amount`
- `created_at`

## 12. Notifications and Audit

### `notifications`

- `id`
- `user_id`
- `channel`
- `type`
- `title`
- `body`
- `status`
- `created_at`
- `sent_at`

### `audit_logs`

- `id`
- `actor_user_id`
- `entity_type`
- `entity_id`
- `action`
- `metadata`
- `created_at`

## 13. First Indexes To Add

- `users.phone`
- `user_roles.user_id`
- `addresses.user_id`
- `restaurants.slug`
- `restaurant_staff.user_id`
- `restaurant_staff.restaurant_id`
- `menu_items.restaurant_id`
- `orders.customer_id`
- `orders.restaurant_id`
- `orders.status`
- `orders.created_at`
- `deliveries.courier_id`
- `payments.order_id`
- `promocodes.code`
- `promocode_redemptions.user_id`
- `promocode_redemptions.order_id`

## 14. Open Schema Decisions

- Exact OTP production provider.
- Exact online payment provider.
- Whether to add PostGIS in the first release or keep decimal lat/lng fields first.
- Exact restaurant working hours and holiday schedule model.
- Whether scheduled orders are included in the first implementation or only prepared in schema.
