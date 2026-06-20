# Release Checklist

Use this checklist for staging and production promotion of the cash-only closed
pilot.

## Environment

- `APP_BASE_URL` is the exact deployed URL being verified.
- `DATABASE_URL` is the database used by that deployed URL.
- `RELEASE_TARGET` is `staging` or `production`.
- `RELEASE_DATABASE_TAG` is required and exactly equals `RELEASE_TARGET`.
- `CRON_SECRET` is the secret configured on the same deployment.
- `VERCEL_ACCOUNT_PLAN` is `pro` or `enterprise` for production. Hobby is
  accepted only for staging when the configured cron schedule is
  Hobby-compatible.
- Only the write flag matching the target is enabled:
  `SMOKE_ALLOW_STAGING_WRITE=1` for staging or
  `SMOKE_ALLOW_PRODUCTION_WRITE=1` for production.
- The write flag for the other target remains `0`.
- `PILOT_VIEWPORT_SCREENSHOT_DIR` points to the evidence directory for this
  release.
- `.vercel/project.json` exists or both `VERCEL_ORG_ID` and
  `VERCEL_PROJECT_ID` are configured.
- `SMOKE_RESET_FIXTURES=1` is used only to clear stale smoke orders before a
  rerun, not during normal verification.

Valid identity pairs are:

| `RELEASE_TARGET` | `RELEASE_DATABASE_TAG` |
| --- | --- |
| `local` | `local` |
| `staging` | `staging` |
| `production` | `production` |

Staging and production checks must fail when the values do not match.

## Production Pre-Deploy Gate

`release:gate` deliberately forces production validation. Do not run it against
a staging database with staging identity or write flags.

1. Confirm the target database and release identity variables.
2. Confirm only the target-specific smoke write flag is enabled.
3. Run:

```powershell
npm.cmd run release:gate
```

4. Confirm lint, tests, Prisma validation, production build, migration deploy
   and cash-order smoke all pass.

## Post-Deploy Verification

Run the complete deployed verification with one command:

```powershell
npm.cmd run release:preflight-vercel
npm.cmd run release:verify-deployed
```

The command must verify:

- the explicit deployed `APP_BASE_URL`;
- the Vercel CLI account and expected project identity;
- the `/api/health` request host and Vercel project ID;
- `/api/health` and the authenticated cron dry-run API;
- customer, operator, restaurant and courier role flows;
- desktop and mobile viewport checks;
- viewport evidence written to `PILOT_VIEWPORT_SCREENSHOT_DIR`.

The role and viewport checks create real smoke orders. Do not accept a run where
`APP_BASE_URL`, `DATABASE_URL`, `RELEASE_TARGET` and `RELEASE_DATABASE_TAG` refer
to different environments.

If a previous run failed after assigning the pilot courier, run
`npm.cmd run smoke:reset-fixtures` with `SMOKE_RESET_FIXTURES=1` and the matching
target write flag before rerunning `release:verify-deployed`.

## Acceptance Evidence

- `release:verify-deployed` exits successfully.
- `/api/health` returned HTTP 200 with `ok: true`.
- Cron dry-run rejected missing authorization and passed with `CRON_SECRET`.
- Customer tracking, operator, restaurant and courier checks passed.
- Desktop and mobile screenshots exist for the release.
- `release-manifest-*.json` reports `status: "success"` and all verification
  steps are listed in `completedSteps`.
- No horizontal overflow, clipped controls, missing expected content or browser
  errors were reported.

For a local customer-mobile candidate, also require:

- `npm.cmd run acceptance:customer-web` completed the browser OTP-to-status flow;
- the Android app completed the same OTP-to-status flow against the same API and
  PostgreSQL database;
- the mobile status screen remained active while the web scenario completed;
- Expo Doctor, Android/iOS export and Android crash-log checks passed;
- the run is recorded in `docs/CUSTOMER_MOBILE_ACCEPTANCE.md`.

## Production-Specific Checks

- `RELEASE_TARGET=production`.
- `RELEASE_DATABASE_TAG=production`.
- `SMOKE_ALLOW_STAGING_WRITE=0`.
- `SMOKE_ALLOW_PRODUCTION_WRITE=1` only for the verification window.
- Closed-pilot OTP allowlist contains only approved pilot phone numbers.
- Restore `SMOKE_ALLOW_PRODUCTION_WRITE=0` after verification.
