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
