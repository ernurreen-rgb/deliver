# Release Checklist

This checklist is for the cash-only operational MVP. SMS, online card payments,
marketplace payouts, POS integrations and mobile apps are intentionally outside
this release.

## Local Smoke

1. Start PostgreSQL and apply migrations.
2. Seed the local database.
3. Run the automated cash-only smoke:

```powershell
npm.cmd run smoke:cash-order
```

The smoke creates a real order with seeded fixtures, moves it through restaurant
acceptance/preparation, dispatches the courier offer, completes the delivery and
checks payment, ledger and status-history records.

4. With the app running, run the web role acceptance:

```powershell
npm.cmd run acceptance:pilot
```

This submits the real OTP login forms with separate customer, admin/restaurant
and courier sessions, then checks customer tracking, `/operator`, `/restaurant`
and `/courier`.

## Required Environment

- `DATABASE_URL` points to the production or staging PostgreSQL database.
- `RELEASE_TARGET` is set to `staging` or `production` for deployed release
  checks. `release:gate` forces production-target validation.
- `RELEASE_DATABASE_TAG` exactly matches `RELEASE_TARGET` for staging and
  production checks.
- `CRON_SECRET` is set and not shared with browser/client code.
- `VERCEL_ACCOUNT_PLAN` is set to `pro` or `enterprise` for production because
  `/api/jobs/dispatch-tick` runs every minute. Vercel Hobby supports only daily
  cron jobs and is not suitable for automatic courier redispatch.
- Until real SMS is implemented, production `OTP_PROVIDER=dev` requires
  `CLOSED_PILOT_OTP_ENABLED=true` and a non-empty
  `CLOSED_PILOT_OTP_PHONE_ALLOWLIST` of pilot `+7` phone numbers.
- `NEXT_PUBLIC_` variables contain only values that are safe to expose.
- `.env*` files are not committed except `.env.example`.
- Smoke and acceptance commands create real orders. For `RELEASE_TARGET=staging`,
  set `SMOKE_ALLOW_STAGING_WRITE=1` only for an intentional staging write. For
  `RELEASE_TARGET=production`, set `SMOKE_ALLOW_PRODUCTION_WRITE=1` only for an
  intentional production write.

## Deployment Gate

Run this production gate before promoting a production build:

```powershell
npm.cmd run release:gate
```

`release:gate` runs production-target environment validation, lint, tests,
Prisma validation, production build, migration deploy and the cash-order smoke.
It creates a real smoke order in the target database.

After a deployment is serving traffic, run the complete verification:

```powershell
npm.cmd run release:verify-deployed
```

Set `APP_BASE_URL` to the deployed URL and `CRON_SECRET` to the deployment secret
before running it against staging or production-like environments. Also set
matching `RELEASE_TARGET` and `RELEASE_DATABASE_TAG` values and enable only the
target-specific smoke write flag. The verifier checks the API, role flow and
desktop/mobile viewports and stores screenshot evidence.

`release:verify-deployed` includes both `acceptance:pilot` and
`acceptance:viewports`. Run those scripts separately only when troubleshooting a
failed role or browser step; each standalone command creates another real smoke
order.

## Operational Gate

- `/api/jobs/dispatch-tick` is configured as a cron job.
- The Vercel project is on Pro or Enterprise while `vercel.json` uses
  `* * * * *` for dispatch.
- Cron requests include `Authorization: Bearer <CRON_SECRET>`.
- Release API checks use `?dryRun=1`; the real Vercel cron calls the same
  endpoint without `dryRun`.
- `/api/health` returns HTTP 200 with `ok: true`.
- `release:check-api` passes against the deployed URL.
- Seed/demo data does not leave couriers with active deliveries.
- At least one active restaurant, one available menu item, one customer address
  and one available courier exist in staging before the smoke.
- Restaurant, courier and operator accounts are separate for the live pilot.

## Manual Pilot Check

After the automated smoke and web role acceptance pass, run one manual browser
pass:

1. Customer places a cash order.
2. Restaurant accepts, starts preparing and marks the order ready.
3. Courier accepts the offer, picks up, starts delivery and completes it.
4. Customer order page shows delivered and paid.
5. Operator panel shows no unresolved dispatch or financial-review issues.
6. Capture desktop and mobile viewport evidence for `/operator/pilot`,
   `/operator`, `/restaurant`, `/courier`, `/orders/[number]` and
   `/login?next=...`; verify no clipped buttons, horizontal scroll, hidden
   controls or unreadable warning actions.
