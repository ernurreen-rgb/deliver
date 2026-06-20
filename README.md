# Deliver

Food delivery platform prototype for Almaty.

## Repository layout

Deliver is an npm-workspaces monorepo. Run lifecycle and quality commands from
the repository root.

```text
apps/
  web/                 # Next.js App Router application
packages/              # shared contracts, domain, database and auth packages
prisma/                # shared PostgreSQL schema and migrations
scripts/               # repository-level release and acceptance tooling
```

The root `npm run dev`, `npm run build` and `npm run start` commands delegate to
`@deliver/web`. Vercel builds from the repository root and publishes
`apps/web/.next`, so the existing project linkage and cron route remain valid.

### Shared packages

- `@deliver/contracts` contains API/domain DTOs that are safe to share with web
  and future mobile clients.
- `@deliver/domain` contains framework-independent pure domain helpers such as
  money formatting, delivery pricing, menu image URLs and order status helpers.
- `@deliver/database` owns database configuration, lazy Prisma client
  initialization and the generated Prisma client exports.
- `@deliver/auth` contains reusable auth/session and role-access helpers.

Prisma generates the client into `packages/database/src/generated/prisma`.
Generated files are ignored by git and recreated by `npm install`/`npm run
db:generate`. The web app keeps compatibility wrappers under
`apps/web/src/generated/prisma` and `apps/web/src/lib/db` so existing imports
continue to work while the split-ready packages are adopted incrementally.

## Getting Started

### Local database

Use a regular local PostgreSQL service for development. Do not use `prisma dev`
as the main app database; it has been unstable with the Prisma driver adapter in
this project.

Default local setup:

- PostgreSQL binaries: `E:\Apps\PostgreSQL\17\bin`
- Data directory: `E:\Projects\.postgres-data\deliver`
- Service: `postgresql-x64-17-deliver`
- Database: `deliver`
- URL: `postgresql://postgres:postgres@localhost:5432/deliver?schema=public`

These are workstation defaults, not repository requirements. Override them with
`DELIVER_POSTGRES_BIN`, `DELIVER_POSTGRES_DATA`,
`DELIVER_POSTGRES_SERVICE`, `DELIVER_POSTGRES_HOST` and
`DELIVER_POSTGRES_PORT` when PostgreSQL is installed elsewhere. Slow recovery
can be accommodated with `DELIVER_POSTGRES_START_TIMEOUT_SECONDS` (default: 90,
allowed range: 10-300).

Useful commands:

```bash
npm run db:local:status
npm run db:local:start
npm run db:local:stop
npm run db:local:psql
```

Apply schema and seed data:

```bash
npx prisma migrate deploy
npm run db:seed
```

Run the cash-only MVP smoke:

```bash
npm run smoke:cash-order
```

Run the web pilot acceptance against a running app:

```bash
npm run acceptance:pilot
```

This creates a fresh cash smoke order, logs in through the OTP forms with
separate customer, admin/restaurant and courier sessions, and verifies the main
role surfaces.

Run the browser viewport acceptance against a running app:

```bash
npm run acceptance:viewports
```

This launches headless Chrome, checks the pilot routes in desktop and mobile
viewports, and fails on horizontal overflow, clipped interactive controls,
missing surface markers, missing expected content or browser errors.

Repeated local acceptance runs can hit the OTP rate limit. For local databases
only:

```bash
npm run auth:reset-local-rate-limits
```

Check split-ready app boundaries before larger feature work:

```bash
npm run architecture:check
```

Run the full release gate before production promotion:

```bash
npm run release:gate
```

Release commands require an explicit environment identity. `RELEASE_TARGET` and
`RELEASE_DATABASE_TAG` accept `local`, `staging` or `production`. Use `local` for
both variables during local verification. For staging and production,
`RELEASE_DATABASE_TAG` is required and must exactly match `RELEASE_TARGET`.

`release:gate` runs with `RELEASE_TARGET=production` checks. For a closed pilot,
configure `VERCEL_ACCOUNT_PLAN`, `CLOSED_PILOT_OTP_ENABLED` and
`CLOSED_PILOT_OTP_PHONE_ALLOWLIST` before running it. Because the gate creates
a real smoke order, set `SMOKE_ALLOW_PRODUCTION_WRITE=1` only when the target
database is intentionally ready for a production smoke write.

Check a running local or deployed app API surface:

```bash
npm run release:check-api
```

For deployed staging/production checks, set `RELEASE_TARGET` and `APP_BASE_URL`
explicitly. Localhost is accepted only for the default local target.

Verify a deployed staging or production release end to end:

```bash
npm run release:verify-deployed
```

This command verifies the deployed URL and API, runs the role acceptance flow,
and captures desktop/mobile viewport evidence. Set `APP_BASE_URL`,
`DATABASE_URL`, matching `RELEASE_TARGET`/`RELEASE_DATABASE_TAG`, and the
target-specific `SMOKE_ALLOW_*_WRITE=1` before running it; deployed verification
creates real smoke orders.

Verify the production build locally with runtime API, role and viewport checks:

```bash
npm run release:verify-local-prod
```

Operational deployment notes are in [docs/OPERATIONS.md](./docs/OPERATIONS.md).
The release checklist is in
[docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md).
Future app split boundaries are documented in [APP_BOUNDARIES.md](./APP_BOUNDARIES.md).
The in-app manual pilot checklist is available at `/operator/pilot` for
operator/admin users.

### Development server

```bash
npm run dev:local
```

This command starts the local PostgreSQL instance, pins the app to the local
database URL from `.env`, and uses the development OTP and geocoding providers.
It does not use the Neon settings stored in `.env.local`.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
