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

Normal Hermes export and native build/launch have not been verified. Git access now works:
the initial plan was committed as a7ade42. Recheck network and native build capabilities
before treating earlier blockers as resolved. No tracker task is complete yet.

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

## Full assignment implementation design

The following is the implementation blueprint for all remaining work, including the P1
items required by the original assignment. Priority labels determine delivery sequence;
they do not remove assignment requirements. This document is a plan, not evidence that
any feature is already implemented. The existing Phase 1 reporting checkpoint remains.

### Application structure and ownership

| Area                 | Responsibility                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| app/                 | Expo Router route groups for public auth, pending users, performer jobs and supervisor tools. Route guards derive from the session service. |
| src/features/auth    | Sign-in methods, approval state, account switching and biometric gate.                                                                      |
| src/features/offers  | Offer subscriptions, calibrated expiry display and safe action handling.                                                                    |
| src/features/jobs    | Job details, fulfilment state machine, arrival checks and supervisor job creation.                                                          |
| src/features/proofs  | Recording, compression, upload/review UI and rejected-step recovery.                                                                        |
| src/services         | Firebase adapters, notifications, connectivity, native upload bridge and sync coordinator.                                                  |
| src/store            | Zustand state for session view, transient UI and queue summaries; never the sole source for durable work.                                   |
| src/lib              | Validated domain types, state transitions, time/distance helpers and SQLite repositories/migrations.                                        |
| src/i18n             | Translation resources and locale/date/number formatting.                                                                                    |
| functions/           | Auth lifecycle, protected callables, dispatch, expiry, proof processing and notification delivery.                                          |
| rules/, tests/, e2e/ | Emulator security tests, unit/integration tests and Maestro flows.                                                                          |
| modules/             | Local Expo native module for upload continuation when existing supported adapters do not meet persistence requirements.                     |

Use Firestore for authoritative shared state, SQLite for durable local actions/upload
records, and Zustand for in-memory presentation. Start without React Query; introduce it
only if request caching needs justify another cache alongside Firestore. Validate callable
payloads with Zod and revalidate on the server. Use explicit domain errors mapped to
translated user messages; do not expose raw server errors or tokens in UI/logs.

### Proposed authoritative data model

Finalize field names in the first backend task and document indexes with the queries.
Store money as integer minor units plus currency; store timestamps in UTC, and retain
an IANA timezone where local scheduling matters.

| Document                        | Key fields / purpose                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| users/{uid}                     | Approval status pending/approved/suspended, role, preferred locale, quiet-hours preferences, claims synchronization version and timestamps. No client role/status edits. |
| jobs/{jobId}                    | Creator, location, time window, fee/currency, required proof IDs, assigned performer, current offer identity, status, configuration version and workflow revision.       |
| offers/{offerId}                | Job, recipient, sequence/version, expiresAt, state and accepted/declined timestamps. Only supervisor and recipient can read it.                                          |
| activeJobs/{uid}                | One server-owned lock pointing to the performer's active job; written with assignment in the same transaction.                                                           |
| jobs/{jobId}/steps/{stepId}     | Step definition, attempt identity, status, accepted upload object/generation, review outcome and rejection reason.                                                       |
| jobs/{jobId}/actions/{actionId} | Idempotency receipt: actor, payload fingerprint, result and applied revision. Reusing an ID with a different payload fails.                                              |
| proofAttempts/{attemptId}       | Reserved object path, owner/job/step, current attempt state and verified upload/processing metadata.                                                                     |
| devices/{installationId}        | Server-controlled user binding, FCM token and last-refresh time; callable registration handles account reassignment and deduplication.                                   |
| dispatchState/{poolId}          | Round-robin cursor and dispatch coordination metadata.                                                                                                                   |
| notificationOutbox/{eventId}    | Delivery attempt state for retryable sends; minimal retention and no client access.                                                                                      |

Avoid placing private supervisor notes or other performers' information in a document
readable by the assigned performer: Firestore reads expose the entire document. Match
queries to rule constraints; security rules are not filters. Reserve full job reads for
the assigned performer/supervisor and expose a minimal offer summary to its recipient.
Protect internal locks, receipts and cursors from direct client writes.

### Job lifecycle and concurrency rules

Proposed lifecycle: available -> offered -> accepted -> started -> arrived ->
proofs_pending -> completed -> approved. Cancellation is a guarded supervisor action.
Proof steps move through pending -> recorded locally -> uploading -> processing ->
uploaded -> approved/rejected; rejection creates a new attempt rather than overwriting.

