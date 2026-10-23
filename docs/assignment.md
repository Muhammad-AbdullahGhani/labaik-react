Labaik Badal – Advanced React Native Assignment
About the job
Labaik Badal runs two Expo / React Native apps (customer and performer) used in Makkah and Madinah — weak
networks, Arabic/English/Urdu, push notifications, payments and large video uploads. This assignment reflects the
hardest problems in our apps. AI tools (Claude Code, Codex, Cursor, Copilot) are encouraged — we judge your
engineering decisions and whether you can defend every line.
The product: “Labaik Field” – a performer app
Build an Expo (TypeScript, development build — not Expo Go) app on your own Firebase project (Auth, Firestore,
Storage, Cloud Functions, Cloud Messaging, App Check).
1. Authentication & roles
Firebase Auth with email/password + phone OTP. Google and Apple Sign-In (Apple required on iOS).
Custom claims set by a Cloud Function: 
role: performer | supervisor . A new user is 
pending until a
supervisor approves them (approval screen in the app for supervisors).
Session survives restarts; no network ≠ signed out. A disabled/suspended user is forced out within 1 minute
(token refresh + listener).
Biometric unlock (Face ID / fingerprint) to reopen the app after 5 minutes in background.
2. Job offers with real-time race safety
Supervisors create jobs (
jobs/{id} : location, time window, fee, required proof steps).
A Cloud Function offers each job to one performer at a time (round-robin) with a 2-minute expiry; on expiry
it moves to the next performer.
Performer sees the offer live with a countdown based on server time (not the phone clock) and can Accept /
Decline.
Accept must be atomic (Firestore transaction or callable function): if two devices or an expiry happen at the
same moment, only one wins — the loser sees a clear message. Accept must be idempotent (double tap / retry
after timeout = same result).
A performer can hold only one active job.
3. Offline-first fulfilment
The whole job flow (start → arrive → each proof step → complete) works fully offline, queued locally (SQLite /
MMKV, not AsyncStorage for sensitive data) and synced in order when back online, with conflict handling if the
supervisor changed the job meanwhile.
Geofence check: “Arrive” only allowed within 300 m of the job location (handle denied permission, poor
accuracy, mock-location detection on Android).
4. Proof videos – the hard part
Record up to 3 minutes per step in-app (front/back camera, timer, retake).
Compress on device (target ≤ 50 MB for 3 min, 720p) before upload.
Resumable, chunked upload to Firebase Storage that continues in the background and after the app is
killed (iOS background URLSession / Android WorkManager or a foreground service with a notification).
Queue survives restarts, retries with exponential backoff, pauses on mobile data if the user chose “Wi-Fi only”,
handles disk full, never uploads another account’s videos after a user switch.
Storage path 
proofs/{jobId}/{uid}/{step}/{uuid}.mp4 ; Storage rules allow writes only by the assigned
performer, only video/mp4, max 60 MB, and no overwrite of an existing file.
A Cloud Function generates a thumbnail and marks the step “uploaded”; supervisors approve/reject each
video; a rejected step re-opens for re-recording.
5. Push notifications
FCM (+ APNs) with notification categories/actions: “Accept” / “Decline” buttons directly on the offer notification
(works when the app is killed).
Deep link from any notification to the right screen, also on cold start.
Device token lifecycle: saved per user and device, refreshed on token change, removed on sign-out,
deduplicated if the same phone signs into another account.
Quiet hours setting per user, respected by the Cloud Function.
6. Security & integrity
Firestore rules fully enforce roles, ownership and valid status transitions (a performer can’t mark a job approved,
change the fee or read other performers’ jobs). Include rules unit tests with the Firebase Emulator.
App Check (Play Integrity / App Attest) enforced on Firestore, Storage and Functions.
No secrets in the app bundle; explain what the Firebase client config is and isn’t.
7. Quality
English, Arabic and Urdu with full RTL (layout, icons, numbers, dates in Hijri + Gregorian).
Accessibility labels, dynamic font size, dark mode.
Crash reporting (Crashlytics or Sentry) with source maps.
Tests: unit tests for the upload queue and sync logic; at least one end-to-end test (Maestro or Detox) for accept
offer → complete-job.
CI (GitHub Actions): lint, typecheck, tests, Firestore-rules tests on the emulator, and an EAS build for Android
on every push to 
main .
A short architecture document: state management, offline/sync design, upload pipeline, failure modes and how
you tested them, and “How I used AI”.