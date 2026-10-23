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
