# Operations Runbook

This runbook covers the cash-only closed MVP. It intentionally excludes
production SMS, online card payments, split payments and POS integrations.

## Local Environment

Start PostgreSQL and the app:

```powershell
npm.cmd run db:local:start
npm.cmd run db:migrate:deploy
npm.cmd run db:seed
npm.cmd run dev
```

Useful local URLs:

- App: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Dispatch cron: `http://localhost:3000/api/jobs/dispatch-tick`
- Pilot runbook: `http://localhost:3000/operator/pilot`

Production dispatch is configured in `vercel.json` as `* * * * *` because
courier offers expire after one minute. This requires Vercel Pro or Enterprise;
Hobby allows only daily cron jobs and must not be used for automatic redispatch.

The cron endpoint must be called with:

```text
Authorization: Bearer <CRON_SECRET>
```

For read-only verification, call:

```text
/api/jobs/dispatch-tick?dryRun=1
```

Dry-run reports expired offers, missing deliveries and redispatch candidates,
but does not expire offers, create deliveries or dispatch couriers.

## Release Gate

Before promotion, run:

```powershell
$env:RELEASE_TARGET="production"
$env:RELEASE_DATABASE_TAG="production"
$env:VERCEL_ACCOUNT_PLAN="pro"
$env:CLOSED_PILOT_OTP_ENABLED="true"
$env:CLOSED_PILOT_OTP_PHONE_ALLOWLIST="+77000000001,+77000000002,+77000000003"
$env:SMOKE_ALLOW_PRODUCTION_WRITE="1"
npm.cmd run release:gate
```

This command validates production-target release env, lints, runs tests,
validates Prisma, builds Next.js, deploys migrations and runs the cash-order
smoke.

To verify the built app through `next start` before using a deployed URL:

```powershell
npm.cmd run release:verify-local-prod
```

This command builds the app, starts a temporary production server on a free local
port, runs `release:check-api`, `acceptance:pilot` and `acceptance:viewports`,
saves viewport screenshots under `.pilot-evidence`, and then stops the temporary
server.

The smoke creates a real order in the target database. Run it against staging or
production-like environments only when smoke fixture accounts are expected to
exist. If `RELEASE_TARGET=staging`, set `SMOKE_ALLOW_STAGING_WRITE=1`
explicitly. If `RELEASE_TARGET=production`, set
`SMOKE_ALLOW_PRODUCTION_WRITE=1` explicitly before running smoke or acceptance
commands.

If a previous smoke or acceptance run failed after assigning the pilot courier,
reset only stale smoke fixtures before rerunning:

```powershell
$env:SMOKE_RESET_FIXTURES="1"
npm.cmd run smoke:reset-fixtures
$env:SMOKE_RESET_FIXTURES="0"
```

The reset refuses to touch non-smoke active deliveries. It only cancels active
deliveries for orders whose comment starts with `smoke:cash-order`, and it still
requires the matching staging or production write flag for non-local targets.

To verify the running web app role flow after the app is serving traffic:

```powershell
npm.cmd run acceptance:pilot
```

`acceptance:pilot` creates a fresh smoke order, submits the real OTP HTML forms
with separate cookie sessions, then checks customer tracking, operator pilot
focus, restaurant access and courier access. Set `APP_BASE_URL` to the deployed
URL when running it against staging or production-like environments. Keep
`DATABASE_URL` pointed at the same database used by that deployed URL; the
acceptance command creates the smoke order through Prisma first, then verifies it
through the web app.

For desktop/mobile browser evidence:

```powershell
npm.cmd run acceptance:viewports
```

Set `PILOT_VIEWPORT_SCREENSHOT_DIR=.pilot-evidence` to save screenshots. The
viewport check launches headless Chrome, logs in as the pilot customer,
admin/restaurant and courier accounts, and fails on horizontal overflow,
clipped interactive controls, missing surface markers, missing expected content
or browser errors.

If repeated local pilot checks hit OTP rate limits, clear only local OTP buckets:

```powershell
npm.cmd run auth:reset-local-rate-limits
```

