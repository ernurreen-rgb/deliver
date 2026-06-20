# Operations

This runbook covers local, staging and production verification for the
cash-only closed pilot.

## Environment Identity

Every release command uses two explicit environment selectors:

- `RELEASE_TARGET`: `local`, `staging` or `production`;
- `RELEASE_DATABASE_TAG`: `local`, `staging` or `production`.

Use `local` for both values during local verification. For staging and
production, `RELEASE_DATABASE_TAG` is required and must exactly match
`RELEASE_TARGET`. Do not reuse a staging tag for production or a production tag
for staging.

Smoke and deployed acceptance commands create real orders. Keep both write
flags at `0` by default and enable only the flag matching the current target:

- staging: `SMOKE_ALLOW_STAGING_WRITE=1`;
- production: `SMOKE_ALLOW_PRODUCTION_WRITE=1`.

If a previous smoke or acceptance run failed after assigning the pilot courier,
reset only stale smoke fixtures before rerunning:

```powershell
$env:SMOKE_RESET_FIXTURES="1"
npm.cmd run smoke:reset-fixtures
$env:SMOKE_RESET_FIXTURES="0"
```

The reset command cancels active smoke orders (including orders still waiting
for courier assignment) whose comment starts with `smoke:cash-order`, and
refuses to touch non-smoke active deliveries.

## Local Verification

Start PostgreSQL, apply migrations and seed fixtures:

```powershell
$env:RELEASE_TARGET="local"
$env:RELEASE_DATABASE_TAG="local"
npm.cmd run db:local:start
npm.cmd run db:migrate:deploy
npm.cmd run db:seed
```

Prisma client is generated into
`packages/database/src/generated/prisma`. It is not committed; `npm install`
runs `prisma generate` through `postinstall`, and schema changes can be
regenerated explicitly with:

```powershell
npm.cmd run db:generate
```

Start the development app against that local database:

```powershell
npm.cmd run dev:local
```

`dev:local` refuses non-local database hosts and overrides any Neon values from
`.env.local` for the child Next.js process.

Verify a local production build through `next start`:

```powershell
npm.cmd run release:verify-local-prod
```

This builds the app, starts a temporary production server, checks the runtime
API and role flows, captures viewport evidence, and then stops the server.

The Vercel project remains linked at the repository root. `vercel.json` runs the
root workspace build and uses `apps/web/.next` as the Next.js output directory.

## Release Gate

Before production promotion:

```powershell
$env:RELEASE_TARGET="production"
$env:RELEASE_DATABASE_TAG="production"
$env:VERCEL_ACCOUNT_PLAN="pro" # production requires Pro/Enterprise
$env:CLOSED_PILOT_OTP_ENABLED="true"
$env:CLOSED_PILOT_OTP_PHONE_ALLOWLIST="+77000000001,+77000000002,+77000000003"
$env:SMOKE_ALLOW_STAGING_WRITE="0"
$env:SMOKE_ALLOW_PRODUCTION_WRITE="1"
npm.cmd run release:gate
```

The gate validates release environment settings, lints, runs tests, validates
Prisma, builds Next.js, deploys migrations and creates a real cash-order smoke.
Confirm `DATABASE_URL` is the intended production database before enabling the
production write flag.

## Deployed Verification

After staging is serving traffic:

```powershell
$env:APP_BASE_URL="https://staging.example.com"
$env:DATABASE_URL="<staging database URL>"
$env:CRON_SECRET="<staging cron secret>"
$env:RELEASE_TARGET="staging"
$env:RELEASE_DATABASE_TAG="staging"
$env:OTP_PROVIDER="dev"
$env:CLOSED_PILOT_OTP_ENABLED="true"
$env:CLOSED_PILOT_OTP_PHONE_ALLOWLIST="+77000000001,+77000000002,+77000000003"
$env:VERCEL_ACCOUNT_PLAN="pro"
$env:GEO_PROVIDER="dev"
$env:SMOKE_ALLOW_STAGING_WRITE="1"
$env:SMOKE_ALLOW_PRODUCTION_WRITE="0"
$env:PILOT_VIEWPORT_SCREENSHOT_DIR=".pilot-evidence/staging"
npm.cmd run release:preflight-vercel
npm.cmd run release:verify-deployed
```

For production, use the production URL, database and secret, set both
`RELEASE_TARGET` and `RELEASE_DATABASE_TAG` to `production`, disable the staging
write flag, and enable `SMOKE_ALLOW_PRODUCTION_WRITE=1`.

`release:preflight-vercel` is read-only. It verifies the Vercel CLI session,
the explicit deployed URL, and project identity from `.vercel/project.json` or
`VERCEL_ORG_ID` plus `VERCEL_PROJECT_ID`.

`release:verify-deployed` runs that preflight first, verifies that `/api/health`
reports the same Vercel project and request host, checks the authorized cron
dry-run APIs, runs the customer/operator/restaurant/courier role acceptance
flow, and captures desktop/mobile viewport evidence. The command creates real
smoke orders in `DATABASE_URL`; that database must be the database used by
`APP_BASE_URL`.

The verifier writes `release-manifest-*.json` into
`PILOT_VIEWPORT_SCREENSHOT_DIR`. The manifest records success or failure,
deployment identity, git SHA/ref and completed steps. It never includes
`DATABASE_URL`, tokens or secrets.

Successful verification requires:

- `/api/health` returns HTTP 200 with `ok: true`;
- `/api/health` reports the expected Vercel project ID and request host;
- the cron dry-run rejects missing authorization and accepts `CRON_SECRET`;
- customer, operator, restaurant and courier role checks pass;
- desktop and mobile viewport checks pass;
- evidence is written to `PILOT_VIEWPORT_SCREENSHOT_DIR`.
- a successful `release-manifest-*.json` exists beside the screenshots.

## Required Smoke Fixtures

The target database must contain:

- customer `+77000000002` with a geocoded address;
- restaurant staff/admin `+77000000001`;
- courier `+77000000003` with no active delivery;
- active `tengri-kitchen` restaurant and an available menu item;
- active delivery pricing and service fee rules.

When the pilot courier is blocked by a stale smoke delivery, run
`npm.cmd run smoke:reset-fixtures` with `SMOKE_RESET_FIXTURES=1` and the matching
target write flag enabled, then rerun verification.

## Rollback Verification

After an application rollback, point `APP_BASE_URL` at the rolled-back
deployment and rerun `npm.cmd run release:verify-deployed` with the same target,
matching database tag and target-specific write flag. For schema failures, stop
promotion and restore from backup or apply a forward repair migration before
rerunning verification against staging.