- All assignment, fee, approval and lock changes are server-owned. Firestore rules deny direct writes to those fields even when a client submits a plausible state.
- Online offer acceptance requires server confirmation; it is never queued as an offline success.
- The acceptance transaction reads the user status, offer, job and active-job lock before writing. Offer expiry is checked using current server time inside each transaction attempt. A repeated accepted offer returns its receipt after verifying ownership.
- Acceptance and expiry contend on the same job/offer documents. Stale expiry work checks offer identity and version before doing anything. No acceptance path can assign two active jobs to one performer.
- Dispatch selects an approved eligible performer using a persisted cursor. Initial dispatch and advancement are idempotent. An outbox/reconciliation mechanism repairs a transaction committed before expiry scheduling succeeds.
- Prefer a scheduled sweep for the initial emulator-friendly implementation: it advances only already-expired offers, so actual advancement may lag the two-minute deadline by the sweep interval. If strict expiry-time delivery is needed, add Cloud Tasks with the same transaction guard; log any scheduling-latency gap.
- Fulfilment uses an applyJobAction callable with action IDs and expected configuration/workflow versions. Invalid or conflicting transitions fail explicitly; a client cannot approve a job by replaying an action.
- Release the active-job lock in the same server transaction that leaves the defined active lifecycle. Initially retain it until all required proof steps are approved and the job is finalized; document this product decision so a pending review cannot accidentally create two active jobs.

### Authentication, approval and suspension

Implement email/password first, then phone OTP, Google and Apple. Use native Firebase
Auth persistence rather than storing credentials in Zustand or SQLite. Configure provider
credentials, Android certificate fingerprints and Apple capabilities outside source control.
Test account linking/conflicting-provider errors instead of silently creating duplicate users.

New-account initialization is retry-safe and never overwrites an existing approved record.
A trusted operator bootstraps the first supervisor through a documented admin script.
Supervisor approval checks current server-side caller status as well as claims, then uses
a recoverable claims-sync workflow: Auth claims and Firestore cannot commit atomically.
Only expose approval as complete once claims synchronization succeeds; retries reconcile it.

Model session states explicitly: initializing, signed out, pending, approved, suspended,
offline cached and locally locked. A transient network/token-refresh failure does not
clear a valid session. Subscribe to the user's status and refresh credentials on a cadence
short enough to meet a one-minute suspension target while the client is online and running.
Server rules and callables check current status independently of stale role claims.

On suspension, stop sync/uploads and clear access to cached sensitive UI. Token revocation
and account disablement supplement the status change. Immediate remote suspension cannot
be discovered on a disconnected or OS-suspended device; document that boundary and enforce
it on reconnect. See [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions).

After five minutes in background, lock the UI before showing job details. Use
expo-local-authentication, handle unavailable enrollment/cancellation, and provide a
reauthentication fallback. The local privacy gate does not replace backend authorization.

### Offer and supervisor screens

Build sign-in/signup, pending approval, performer offer/home, job details, job flow,
proof recorder/upload status, settings, supervisor pending users, create-job and proof
review routes. Supervisor lists need loading, empty, error and permission-loss states.

Calibrate countdowns with a server-time request using request midpoint and monotonic
elapsed time. Refresh calibration on foreground/reconnect; the countdown is informational
and the server decides expiry. Disable duplicate submits in the UI while retaining server
idempotency. Translate expired, already accepted, reassigned and already-active-job results.
Decline is a guarded callable that advances only its current offer and safely tolerates retry.

Supervisor job creation validates coordinates, future time windows, currency/fee and
nonempty proof definitions. Job changes increment the configuration version so offline
actions can detect changed requirements or cancellation.

### Offline database and ordered synchronization

Use expo-sqlite with schema migrations and account-scoped repositories. Keep durable
actions and materialized local job state in one SQLite transaction. Persist each action's
ID, uid, job ID, sequence, expected configuration version, dependencies, payload, attempt
count, next retry time and pending/in-flight/applied/conflicted/failed status.

1. Read the last acknowledged job and apply pending local actions for the offline UI.
2. Before accepting a local action, validate the local state machine and persist it atomically.
3. A single coordinator replays actions in order per job when connectivity and the active account permit it. Recover abandoned in-flight leases after a crash.
4. Send the original action ID on every retry. A server receipt prevents duplicate effects if a response was lost after commit.
5. Retry transient failures using exponential backoff with jitter. Authorization, cancellation and validation failures require intervention; do not retry them forever.
6. On version conflicts, fetch current server state, retain the local action as conflicted and explain what changed. Never silently drop proof or overwrite supervisor changes.
7. Job completion can be requested offline, but server finalization waits for required upload and approval dependencies. Show local completion pending sync separately from authoritative completion.

On sign-out/account switch, cancel listeners and workers and advance an account-generation
guard before opening the next account's repositories. Retain old-account work privately
for later reauthentication; never replay it as the new user. Avoid tokens in SQLite. If
local data needs stronger protection, use platform-supported encrypted storage/database
configuration with keys protected by Keychain/Keystore; document backup behavior.

