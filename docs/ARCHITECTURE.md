# Architecture

## Decisions

- 2026-10-23: Use the supplied docs/assignment.md verbatim as docs/SPEC.md; retain the original for provenance.
- 2026-10-23: Follow the tracker in order and require successful checks before marking a task complete. Do not manufacture a dependency lockfile or claim a working Expo scaffold without installing and validating dependencies.
- 2026-10-23: Use npm.cmd on Windows because PowerShell execution policy blocks npm.ps1.

## State management

Not implemented. Select and document during the corresponding task.

## Offline and sync

Not implemented. Required: persistent ordered actions, retry and conflict handling, with tests.

## Upload pipeline

Not implemented. Required: persistent per-user queue, resumable uploads and background continuation.

## Failure modes and testing

- npm registry access failed with EACCES when querying Expo. Dependency installation, lint, TypeScript, app builds and Firebase emulator tests have not run. No tracker task is complete.

## How I used AI

- Codex inspected the workspace, located the supplied assignment, created repository instructions and the task tracker, and documented the environment blocker. No runtime implementation has been validated.

## Decisions — Phase 0 scaffold (2026-10-23)

- Prepared a minimal Expo Router entry route, strict TypeScript, ESLint flat config with Prettier compatibility, Jest Expo preset and EAS development-client profile. No authentication or backend code is part of this task.
- Dependency ranges use the official Expo SDK 54 template and bundledNativeModules.json on the sdk-54 branch. This provides an explicit version baseline; installation and compatibility checks remain required before completion.
- Keep native directories generated through Expo prebuild and excluded from Git. Local native builds use expo run:android / expo run:ios; Metro always starts with --dev-client.
- Added a route smoke test to check that the initial screen renders without a Firebase connection. It has not executed yet because dependencies are unavailable.
- Retried npm with a workspace-local cache: EACCES persists and CODEX_SANDBOX_NETWORK_DISABLED is present. The local cache search has not supplied an installable Expo toolchain.

## Validation update after user installation (2026-10-23)

- The user installed dependencies and generated package-lock.json. Lint, strict TypeScript and the route smoke test now pass (1 suite, 1 test).
- Expo's local dependency compatibility check reports dependencies up to date; its offline mode cannot consult current registry metadata.
- Disable Expo telemetry in the restricted session with EXPO_NO_TELEMETRY=1 to avoid writes to the user's home directory. This is a validation environment setting, not an app runtime change.
- Standard Android/iOS export reached Hermes compilation but the sandbox denied execution of hermesc.exe. A normal export and native launch remain required outside this restriction. Git staging also still fails creating .git/index.lock.

- Android and iOS JavaScript-only exports passed with --no-bytecode. This isolates the remaining export failure to sandbox execution of Hermes; it does not verify Hermes bytecode or a native build.

## Reduced-scope implementation (2026-10-23)

The latest explicit request replaces the full roadmap with five tasks and waives native
build gating. This section supersedes earlier environment-blocker notes as checks are rerun.
Only users, jobs, offers and activeJobs collections are used. The seed is restricted to
local Auth/Firestore emulators and creates four deterministic accounts plus one offered job.
Native config uses com.abdullahghani.labaikfield and a gitignored google-services.json or
GOOGLE_SERVICES_JSON EAS file environment variable. Firebase client config identifies the
app/project; it is not an Admin credential and never authorizes access by itself. Rules,
validated server operations and (outside demo scope) App Check provide enforcement.

### How I used AI in this scoped implementation

Codex converts the supplied requirements into small implementation tasks, writes source
and tests, runs validation and records actual evidence. The implementation deliberately
uses explicit transactions and a small queue state machine so the candidate can explain
each invariant. Generated code is checked with real emulators, not trusted by inspection.

### Step 2: access model

Rules require both approved user status and a matching custom role claim. A user may read
their own status document while pending/suspended so the status screen can render; all
workload reads/writes remain denied. Roles/claims and activeJobs are server-owned.
Performers can only read assigned jobs and their own targeted offers. Fees and assignment
cannot be edited by clients. Direct workflow writes only permit accepted->started->arrived;
proof/completion and lock release go through the replay callable. Supervisor final approval
requires complete->approved. Everything else is denied by default.
Storage checks current user status and job assignment via Firestore, validates step/MIME,
requires a new object and permits 1..60 MiB bytes (60*1024*1024 inclusive). Deletes and
updates are denied. Real emulator tests include a 60 MiB payload and one byte over.

