# Courier JSON API

Courier endpoints are versioned under `/api/v1/courier` and return the shared
`ApiResult<T>` envelope. They accept the bearer token issued by the existing OTP
authentication endpoints and require the `courier` or `admin` role.

All responses use `Cache-Control: no-store`. Monetary values are integer minor
units in KZT. Timestamps are ISO 8601 strings.

## Authentication

Courier mobile uses the shared endpoints:

- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `GET /api/v1/auth/session`
- `DELETE /api/v1/auth/session`

The app rejects an authenticated user that has neither the courier nor admin
role.

## Dashboard

`GET /api/v1/courier/dashboard`

Returns courier profile and availability, balance, pending offers, assigned
deliveries and a server refresh timestamp. Customer contact data is scoped to
offers sent to this courier and deliveries assigned to this courier.

## Availability

`PATCH /api/v1/courier/availability`

```json
{ "online": true }
```

Going online requires a configured courier location. Going offline is rejected
while an active delivery exists and cancels pending offers before redispatch.

## Offers

`POST /api/v1/courier/offers/:offerId`

```json
{ "action": "accept" }
```

`action` is `accept` or `reject`. Domain-level concurrency checks prevent an
expired or already claimed offer from being accepted.

## Delivery lifecycle

`POST /api/v1/courier/deliveries/:deliveryId`

Supported bodies:

```json
{ "action": "pickup" }
```

```json
{ "action": "start" }
```

```json
{ "action": "complete", "cashCollectedConfirmed": true }
```

```json
{ "action": "release", "reason": "Сломался велосипед" }
```

The server validates the expected order and delivery state for every transition.
Completion supports cash-to-courier orders only through the existing financial
settlement domain and requires an explicit cash confirmation. Releasing a
delivery is allowed only while assigned and triggers redispatch.

Every successful mutation returns the refreshed courier dashboard and, when
available, the affected public order number.