For arrival, request a fresh location, check its age and accuracy, calculate geodesic
distance, and require a defensible bound within 300 m (for example distance plus reported
accuracy <= 300 m). Show retry/settings paths for denied access, low accuracy and stale
fixes. Reject reported Android mocked locations. Persist evidence with the action and
revalidate it server-side against the relevant job location version. Device location
signals are not tamper-proof; record that limitation.

### Recording and on-device compression

Use expo-camera for a maximum 180-second recording, front/back selection before recording,
a visible timer, cancellation and retake. Handle permissions, interruptions, low storage,
recording errors and leaving the screen. Move accepted recordings into account-scoped
durable app storage before marking a queue item ready; a cache file alone is insufficient.

Use a maintained native compression adapter compatible with the selected Expo SDK, verified
in a development build before adoption. Target 720p MP4/H.264 with an audio/video bitrate
budget for <=50 MB over three minutes. Measure actual output dimensions, duration, MIME
and size. If still too large, retry at a lower bitrate or explain the failure; enforce
the 60 MB server limit independently. Clean obsolete temporary files only after durable
queue state makes it safe; keep an original until usable compressed output exists.

### Durable resumable uploads and native continuation

An in-memory Firebase putFile task alone is not the persistence design. Persist uid,
job/step/attempt IDs, local path, unique object path, size/hash, transfer state, retry
schedule and native task/session identifiers. Store sensitive resumable-session material
in protected account-scoped storage, never logs. Reserve a unique attempt before upload;
never reuse an object name after a retake or rejection.

First prove an authenticated resumable transport on both platforms that preserves Storage
rules and App Check. Prefer the Firebase Storage upload protocol/native SDK where supported.
Do not substitute an Admin/signed upload endpoint that bypasses the specified Storage rules.
If an adapter cannot persist sessions or attach required credentials, implement the small
native bridge and integration tests before claiming background support.

- Android: persist transfer work through WorkManager and use foreground execution with the required visible notification for long transfers; reconnect to an upload session rather than restarting blindly. Recheck current OS restrictions during implementation.
- iOS: use file-based background URLSession tasks, durable identifiers and delegate restoration. Prove chunk/session reconciliation with the chosen transport; refresh expired authentication safely and reconcile completion on relaunch.
- Wi-Fi-only: configure native transfer network constraints and recheck before starting/resuming. Expose waiting-for-Wi-Fi separately from failure.
- Account changes: stop scheduled and in-flight work, clear that account's accessible session credentials and prevent completion callbacks from mutating the new account's state. A chunk already in flight may finish; no new chunks may start for the wrong account.
- Recovery: query acknowledged offset/server object state after interruption, verify final metadata/hash and reconcile the SQLite queue after a lost completion callback.
- Disk full/missing files: retain a recoverable failed item and offer retake; do not report success. Bound worker concurrency and clean files only after confirmed processing or explicit discard.

