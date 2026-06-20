# Deliver customer mobile

Expo SDK 56 application for the customer-only MVP. It consumes the versioned
JSON API from `apps/web` and shares only framework-independent
`@deliver/contracts` and `@deliver/domain` packages.

Implemented flow:

```text
OTP login → restaurants → menu → cart → cash checkout → order status
```

Courier, restaurant and back-office surfaces are intentionally not part of
this app. SMS and online payments are also out of scope.

## Local Android development

Start PostgreSQL and Next.js from the repository root:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:seed
npm.cmd run dev:local
```

In a second terminal:

```powershell
npm.cmd run mobile:android
```

The Android emulator default API URL is `http://10.0.2.2:3000`. For a physical
device, set the workstation LAN URL before starting Metro:

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.1.10:3000"
npm.cmd run mobile:start
```

The device must be able to reach that URL. Deployed preview/production builds
must use an HTTPS URL.

Local pilot login defaults to `+77000000002`; when the dev provider exposes a
code, the app fills it automatically. Checkout uses the seeded address
`проспект Абая, 10` and its WGS84 coordinates. Apartment, entrance, floor and
comment remain editable.

## Quality checks

From the repository root:

```powershell
npm.cmd run mobile:typecheck
npm.cmd run doctor --workspace @deliver/customer-mobile
npm.cmd run mobile:export
npm.cmd test
npm.cmd run lint
npm.cmd run architecture:check
```

The release candidate was exercised on an Android API 36 x86_64 emulator through
Expo Go. The full customer flow completed against the local Next.js API and
shared PostgreSQL database with an empty crash buffer. The reproducible
cross-client acceptance record is in
[`docs/CUSTOMER_MOBILE_ACCEPTANCE.md`](../../docs/CUSTOMER_MOBILE_ACCEPTANCE.md).

`mobile:export` bundles both Android and iOS. React is intentionally pinned to
the repository's `19.2.4` patch to avoid two React runtimes in the npm
monorepo; React Native 0.85 accepts `^19.2.3`. The explicit Expo install
exclusion documents this verified patch alignment.

## Session and API configuration

The bearer session token is stored with `expo-secure-store`, using the device
keychain/keystore. Logout revokes the API session and deletes the local token.

`EXPO_PUBLIC_API_URL` is compile-time public configuration, not a secret. The
API contract and error envelope are documented in `docs/CUSTOMER_API.md`.

## iOS cloud build

The app config contains:

- bundle identifier `kz.deliver.customer`;
- build number and local app version;
- portrait phone layout;
- SecureStore config plugin;
- `usesNonExemptEncryption: false` for App Store export-compliance metadata.

`eas.json` defines `preview` internal-distribution and `production` profiles.
On a workstation authenticated to the intended Expo organization:

```powershell
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest init
npx.cmd eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<staging-host>
npx.cmd eas-cli@latest build --platform ios --profile preview
```

The first `init` binds the repository to the owner's Expo project and writes
the real EAS project ID. Apple signing requires the owner's Apple Developer
credentials; those credentials and the generated project ID must not be
invented or committed by an unauthenticated local run.
