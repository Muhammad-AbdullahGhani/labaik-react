# Labaik Field — focused emulator demo

Expo TypeScript development-build app for [docs/assignment.md](docs/assignment.md).
This delivery implements the user's five-step, roughly 90-minute scope, not the entire
original assignment. See [PROGRESS.md](PROGRESS.md), [docs/PLAN.md](docs/PLAN.md),
[architecture](docs/ARCHITECTURE.md) and [deliberate cuts](docs/KNOWN_GAPS.md).
**Expo Go is not supported.** No APK/device execution is claimed; Android prebuild and
Android/iOS Hermes exports have been verified.

## Install and start the backend

Requires Node **22.13+**, a Java **21+ JDK**, npm, and an Android device/emulator for the app.
First-time package/emulator downloads can take several minutes. Use a real JDK bin on PATH;
the Windows runner avoids Oracle's javapath launcher to allow clean emulator shutdown.

```sh
npm ci
cp .env.example .env
npm run config:demo
npm run emulators
```

On Windows PowerShell use `npm.cmd`/`npx.cmd` if execution policy blocks scripts, and
`Copy-Item .env.example .env`. `config:demo` creates a gitignored emulator-only
`google-services.json`; it refuses to overwrite an existing file. Its project ID is
`demo-labaik-field`, matching the CLI, and its dummy API key cannot access a real backend.

In a **second terminal**:

```sh
npm run seed
```

The seed creates exactly one supervisor, two approved performers, one pending user, and
one job/targeted offer. It is repeatable, resets jobs/offers/active locks, and gives the job
a fresh version so old local actions cannot apply to a reset job.

| Email                   | Role/state                          | Password     |
| ----------------------- | ----------------------------------- | ------------ |
| supervisor@labaik.test  | Approved supervisor                 | DemoPass123! |
| performer-a@labaik.test | Approved performer, first recipient | DemoPass123! |
| performer-b@labaik.test | Approved performer, next recipient  | DemoPass123! |
| pending@labaik.test     | Pending performer                   | DemoPass123! |

These are disposable emulator fixtures, not production credentials. Seed/admin scripts
use the demo project and emulator hosts; no service-account key is required.

| Service     | Port                                        |
| ----------- | ------------------------------------------- |
| Auth        | 9099                                        |
| Firestore   | **8180** (8080 is occupied on this machine) |
| Functions   | 5001                                        |
| Storage     | 9199                                        |
| Emulator UI | 4000                                        |

Emulators bind to 0.0.0.0 so a phone can connect on the same trusted LAN. Do not expose
them publicly. Android emulator host is `10.0.2.2`; a physical phone needs your computer's
LAN IPv4 in `EXPO_PUBLIC_EMULATOR_HOST`, reachable through its firewall. iOS simulator
would use 127.0.0.1 but iOS native configuration/device testing is outside this delivery.
Defaults always select emulators unless explicitly disabled; there is no silent fallback.

## Android APK builds and installation

Package ID: **com.abdullahghani.labaikfield**. `app.config.ts` configures
`@react-native-firebase/app`, the Auth plugin and `android.googleServicesFile` from
`GOOGLE_SERVICES_JSON` or `./google-services.json`. Both config copies and generated native
directories are gitignored. The emulator-only manifest plugin enables cleartext HTTP for
local Firebase emulators, including preview APKs; it is skipped when emulators are disabled.

1. Run `npm run config:demo` if the local config is absent. For a real backend instead,
   register the same Android package in your Firebase project and use its downloaded
   config; production integration/deployment is outside this demo.
2. Run `npx eas-cli login` and `npx eas-cli init` using your Expo account/project.
   If dynamic config prevents automatic assignment, put the returned project ID in
   `app.json` under `expo.extra.eas.projectId`; `app.config.ts` preserves it.
3. In the EAS project dashboard create a **file environment variable** named
   `GOOGLE_SERVICES_JSON` from your gitignored config for the development and preview
   environments. The variable supplies a file path during remote builds. Also set
   `EXPO_PUBLIC_USE_EMULATORS=true` and `EXPO_PUBLIC_EMULATOR_HOST` to your computer's
   reachable LAN IP (or 10.0.2.2 for an Android emulator). Public variables are embedded
   in the bundle; `.env` is not uploaded automatically.
4. Build the development client:

   ```sh
   npm run build:apk:dev
   adb install -r path/to/downloaded-development.apk
   npm start
   ```

   Open the installed development client and connect to Metro. It cannot run in Expo Go.

