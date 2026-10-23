# Progress Tracker — 90-minute scope

Latest user instruction replaces the original phase tracker. Only the following five tasks
are in scope. A box means checks passed and the task is ready for its focused commit.

- [x] 1. Setup: Expo TS/Router, RN Firebase, four emulators, seed, environment and APK configuration
- [x] 2. Firestore and Storage security rules with real emulator tests
- [ ] 3. Cloud Functions, atomic accept, round-robin expiry/server time and real concurrency tests
- [ ] 4. SQLite-backed offline action queue, replay/retry/conflict/account guard and geofence unit tests
- [ ] 5. Minimal auth/approval/offers/countdown/queue UI, architecture, README and demo

## Work notes

- Scope reduced by user to five sequential tasks, roughly 90 minutes. Native builds are not a blocker; exclusions go in docs/KNOWN_GAPS.md.
- Before this run, lint/typecheck/one route smoke test and JS-only bundles passed. No backend or native build was verified. Git writes now work.

- Step 1: RN Firebase 23.5, four emulator configs, seed, environment and APK build configuration added. Lint/typecheck/smoke test/Functions build pass. Native build waived; seed/rule runtime verification follows with downloaded emulators. Setup exceeded 15 minutes because first-time dependency downloads were slow.

- Step 2: Firestore/Storage rules and 6 real emulator tests pass, including 60 MiB and 60 MiB+1 boundaries; lint/typecheck/Jest pass. Firestore uses 8180 because another local service owns 8080.
