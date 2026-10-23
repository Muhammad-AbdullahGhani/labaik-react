# 90-minute implementation plan

The latest user scope replaces the earlier full-assignment plan. Stop after step 5.
Use only users, jobs, offers and activeJobs Firestore collections. Work sequentially,
validate each task, update PROGRESS.md and commit it before starting the next.

| Step        | Budget         | Implementation and acceptance evidence                                                                                                                                                                                                                                |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Setup     | 15 min maximum | Expo Router/strict TS, RN Firebase adapters and emulator-only default, Auth/Firestore/Functions/Storage config, deterministic seed, environment example, APK profiles/scripts/config. Lint/typecheck/smoke test. Native build is explicitly not a blocker.            |
| 2 Rules     | 15 min         | Server-owned assignment and fee, guarded status transitions, approved-role and ownership checks, create-only MP4 <=60 MB. Real emulator tests including rejected reads/writes and size boundaries. npm run test:rules.                                                |
| 3 Functions | 25 min         | Auth trigger initializes pending, supervisor approval sets claims, atomic idempotent accept with activeJobs lock, guarded decline/round-robin expiry, server time. Emulator integration tests exercise concurrent requests, double taps and accept/expiry contention. |
| 4 Offline   | 15 min         | Pure TS queue engine plus SQLite adapter, action IDs, ordered replay, version conflicts, jittered backoff and account guard. Geofence distance plus accuracy <=300 m. Unit tests and a protected action-replay callable.                                              |
| 5 UI/docs   | 20 min         | Email login, pending, supervisor approval, offer/countdown/accept/decline and queue status. README setup/seed/tests/APK/demo; architecture and complete cuts log. Final lint/typecheck/tests and JS bundle checks.                                                    |

## Decisions

- Latest explicit instructions waive native build gating and exclude original assignment features listed in KNOWN_GAPS.md. Do not mark those omitted features implemented.
- Accept is online only. Offers are targeted; a nonrecipient concurrent request loses with a clear error. Test real callable concurrency and assignment/lock invariants, never just a mocked transaction.
- All authoritative assignment and review operations run server-side. Rules also constrain any permitted direct workflow transition; Admin SDK code validates its own payloads and authorization.
- Use a minute scheduled sweep plus lazy expiry in accept. The deadline is exact server time; forwarding can lag by the sweep interval. Use an emulator-only manual sweep to demonstrate scheduling locally.
- Store queue receipts inside the job document to respect the four-collection constraint; bound them for the demo and document production retention limitations.
- Offer and queue screens explain the reduced proof action as a demo marker, not an uploaded video.
- Use SQLite durable storage, React state for minimal UI and native Firebase session persistence. No additional global state library needed for these screens.
- Reserve meaningful verification time. Do not use force dependency upgrades or claim native/provider validation from a JavaScript bundle.

## Authorized extension: three sequential implementation phases

The later user request extends the completed five-step scope. Keep the ongoing cloud APK
build untouched; it contains its uploaded source snapshot. Native camera/video modules
require a subsequent development APK. Preserve the user's EAS project link in app.json.

1. Job creation: supervisor form validates title, SAR fee, time window, coordinates and
   one-to-five proof labels. A callable atomically creates the job and first targeted
   offer; a stable request ID prevents duplicate jobs. Dispatch cursor metadata stays in
   the supervisor user document to retain four collections. Emulator tests cover roles,
   validation, retries and initial round-robin selection. Use isolated test services.
2. Video/upload: add SDK-compatible expo-camera, expo-video and FileSystem. Capture up to
   180 seconds with camera selection, timer, preview and retake. Copy accepted recordings
   into account-scoped durable storage and persist upload records in SQLite. Use native
   Firebase Storage foreground transfer progress, persisted retry/backoff and cancellation
   on account changes. Server reserves the attempt/path and verifies finalized metadata
   before recording upload completion. Background/killed-app transfer and compression stay
   explicit gaps. No hidden cloud dependency: emulator or real Firebase config selects target.
3. Review/completion: supervisor securely downloads/previews uploaded attempts and approves
   or rejects with a reason. Only the current attempt can be reviewed. Rejection permits a
   new create-only path. All required proofs must be approved before completion releases
   the active-job lock. Add malicious/stale/unauthorized attempt and lifecycle tests.

Each phase runs lint, typecheck and relevant tests, updates architecture/gaps/progress and
gets its own commit. No production deploy or extra EAS build is launched automatically.
After implementation guide the user through emulator-on-phone or real-cloud setup and rebuild.
