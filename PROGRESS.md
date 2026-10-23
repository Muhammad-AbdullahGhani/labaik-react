# Progress Tracker — 90-minute scope

Latest user instruction replaces the original phase tracker. Only the following five tasks
are in scope. A box means checks passed and the task is ready for its focused commit.

- [x] 1. Setup: Expo TS/Router, RN Firebase, four emulators, seed, environment and APK configuration
- [x] 2. Firestore and Storage security rules with real emulator tests
- [x] 3. Cloud Functions, atomic accept, round-robin expiry/server time and real concurrency tests
- [x] 4. SQLite-backed offline action queue, replay/retry/conflict/account guard and geofence unit tests
- [x] 5. Minimal auth/approval/offers/countdown/queue UI, architecture, README and demo

## Work notes

- Scope reduced by user to five sequential tasks, roughly 90 minutes. Native builds are not a blocker; exclusions go in docs/KNOWN_GAPS.md.
- Before this run, lint/typecheck/one route smoke test and JS-only bundles passed. No backend or native build was verified. Git writes now work.

- Step 1: RN Firebase 23.5, four emulator configs, seed, environment and APK build configuration added. Lint/typecheck/smoke test/Functions build pass. Native build waived; seed/rule runtime verification follows with downloaded emulators. Setup exceeded 15 minutes because first-time dependency downloads were slow.

- Step 2: Firestore/Storage rules and 6 real emulator tests pass, including 60 MiB and 60 MiB+1 boundaries; lint/typecheck/Jest pass. Firestore uses 8180 because another local service owns 8080.

- Step 3: Auth initialization/approval, idempotent transactional acceptance, lock, guarded decline, lazy/scheduled expiry and server time implemented. Seven real HTTP/emulator tests pass, including double tap, two-performer race, one-performer/two-job race and live/expired accept-versus-sweep. Lint/typecheck/Jest/Functions build pass.

- Step 4: SQLite queue/replay, durable IDs/receipts, bounded jitter, retained conflicts, uid+epoch guard and shared geofence implemented. Eight real-SQLite/unit tests and eight callable emulator tests pass; lint/typecheck/Jest pass. Real GPS acquisition and conflict editor are explicitly cut.

- Step 5: Login/pending/approval, targeted offers with server countdown and round-bound Accept/Decline, SQLite queue controls/status and confirmed account-only reset implemented. README includes APK/setup/test instructions and timed demo; architecture/cuts updated. Lint/typecheck/format, 25 tests, repeatable seed verification, Android prebuild and Android/iOS Hermes export pass. APK/device execution is waived/unverified; 27 audit package entries and all requested cuts are logged.

- LAN follow-up: explicitly bind Emulator UI to 0.0.0.0 after confirming localhost returned 200 but Wi-Fi IP refused. Lint/typecheck and 11 UI/unit tests pass; restart required to verify LAN reachability.

## Frontend demo extension — newly authorized

The user requested these additions after the original five-step scope was delivered.
The in-flight EAS build is left running and app.json's user-created EAS project link is preserved.

- [x] Phase 1: Supervisor job creation form, validated/idempotent callable and initial round-robin dispatch
- [ ] Phase 2: Three-minute video capture/retake/playback and persistent account-scoped foreground Firebase Storage upload/retry
- [ ] Phase 3: Supervisor video approval/rejection, re-recording and approval-gated completion

- Extension Phase 1: supervisor form and transactional idempotent creation/initial dispatch implemented. Lint/typecheck, 13 UI/unit tests, 6 rules tests, 9 HTTP integration tests, seed repeatability and both Hermes exports pass. Tests use isolated high ports/project; user app.json EAS link is not staged.