Test restart, process death, airplane mode, Wi-Fi/mobile transitions, token expiry, expired
sessions, low disk and user switching. Distinguish OS process termination from explicit
force-stop. On iOS, user force-quit cancels background transfers and prevents automatic
relaunch; resume on the next user launch rather than promising impossible continuation.
See [Apple's background session contract](<https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)>).
Android Firebase documents [persisting upload session URIs](https://firebase.google.com/docs/storage/android/upload-files).

### Proof processing and review

Trigger processing on finalized proof objects. Verify reserved attempt, path, uploader,
job assignment, current step and actual file metadata; treat client MIME as insufficient
proof of valid video. Process idempotently by object generation and attempt ID. Use a
bounded ffmpeg/ffprobe worker with packaged binaries and strict resource/time limits;
use a Cloud Run worker if Functions runtime limits require it, recording that decision.

Write thumbnails to a separate server-owned path, then transactionally mark the matching
attempt uploaded. A delayed old upload must never replace the current attempt. Retry
transient failures and expose processing failures; create cleanup/reconciliation paths for
orphaned uploads. Do not publish permanent bearer download URLs for private proofs.

Supervisor review uses a protected callable tied to attempt identity/version, with an
audit timestamp and rejection reason. Rejection reopens the step and invalidates queued
completion until a new attempt is approved. Preserve review history; delete old objects
only under a documented retention policy.

### Push lifecycle, actions and deep links

Register an installation ID and FCM token through a callable; upsert on login/refresh,
remove or unbind on sign-out, and transactionally transfer duplicate tokens when accounts
change. Handle invalid token responses on the backend. Configure APNs and native action
categories, with Android background handlers and iOS notification action delegates.

Notification payloads contain minimal routing IDs, never trusted authorization. Route
cold starts only after session hydration and authorization; stale or other-user links
show a safe explanatory state. Accept/Decline actions call the same idempotent backend
operations as the app. Persist a small native action intent when execution must await
authentication/connectivity; never display acceptance until the backend confirms it.

Quiet hours use the user's IANA timezone and support overnight intervals and DST. Suppress
offer pushes during quiet hours and choose a documented in-app-only or dispatch-eligibility
policy; do not deliver an expired offer after quiet hours end. Test OS killed state on
both platforms and document user force-stop restrictions separately.

### Internationalization, accessibility and integrity

Introduce i18next English/Arabic/Urdu resource keys when each screen is added, then finish
the translation/RTL audit in Phase 7. Use start/end layout properties, intentional icon
mirroring and correct mixed-direction text. Format money, numbers, Gregorian and Hijri
dates using validated platform Intl support or an explicit tested fallback.

Use shared light/dark tokens, readable touch targets, screen-reader labels and scalable
text; test VoiceOver/TalkBack, large fonts, RTL and dark mode on actual screens. Add Sentry
or Crashlytics with source maps/native symbols, environment tags and redaction of personal
data, coordinates, tokens and proof paths.

Initialize App Check providers for debug development and Play Integrity/App Attest release
builds. Roll out enforcement on Firestore, Storage and every client callable after release
tokens are proven; keep debug exceptions isolated from production. Test missing/invalid
attestation and do not infer production attestation from emulator results. Explain that
Firebase client configuration identifies a project; it is not an Admin credential.

### Test matrix and build automation

| Layer                      | Required evidence                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit tests          | Time calibration, distance/accuracy thresholds, transitions, ordered replay, retry/backoff, conflict outcomes, queue migrations and account isolation.                                                    |
| Emulator rules tests       | Both allowed and denied roles, ownership, transitions, financial immutability, private reads, upload MIME/size boundaries, create-only objects and suspension.                                            |
| Emulator integration tests | Auth initialization/claims recovery, real concurrent transaction races, dispatch retries, expiry contention, action receipts and proof-attempt reconciliation.                                            |
| Native device tests        | Every auth provider, biometrics, 3-minute compression output, process-death/background transfers, Wi-Fi constraints, notification actions/cold start, accessibility and App Check.                        |
| Maestro e2e                | Seed isolated users/job; accept -> start -> arrive with controlled location -> record/provide proof -> upload/review -> complete. Exercise an offline/reconnect segment and assert server completion.     |
| CI                         | Lockfile install, format/lint, app and Functions typecheck/build, unit tests, emulator suite and artifacts. An authenticated EAS Android build runs on main with secrets restricted to trusted workflows. |

Use deterministic emulator seeds, isolated test project IDs and cleanup so runs do not
depend on ordering. Use barriers/multiple clients for races rather than only sequential
mock assertions. Separate device-required checks from emulator CI; publish actual results
and outstanding platform gaps. Native transfer implementations require their own tests,
not just the TypeScript queue suite.

### External setup and deployment handoff

Continue emulator work without production credentials. Request each external prerequisite
only when its integration is ready to validate:

| Prerequisite                                                  | Needed for                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Firebase project, region and appropriate billing              | Deployed Functions/Storage and any Tasks/worker services; verify current service requirements before deployment. |
| Android app registration and certificate fingerprints         | Native Firebase config, Google/phone auth, Play Integrity and Android release validation.                        |
| Apple developer access, APNs credentials and app identifiers  | Apple sign-in, iOS push, App Attest and signed device builds.                                                    |
| EAS project/build credentials                                 | Reproducible signed builds and CI build integration.                                                             |
| Android device plus iPhone/macOS or suitable iOS build access | Real background behavior, provider sign-in and notification verification.                                        |
| CI repository/secrets and crash-reporting project             | Automated builds, source maps and diagnostic validation.                                                         |

Before deployment, review rules/indexes, function regions, IAM, secrets, retention and
attestation; run staging smoke tests and a signed-device checklist. Production publishing
is a separate concrete deployment step after implementation and validation, not implied
by writing this plan.

### Whole-assignment completion and demo

Completion means every original assignment requirement is either implemented and verified
or explicitly identified as an unresolved gap; logging a missing feature does not fulfill
that requirement. Keep a requirement-to-test evidence table in the final docs.

The rehearsed demo will show signup -> pending -> supervisor approval -> live offer ->
race-safe accept -> offline start/arrive/proof capture -> reconnect/upload -> supervisor
rejection and retake -> approval and completion. Separate short demonstrations cover
biometric relock, Arabic/Urdu RTL, push cold start, account-switch isolation and native
upload recovery. Include two-device acceptance and security-test output for reviewer probes.

README will include clean checkout setup, emulator seeds, provider/native configuration,
test commands, EAS builds and that demo script. ARCHITECTURE will explain state, sync,
upload transport, invariants, failures, tradeoffs and AI use. KNOWN_GAPS will distinguish
unimplemented work, unverified behavior and unavoidable platform limits with concrete
remediation. Finish with a final check run and an honest delivery report.