The reset command refuses to run when `RELEASE_TARGET` is not local or when
`DATABASE_URL` is not a local PostgreSQL URL.

If the pilot courier is blocked by a stale smoke delivery, use
`npm.cmd run smoke:reset-fixtures` with `SMOKE_RESET_FIXTURES=1`. Do not use it
as a generic cleanup tool for live orders.

## Post-Deploy API Check

After a deployment is serving traffic:

```powershell
$env:APP_BASE_URL="https://staging.example.com"
$env:CRON_SECRET="<staging cron secret>"
$env:RELEASE_TARGET="staging"
$env:RELEASE_DATABASE_TAG="staging"
npm.cmd run release:check-api
```

For the complete deployed role and viewport check, set the matching staging
write flag, run the read-only `npm.cmd run release:preflight-vercel`, then run
`npm.cmd run release:verify-deployed`. The full verifier repeats the preflight
before it creates a smoke order and writes a secret-free
`release-manifest-*.json` beside the viewport screenshots.

Expected result:

- `/api/health` returns HTTP 200 with `ok: true`.
- `/api/health` reports the expected Vercel project ID and request host.
- `/api/jobs/dispatch-tick?dryRun=1` returns HTTP 401 without auth.
- `/api/jobs/dispatch-tick?dryRun=1` returns HTTP 200 with the bearer token and
  `summary.dryRun=true`.

## Staging Fixtures

Required fixtures for `smoke:cash-order`:

- customer `+77000000002` with at least one address with coordinates;
- restaurant staff/admin `+77000000001`;
- courier user `+77000000003`;
- active `tengri-kitchen` restaurant;
- at least one active and available menu item above minimum order;
- active delivery pricing rule and service fee rule;
- courier status and availability set to `available`;
- no active delivery assigned to the smoke courier.

In CI, `npm run db:seed` creates these fixtures.

## Manual Pilot Flow

Use `/operator/pilot` as the in-app checklist for a cash-only test order.

Seed accounts:

- operator / restaurant admin: `+77000000001`;
- customer: `+77000000002`;
- courier: `+77000000003`;
- dev OTP: `111111`.

Expected manual path:

1. Customer creates a `cash_to_courier` order.
2. Restaurant accepts, starts preparing and marks ready for pickup.
3. Courier accepts the offer, picks up, starts delivery and completes delivery.
4. Operator verifies the order in `/operator` and the pilot journal.

Successful result:

- order status: `delivered`;
- delivery status: `delivered`;
- payment status: `paid`;
- courier and restaurant ledger entries exist.

## If Smoke Fails

1. Check whether the smoke courier has an active delivery.
2. Check `/operator` for pending dispatch or financial-review issues.
3. Run `npm.cmd run jobs:dispatch-tick` to recover expired or missing dispatch.
4. Check `DATABASE_URL`, `CRON_SECRET`, `GEO_PROVIDER` and 2GIS keys.
5. Re-run `npm.cmd run smoke:cash-order` only after the fixture state is clean.

## Rollback

For app-only regressions:

1. Roll back the deployment to the previous build.
2. Run `release:check-api` against the rolled-back URL.
3. Verify `/operator` has no unresolved delivery or financial-review issues.

For schema regressions:

1. Stop new deployments.
2. Do not run ad-hoc destructive SQL.
3. Restore from database backup or apply a forward migration that repairs the
   schema/data issue.
4. Re-run `release:gate` against a restored staging copy before promoting again.

## Production Notes

- `OTP_PROVIDER=dev` is acceptable only for the closed pilot. In production it
  must be paired with `CLOSED_PILOT_OTP_ENABLED=true` and
  `CLOSED_PILOT_OTP_PHONE_ALLOWLIST` containing only approved `+7` pilot phone
  numbers. The fixed dev code is not shown on the login page in production.
- Cash collection is represented by internal balances and ledger entries.
- Production card payment providers and marketplace payouts are future work.
- `CRON_SECRET` and database URLs must never be exposed through `NEXT_PUBLIC_`
  variables.
- `VERCEL_ACCOUNT_PLAN=pro` or `enterprise` is required while dispatch uses the
  per-minute Vercel cron schedule.