5. Or build the self-contained preview APK:

   ```sh
   npm run build:apk:preview
   adb install -r path/to/downloaded-preview.apk
   ```

   Preview includes JavaScript and needs no Metro, but still needs reachable emulators.
   EAS also provides a download/install link for a physical device.

`development`: developmentClient=true, distribution=internal, android.buildType=apk.
`preview`: distribution=internal, android.buildType=apk. With Android SDK installed,
`npm run android` is the local development-build alternative. After native config/plugin
changes regenerate with `npx expo prebuild --platform android --no-install` and rebuild.
Change emulator host before bundling; restart Metro/rebuild preview when changing public
build-time variables. See [Expo APK guidance](https://docs.expo.dev/build-reference/apk/)
and [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

Firebase client config is project/app identification, not an Admin secret or authorization
mechanism. Never bundle service-account keys. Access decisions live in rules and callables.

## Tests and checks

Stop the interactive emulator session before running tests, since they use the same ports.

```sh
npm run lint
npm run typecheck
npm run format:check
npm test
npm run test:rules
npm run test:integration
npm run test:demo
npm run build:check
```

- `npm test`: 2 login UI tests plus 9 pure TS/real SQLite unit tests.
- `test:rules`: boots Firestore/Storage and runs 6 rule tests, including real 60 MiB and
  60 MiB+1 uploads, ownership, pending/suspended denial and status transitions.
- `test:integration`: boots Auth/Firestore/Functions and runs 8 HTTP callable tests with
  actual concurrent requests and transaction contention.
- `test:demo`: boots all four emulators, seeds twice, verifies fixture counts/claims,
  then runs both rule and callable suites. This is a reproducible backend demo.
- `build:check`: builds Android/iOS JavaScript/Hermes bundles, not an APK.

Auth requires no CLI login for this local demo. Scheduled clock ticks are not emulated;
the supervisor's **Run expired-offer sweep** button invokes the same transaction logic.
The deployed scheduled function would run every minute. Accept always checks server expiry
independently, so a delayed sweep cannot extend acceptance eligibility.

## Five-minute demo script

**Before the timer:** install the development/preview APK, start emulators (wait for the
ready table), open the app, and have a terminal with test output ready. Seed immediately
before showing offers; they last two minutes. No video, real GPS, or background upload is
implied by this demo.

| Time      | Action and explanation                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:45 | Sign in as pending. Show approval waiting, then sign out. Sign in as supervisor and press Approve pending. Explain server-set claims plus current-status checks.                                                                                                           |
| 0:45–1:30 | Run `npm run seed` to restore a fresh deadline. Sign in as performer A and Accept. Explain the offer/job/uid-lock transaction, round binding, stored retry result and one-active-job rule. Show concurrent test output rather than claiming a UI double tap proves a race. |
| 1:30–2:45 | Turn on Pause replay. Queue start, arrive (labelled sample coordinates), proof marker and complete. Show four pending SQLite rows; optionally restart the app to demonstrate persistence. Resume replay; show ordered applied states and the released active lock.         |
| 2:45–3:30 | Sign out and sign in as performer B. Its queue does not expose A's rows. Explain uid+session-epoch guards and backend uid matching.                                                                                                                                        |
| 3:30–4:15 | Run `npm run seed`, then `npm run demo:expire`. Sign in as supervisor and run the expiry sweep; sign in as B to see the next round. No two-minute wait is needed.                                                                                                          |
| 4:15–5:00 | Show test results: fee/approval/cross-user denial, size boundary, concurrent accepts, double-tap idempotency, accept-versus-expiry and retained version conflicts. Explain cuts and native validation status honestly.                                                     |

To rerun fulfilment after re-seeding, pause replay and use **Reset this account's local
demo queue**, confirm discard, then resume. This is account-scoped and leaves server state
unchanged. A conflict is preserved and blocks replay; the demo supports explicit discard,
not a production per-action reconciliation editor. To demonstrate a conflict, pause with
an action pending, change the assigned job's `version` in Emulator UI, then resume.

## Delivery limits

Native Android prebuild and both Hermes bundles pass; an APK has not been compiled or
run on a device. App Check, media/background uploads, push, extra auth providers,
biometrics, translations/RTL/Hijri, Maestro and EAS CI are deliberately excluded.
The local dependency audit also has unresolved advisories; see KNOWN_GAPS before any
production use. The complete original assignment is not claimed delivered.