### Setup validation evidence

The scoped setup passed lint, root/Functions typecheck, Jest route smoke test and Functions
compilation. Expo public config resolves with RN Firebase plugins and the Android package.
RN Firebase is pinned to 23.5 and Firebase JS tooling to 12.4 to avoid Node-version drift.
The user explicitly waived a native build as a blocker; native execution remains unverified.

### Step 3: data model and atomic acceptance

| Collection | Authoritative fields                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| users      | email, role, status; Auth claims are written only by supervisor callable/admin seed                                                  |
| jobs       | title, fee/currency, location, requiredSteps, version, status, assignedTo, offerId; queue receipts and proof markers added in step 4 |
| offers     | jobId, performerId, status, expiresAt, round, acceptedBy and immutable acceptance result                                             |
| activeJobs | document ID is uid; jobId is created atomically with acceptance and released on completion                                           |

A transaction is required because accepting an offer changes three related documents.
It reads live user status, the offer/job and active-job lock before any writes. Server time
is checked on every retry. A duplicate call by the same accepted performer returns the
stored result, including after the offer's former deadline. Other performers get a clear
taken/not-targeted error. A different offer for the same performer contends on the uid lock.

Expiry and decline use the same offer/job transaction boundary. The sweep rechecks expiry
and assignment inside the transaction, so a stale sweep cannot reassign an accepted job.
Round-robin chooses the next sorted approved performer without an active lock and wraps.
No available performer leaves the offer expired for a future sweep. Decline includes the
round to make old retries harmless. The scheduled function runs every minute; an
emulator-only supervisor callable demonstrates the same sweep because scheduling itself
is not emulated. A production expiry-forwarding delay up to the sweep interval is explicit.

The concurrency tests use actual HTTP callable requests and real emulator transactions.
Two different users race for one targeted offer (only its recipient is eligible); the
stronger contention tests are simultaneous double taps and simultaneous offers competing
for the same uid lock. Accept-versus-expiry tests cover both live and expired boundaries.

Approval is claim-first then status-finalized: cross-service atomicity is unavailable.
Pending status still denies access if a crash occurs after the claim write; retry repairs
it. Current status is checked independently of token claims. The Auth onCreate trigger is
idempotent and never overwrites seeded/approved records.

### Step 4: offline synchronization

ActionQueue stores durable records in SQLite with uid, monotonic sequence, action ID,
job/configuration version, kind/payload, attempts, retry deadline and status. The pure
TypeScript replay engine depends on a tiny async SQL interface; Expo SQLite implements it
on-device, while tests use a real SQLite database through Node's built-in test driver.
A crash during a request leaves the action pending. Its next attempt sends the same ID;
the server's per-job receipt map returns the stored result rather than reapplying effects.

Replay is single-flight and strictly ordered for the active account. A failed, delayed or
conflicted head blocks later work. Transient errors receive exponential backoff with bounded
jitter; permanent errors stop. A changed job version becomes a retained conflict requiring
review. The scope guard checks uid AND session epoch before sending and after awaiting a
response, including A->B->A switches. The callable additionally rejects a payload uid that
does not match the authenticated caller, preventing credential-switch leakage.

applyJobAction independently validates ownership, approval, expected version, active lock,
state transition, arrival bound and proof step. Receipts and state update in one transaction;
completion releases the active-job lock in that transaction. The demo uses a configuration
version that stays stable across workflow actions and changes only when job requirements
change. Receipt reuse with a different normalized payload is rejected. The 32-action map
limit is explicit demo scope, not a scalable receipt retention design.

The shared pure geofence helper lives under functions/src/domain and is re-exported by the
client, so server/client tests use the same math. It checks finite/legal coordinates,
nonnegative accuracy, a mock-location flag and distance+accuracy <=300 m. The demo UI uses
an explicitly labelled sample fix; real permission/location acquisition is outside this
reduced UI scope. No video is captured or uploaded by the proof marker.

