# Known gaps — deliberately reduced scope

The latest 90-minute scope excludes the following. None is claimed implemented.

| Cut                                                             | How I would implement it                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native build/device validation                                  | Supply Firebase native config, build a development APK with EAS, install on a real Android device and validate native auth/Firestore/SQLite. iOS needs macOS/signing and its Firebase plist. JS tests do not replace this.                                                                   |
| Video recording/compression/background uploads/thumbnail/review | expo-camera up to 180 seconds; native 720p compression; durable per-user SQLite upload queue; Firebase resumable sessions bridged to WorkManager/foreground service and background URLSession; idempotent thumbnail processing and attempt-versioned review. Explicit iOS force-quit limits. |
| Push and notification actions                                   | RN Firebase Messaging plus APNs categories/native actions; token registration/deduplication; authenticated idempotent accept/decline, cold-start route hydration and timezone-aware quiet hours.                                                                                             |
| Phone/Google/Apple auth                                         | Enable providers, configure SHA fingerprints/Apple capabilities, add native provider flows and account-linking tests.                                                                                                                                                                        |
| Biometrics                                                      | expo-local-authentication after five minutes background, enrollment/cancel/fallback tests.                                                                                                                                                                                                   |
| i18n/RTL/Hijri                                                  | i18next en/ar/ur, logical layout properties, mirrored icons and tested Gregorian/Hijri date/number formatting.                                                                                                                                                                               |
| App Check enforcement                                           | Initialize debug and release attestation providers, validate on devices, enforce on Firestore/Storage/callables and isolate debug credentials.                                                                                                                                               |
| Maestro e2e                                                     | Seed fixtures and exercise accept through offline replay and completion with real native UI/device state.                                                                                                                                                                                    |
| EAS CI                                                          | GitHub Actions lint/typecheck/unit/emulator checks plus authenticated Android EAS build on main; protected build credentials. Manual APK profiles/scripts are included.                                                                                                                      |
| Suspension within one minute while offline                      | Server rejects suspended users immediately on requests; UI listens to status. A disconnected client cannot discover remote suspension. Add periodic online token refresh and revocation checks, with documented OS/background limits.                                                        |
| Crash reporting, accessibility/dark-mode audit                  | Add Sentry/Crashlytics with redaction and source maps; test TalkBack/VoiceOver, dynamic type and themes on real devices. Basic labels only in demo.                                                                                                                                          |
| Supervisor create-job UI                                        | Seed supplies one job. Add validated form and server create callable with audit metadata.                                                                                                                                                                                                    |
| Full proof fulfilment                                           | Queue proof action is a demo marker, not evidence of uploaded/approved video. Add upload dependencies and supervisor review before production completion.                                                                                                                                    |

## Demo-specific tradeoffs

- Scheduled sweep advances expired offers on its next invocation; deadline enforcement inside accept is exact, but forwarding can lag by up to a sweep interval. How I would implement stricter delivery: Cloud Tasks plus the same transaction/version guard and reconciliation.
- Keep only users/jobs/offers/activeJobs collections per scope. Job action receipts live in a bounded map, suitable for this demo. How I would scale it: separate receipt documents and retention/compaction with conflict-safe acknowledgement.
- Native package builds are possible through configuration, but no APK is claimed built until a real build succeeds. google-services.json is always gitignored; user/EAS file environment supplies it.

- Offline conflict handling detects, preserves and blocks actions; no conflict-resolution editor is included. How I would implement it: compare supervisor changes, let the performer discard or regenerate affected actions with new IDs after reviewing the refreshed job, and retain an audit trail.
- Queue geofence demo uses labelled sample coordinates rather than device GPS. How I would implement it: expo-location permission/freshness/accuracy flows and platform mock-location signals, then send captured evidence to the existing shared bound check.
- Queue metadata is stored in sandboxed SQLite without an added encryption layer; credentials never enter it. How I would implement stronger local protection: SQLCipher-capable builds and device-protected encryption keys, with per-user backup/retention policies.

## Final validation boundaries

- Android prebuild and normal Android/iOS Hermes exports now pass. Full APK compilation,
  EAS credentials/signing and real device execution are still unverified. How I would
  finish it: supply the documented EAS file variable, build/install both profiles and test
  native Auth, Firestore, SQLite and LAN access on an Android device.
- The demo supports confirmed discard of an entire account's local queue after review;
  a production per-action reconciliation editor remains cut. Fresh seed versions prevent
  old pending actions applying to a reset job. How I would improve it: offer selective
  discard/rebase against an acknowledged server revision and an auditable receipt history.
- `npm audit --omit=dev` reports **27 vulnerable package entries: 12 moderate and 15 high**,
  not 27 distinct exploit proofs. Expo CLI tooling and Firebase dependency chains contribute
  propagated entries; npm proposes breaking SDK changes/downgrades. No force fix was applied
  within this fixed scope. How I would resolve it: review individual advisories, upgrade
  Expo/RN Firebase/Node together on a compatible supported baseline, apply compatible
  targeted patches, then repeat emulator tests and native build/device checks before release.
- Android prebuild warns that automatic system theme integration needs expo-system-ui.
  Dark-mode/a11y audit is cut; the demo content uses a light palette. How I would finish it:
  add the SDK-compatible system UI module and explicit light/dark design tokens with device tests.
- API/UI native execution has not been rehearsed on a device. Automated proof is backend,
  pure TS/SQLite, login component tests and bundle/prebuild validation only. How I would
  close this: run the README five-minute script on the signed development APK and retain logs.

## Extension decisions (supersede matching original cuts as phases complete)

- Phase 1 adds supervisor job creation and initial dispatch, replacing that earlier cut.
  Dispatch cursor fairness is per supervisor. How I would make it project-global: use a
  dedicated transactional dispatch-state document and test competing supervisors; this
  extension preserves the four-collection constraint instead.
- If all performers have active locks, the form explains that no performer is available.
  How I would queue unoffered jobs: persist an available state and have a reconciling
  dispatcher offer them when a performer becomes free.
