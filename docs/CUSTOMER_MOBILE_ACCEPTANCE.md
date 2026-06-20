# Customer cross-client acceptance

This document records the release-candidate verification for the customer-only
mobile MVP. Local evidence is written to `.pilot-evidence/` and intentionally
ignored by git because it contains workstation-specific screenshots and logs.

## Verified environment

- Date: 2026-06-21 (Asia/Qyzylorda).
- Branch: `codex/monthly-release-candidate`.
- Shared backend: Next.js 16.2.6 on `http://localhost:3000`.
- Shared database: PostgreSQL 17, database `deliver` on localhost.
- Mobile runtime: Expo SDK 56 / Expo Go on Android API 36 x86_64.
- Android API URL: `http://10.0.2.2:3000`.
- iOS bundle identifier: `kz.deliver.customer`.

## Full local scenario

The following scenario was completed independently in both clients against the
same running API and PostgreSQL database:

```text
OTP login -> restaurant -> menu -> cart -> cash checkout -> order status
```

Android created order `A-20260620-124FF8` for Tengri Kitchen with a total of
4,279 KZT and remained on the pending-confirmation status screen. While that
screen and its five-second status polling remained active, the web UI acceptance
created order `A-20260620-4BBF4C` and reached its order-status URL. The Android
screen was dumped again after the web flow and still showed its original order,
restaurant and total. The Expo Go crash buffer was empty and filtered app logs
contained no fatal, unhandled React Native or network-request errors.

The web scenario is reproducible with:

```powershell
npm.cmd run auth:reset-local-rate-limits
npm.cmd run acceptance:customer-web
```

`acceptance:customer-web` launches the installed Chrome executable with
Playwright, refuses non-local targets, clears browser cart/session state, uses
the local OTP provider, selects Tengri Kitchen and an available menu item,
asserts cash is selected and online card payment is disabled, creates the order,
and verifies the status page. Set `PLAYWRIGHT_CHROME_PATH` when Chrome is not in
its default Windows installation path.

## Android evidence procedure

Android was driven through `adb` using UI-hierarchy-derived coordinates. The
captured evidence under `.pilot-evidence/android-final/` includes step-specific
UI trees, compact summaries, checkout and order-status screenshots, and app
logs. Key stable accessibility identifiers include:

- `request-otp-button` and `verify-otp-button`;
- `restaurant-tengri-kitchen`;
- `add-item-<menu-item-id>` and `open-cart-button`;
- `create-cash-order-button` and `order-status-card`.

The emulator used an isolated SDK/AVD installation outside the repository. This
is verification infrastructure, not an application runtime dependency.

## Quality and packaging gates

The release candidate passed:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run architecture:check
npx.cmd tsc --noEmit
npm.cmd run mobile:typecheck
npm.cmd run db:validate
npm.cmd run doctor --workspace @deliver/customer-mobile
npm.cmd run mobile:export
npm.cmd run build
npm.cmd run smoke:customer-api
npm.cmd run acceptance:pilot
npm.cmd run acceptance:customer-web
```

`mobile:export` generated both Android and iOS bundles. Expo Doctor passed all
21 checks. The iOS app config and EAS preview/production profiles are ready for
cloud build; binding the app to the owner's Expo project and Apple signing must
be performed by an authenticated owner as described in the mobile README.
