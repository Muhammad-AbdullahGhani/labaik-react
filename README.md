# Labaik Field — emulator demo

Expo development-build app; Expo Go is not supported. Scope and implementation order:
[docs/PLAN.md](docs/PLAN.md). Deliberate exclusions: [docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md).

## Setup

Node 22+, Java 21+ for emulators, npm and an Android emulator/device for the native app.

```sh
npm install
cp .env.example .env
npm run emulators
```

In another terminal: `npm run seed`. This resets demo jobs/offers/locks. Open emulator UI
at http://localhost:4000. Demo logins use password `DemoPass123!`:
`supervisor@labaik.test`, `performer-a@labaik.test`, `performer-b@labaik.test`, `pending@labaik.test`.
Keep emulators running while using the app. Re-seed to reset the two-minute offer deadline.
Ports: Auth 9099, Firestore 8180, Functions 5001, Storage 9199. These are local demo
services; binding to 0.0.0.0 enables a phone on the same trusted LAN. Do not expose them publicly.
On Windows use npm.cmd/npx.cmd and Copy-Item .env.example .env if PowerShell blocks scripts.

## Android APK build and install

1. For this emulator demo run `npm run config:demo` to create a gitignored, nonproduction
   google-services.json for project demo-labaik-field and package com.abdullahghani.labaikfield.
   It refuses to overwrite an existing config. Its dummy API key works only against emulators.
2. For a real Firebase backend instead, register Android app `com.abdullahghani.labaikfield`
   and use its downloaded google-services.json (gitignored). That is outside this emulator
   demo: the app/CLI project IDs must match. Never commit the file.
3. Run `npx eas-cli login` then `npx eas-cli init` to configure your own EAS project.
4. For cloud builds, create an EAS file environment variable named GOOGLE_SERVICES_JSON
   containing the config. app.config.ts accepts its injected file path. Set
   EXPO_PUBLIC_USE_EMULATORS=true and EXPO_PUBLIC_EMULATOR_HOST to the computer's LAN IP
   in the build environment; these public values are embedded at build time.
5. `npm run build:apk:dev` builds an internal development-client APK; install the downloaded
   APK with `adb install -r path/to/app.apk`, then `npm start` for Metro.
6. `npm run build:apk:preview` builds an internal APK with bundled JavaScript. Install it
   with adb or the EAS download link; Metro is not required.

Development and preview use APK output with internal distribution. Development sets
`developmentClient: true`. Local alternative: `npm run android` with Android SDK installed.
No native build is a scope blocker, and no APK has been device-validated yet. Firebase
project config is public identification metadata, not an Admin secret; service-account
keys must never be bundled. Emulator config/seed cannot write to a production project.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run functions:build
npm run test:rules
npm run test:integration
npm run build:check
```

The emulator test scripts start isolated demo services themselves; stop the interactive
emulator session before running those scripts to avoid port collisions. Native build
verification is separate from TypeScript/Jest and JavaScript exports.

## Five-minute demo

1. Start emulators and seed immediately before demo; show four users and one offer in UI.
2. Login as pending; show approval waiting. Login supervisor and approve pending.
3. Login performer A, show server-calibrated countdown, Accept twice safely. Explain the
   transaction and activeJobs lock. Performer B cannot take A's job; show race-test output.
4. Open queue screen; pause replay, enqueue start/arrive/proof/complete; resume and show
   ordered acknowledgements. The proof marker is simulated; no video upload is implemented.
5. Re-seed; show expired offer rejection/round-robin sweep and security/concurrency tests.
   Explain account isolation, conflict state and the deliberate scope cuts.
