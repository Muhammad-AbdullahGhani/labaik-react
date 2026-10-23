# Labaik Field implementation plan

## Scope and source of truth

- Assignment: [assignment.md](assignment.md), preserved in [SPEC.md](SPEC.md).
- Execution tracker: [../PROGRESS.md](../PROGRESS.md). Work on its first unchecked task only, in order.
- Current implementation scope: finish Phase 0 and Phase 1, then stop and report status plus the next three tasks.
- Later phases below describe the full assignment roadmap; they do not expand the current stopping point.

## Current starting point

An Expo TypeScript scaffold, Router entry screen, development-client/EAS configuration,
strict TypeScript, ESLint/Prettier, and a route smoke test exist. Dependencies and a lockfile
were installed by the user. Lint, typecheck, formatting, one test, and Android/iOS
JavaScript-only exports passed in the previous restricted session.

Normal Hermes export, native build/launch, and commits have not been verified. Session
permissions have now changed; recheck these capabilities before treating earlier blockers
as resolved. No tracker task is complete yet.

## Execution workflow

For each tracker task:

1. Read progress and relevant assignment requirements; state a brief implementation plan.
2. Implement the smallest correct version, including meaningful tests for its risks.
3. Run lint, strict typecheck, relevant tests, and applicable build checks. Server rules require emulator tests.
4. Append decisions, failure modes and validation evidence to ARCHITECTURE.md. Record cuts in KNOWN_GAPS.md with how to implement them properly.
5. Only after checks pass, tick the task, add a one-line progress note and create one focused commit using feat(scope): message.

Keep secrets out of Git. Use local environment configuration and EAS secrets, with a
committed .env.example. Use a demo Firebase project ID and the Emulator Suite for
development and tests. Never silently fall back to production services.

## Phase 0: setup

| Order | Task                                                     | Verification / exit condition                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Finish the Expo TS scaffold and dev-build configuration  | Recheck installed SDK compatibility; lint, typecheck, formatting, smoke test and normal Hermes export pass. Verify native development build/launch or explicitly record any external prerequisite. Review the real npm audit report and apply compatible fixes based on evidence. |
| 2     | Wire React Native Firebase and emulators                 | Configure native Firebase modules, environment example and firebase.json. Explicit emulator hosts support Android emulator and physical-device development. Confirm emulator connections without production access; document native config and EAS prerequisites.                 |
| 3     | Establish app, src, functions, rules and e2e directories | Clear module boundaries, Functions TypeScript build and shared validation scripts. Avoid introducing unused runtime libraries.                                                                                                                                                    |

## Phase 1: backend correctness first

| Order | Task                                    | Design and verification focus                                                                                                                                                                                                                                                           |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Firestore data model and security rules | Document users, jobs, offers and the per-user active-job lock. Enforce roles, assignment/ownership, immutable financial fields and allowed transitions. Deny access by default. Include emulator coverage with rules changes.                                                           |
| 2     | Dedicated Firestore rules test matrix   | Test performer approval and fee-change denial, cross-user reads, unauthenticated and pending/suspended access, allowed supervisor operations and valid/invalid transitions.                                                                                                             |
| 3     | Storage rules and tests                 | Restrict proofs/{jobId}/{uid}/{step}/{uuid}.mp4 to the assigned performer, video/mp4, at most 60 MB and create-only writes. Test boundaries, unauthorized paths, reads, overwrite and deletion attempts.                                                                                |
| 4     | User creation and supervisor approval   | New accounts become pending. Approval validates the caller and target, sets claims server-side and preserves unrelated claims. Test authorization, retries and partial-failure recovery. Document secure first-supervisor bootstrapping.                                                |
| 5     | Atomic acceptOffer callable             | Transactionally check live offer/version, server expiry, approved performer and the per-user active-job lock. Persist enough acceptance identity for retry idempotency. Test double taps, simultaneous devices, two-job races, expiry races and unauthorized callers against emulators. |
| 6     | Offer dispatch and expiry               | Offer one eligible performer at a time for two minutes, in documented round-robin order. Make trigger retries safe; transactionally guard stale/duplicate expiry work so accepted jobs cannot be reassigned. Test empty pools, wraparound, expiry and accept-versus-expiry contention.  |
| 7     | Server time                             | Provide an authenticated server-time response or equivalent field for countdown calibration; test authorization and timestamp behavior. Document latency and clock-offset handling for the later UI.                                                                                    |

Choose exact document fields and dispatch infrastructure during the corresponding task,
after checking current Firebase APIs. Keep authoritative status, assignment and fee
decisions on the server. Admin SDK operations bypass rules, so callables and triggers
must independently enforce their invariants.

## Phase 1 exit gate

- All Phase 0 and Phase 1 tasks meet their validation requirements and have focused commits.
- Emulator tests demonstrate role isolation, ownership, storage constraints, one-active-job enforcement and race-safe acceptance/expiry.
- Run instructions reproduce the local backend checks without production credentials.
- Architecture decisions and remaining deployment/native prerequisites are explicit; no unverified claim is marked complete.
- Stop and give a short status report, validation results, known gaps and the next three tracker tasks.

## Remaining assignment roadmap

Continue in tracker order after the user resumes work:

| Phase                 | Deliverable                                                                                                                              | Main risks / verification                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2: auth and roles     | Email/password, pending and supervisor approval screens, persistent sessions, suspension handling; remaining sign-in and biometric items | Offline must not imply signed out; test claim refresh, user switching and suspension timing.                                                                                   |
| 3: offers             | Live offer, calibrated countdown, Accept/Decline, clear race outcomes, minimal supervisor job creation                                   | Retry/double-tap behavior and cold/reconnected subscriptions reflect server state.                                                                                             |
| 4: offline fulfilment | Persistent ordered local actions, replay/retry/conflicts, 300 m arrival check                                                            | Unit-test crash recovery, conflict handling, denied/poor location and Android mock-location signals.                                                                           |
| 5: proof video        | Recording, compression, isolated persistent resumable upload queue, thumbnail processing and review                                      | Test account switches, retries, disk/network failures and rejected-step reopening. Background/killed-app continuation requires real native implementations and device testing. |
| 6: push               | FCM device lifecycle, notification actions/deep links and quiet hours                                                                    | Verify killed-state actions, cold starts, token refresh, deduplication and timezone behavior.                                                                                  |
| 7: quality            | Languages/RTL/dates, accessibility/dark mode, crash reporting, App Check, e2e and CI/EAS                                                 | Test real devices and release configuration; emulator success does not prove attestation, APNs or background execution.                                                        |
| 8: documentation      | Architecture, complete known gaps, README and rehearsed demo                                                                             | Maintain continuously; finish reproducible setup, failure scenarios, validation evidence and AI-use explanation.                                                               |

## Time and priority policy

P0 behavior is the demo baseline. Respect tracker dependencies and ordering; a decision to
defer an item must be explicit in the gaps log, never disguised as completion. With a
known deadline, reserve the final roughly 20% for checks, documentation and demo rehearsal.
No deadline has been supplied, so this plan makes no calendar or completion-time promise.
