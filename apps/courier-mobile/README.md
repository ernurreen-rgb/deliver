# Deliver courier mobile

Expo SDK 56 application for the courier workflow. It consumes the versioned
JSON API from `apps/web` and shares only framework-independent
`@deliver/contracts` and `@deliver/domain` packages.

Implemented flow:

```text
OTP login -> line availability -> offer -> route -> pickup -> delivery -> cash confirmation -> completion
```

The app also supports rejecting an offer and releasing an assigned delivery
with a required reason. Dashboard data refreshes every 10 seconds and can be
refreshed manually with pull-to-refresh.

## Local Android development

Start PostgreSQL and Next.js from the repository root:

```powershell
npm.cmd run dev:local
```

In a second terminal:

```powershell
npm.cmd run courier-mobile:android
```

The Android emulator uses `http://10.0.2.2:3000` by default. The local pilot
courier is `+77000000003`; the dev OTP is filled automatically. For a physical
device, set a reachable workstation URL before starting Metro:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.10:3000"
npm.cmd run courier-mobile:start
```

To prepare a local ready-for-pickup offer for manual QA:

```powershell
npm.cmd run smoke:prepare-courier-mobile
```

The preparation command refuses non-local PostgreSQL targets.

## Quality checks

```powershell
npm.cmd run courier-mobile:typecheck
npm.cmd run doctor --workspace @deliver/courier-mobile
npm.cmd run courier-mobile:export
npm.cmd run smoke:courier-api
npm.cmd test
npm.cmd run lint
npm.cmd run architecture:check
```

Android API 36 verification covered login, availability in both directions,
offer acceptance/rejection, pickup, delivery start, cash confirmation and
completion. The Expo Go crash buffer and filtered runtime logs were clean.

## Session and API configuration

The bearer token is stored in the device keychain/keystore with
`expo-secure-store` under a courier-specific key. Logout revokes the server
session and removes the device token. `EXPO_PUBLIC_API_URL` is public build-time
configuration, not a secret.

The API contract is documented in `docs/COURIER_API.md`.

## iOS cloud build

The app uses bundle identifier `kz.deliver.courier` and has EAS preview and
production profiles. On a workstation authenticated to the intended Expo and
Apple accounts:

```powershell
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest init
npx.cmd eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<staging-host>
npx.cmd eas-cli@latest build --platform ios --profile preview
```

The real EAS project ID and signing credentials belong to the product owner and
must not be invented or committed by an unauthenticated local run.