## Current scoped architecture and verification

LAN setup correction: Emulator UI must explicitly set host to 0.0.0.0 as well as the
four backend services. The default UI listener was localhost-only; local curl returned
200 on 127.0.0.1:4000 while the Wi-Fi IP refused connection. Updated firebase.json;
the user must restart the running emulator process for the new binding to take effect.

Minimal UI uses React hooks and Expo Router, not an additional state library. Native
Firebase Auth owns persisted identity; a failed token refresh does not mean signed out.
Own-status subscriptions drive pending/suspended views and force claim refresh after
approval. A revision guard ignores stale refresh completions after a newer status event.
Workload subscriptions start only after role credentials match current approved status.

Offers are targeted and bind Accept/Decline to an offer round. Old intent cannot accept a
later reoffered round after a timeout. The countdown calibrates against getServerTime with
an RTT midpoint estimate and then advances using performance.now, not the wall clock;
foreground and periodic recalibration handle reconnect/reopen. The deadline in the server
transaction is authoritative, not the countdown. A client wall-clock change cannot grant
an expired offer. User-facing errors distinguish expired, taken, moved and active-job cases.

The queue adapter opens one Expo SQLite database. React only stores its rendered rows.
The replay loop is single-flight and polls while approved, with persistent retry deadlines.
Pausing replay invalidates the session generation before another queued action can start.
A confirmed, uid-scoped local reset supports repeatable demo/conflict discard; it never
changes server job state. Each re-seed creates a fresh configuration version, preventing
old pending actions from being interpreted as work for a reset demo job.

Android config uses com.abdullahghani.labaikfield and a gitignored local or EAS-injected
Google Services file. A small config plugin permits HTTP solely for emulator builds so
preview APKs can reach local emulators. EAS profiles explicitly choose development/preview
environments and APK/internal distribution. Android prebuild succeeded; generated native
files are excluded from Git, and full APK compilation/device execution is not claimed.

### Verification evidence

- Lint and app/Functions strict typecheck pass.
- Two login UI tests pass; nine queue/SQLite/geofence/error-normalization tests pass.
- Six real Firestore/Storage rules tests pass, including actual size-boundary uploads.
- Eight HTTP/emulator integration tests pass, including true concurrent calls and replay receipts.
- The full demo runner seeds twice, verifies users/claims/job counts, and runs both emulator suites.
- Standard Android and iOS Hermes exports pass. Android prebuild resolves the Firebase plugins,
  package ID, Google Services file and emulator HTTP manifest setting.
- Native APK build and on-device sessions/SQLite/UI remain unverified by explicit scope waiver.

### How I used AI — final handoff

AI generated the implementation and adversarial tests, then exercised actual emulator
requests, SQLite persistence and build tooling. Failures drove concrete fixes: dependency
alignment, a busy local port, a Windows Java/PATH launch issue, callable discovery timeout,
strict test types and stale-round intent. Tests are evidence, not a substitute for the
candidate understanding the transaction reads/writes, stored receipts, epoch guard and
known platform cuts. README supplies a timed demo and the reviewer-facing explanations.

## Extension Phase 1 — supervisor creation and dispatch

createJob validates a normalized title, integer SAR minor units, legal coordinates,
future bounded time window and one-to-five distinct proof labels. A caller-generated
request ID is scoped to the supervisor and hashed into stable job/offer IDs. The same
payload returns the stored creation result; a changed payload with the same ID is rejected.
The job, initial two-minute offer and creator's dispatch cursor commit in one transaction.
The sorted approved-performer pool excludes active-job locks. The cursor is per supervisor;
there is no new system collection or global cursor document. If nobody is free, creation
fails clearly rather than leaving an undispatched job. Performer offer summaries expose
title/fee while full jobs remain assignment-restricted. Rules still deny direct job creation.

Tests now use firebase.test.json and project demo-labaik-tests with high, separate ports.
The user's interactive demo services and EAS build are not stopped or reseeded. Seed helpers
respect test-injected hosts/project ID and still refuse non-demo projects. Test fixture
cleanup only affects the isolated emulator instance.
