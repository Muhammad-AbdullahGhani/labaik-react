# Labaik Field – Agent Rules

You are building the "Labaik Field" Expo (TypeScript, dev build, NOT Expo Go) performer app
on Firebase (Auth, Firestore, Storage, Functions, FCM, App Check). Spec lives in /docs/SPEC.md.

## Working rules

1. ALWAYS read /PROGRESS.md first. Work on the first unchecked task only, in order.
2. After finishing a task: run lint + typecheck + relevant tests, then tick the box in
   /PROGRESS.md, add a one-line note (what was done, what was cut), and commit
   (`feat(scope): msg`). Never tick a box if tests/typecheck fail.
3. Keep /docs/ARCHITECTURE.md updated as you go (state mgmt, offline/sync, upload pipeline,
   failure modes + how tested, "How I used AI"). Append, don't rewrite.
4. Log every shortcut or skipped requirement in /docs/KNOWN_GAPS.md with "how I would do it".
5. Small commits, one task per commit. No secrets in repo; use .env + EAS secrets; commit .env.example.
6. Prefer boring, well-known libs: expo-router, zustand, @tanstack/react-query (optional),
   react-native-mmkv, expo-sqlite, react-native-firebase (@react-native-firebase/*),
   expo-camera, expo-location, expo-local-authentication, i18next, zod.
7. Every server-side rule (Firestore/Storage) must have an emulator test.
8. Time is limited: if a task will take too long, implement the minimal correct version,
   log the gap, and move on. Never leave the app in a non-building state.

## Definition of done per task

Builds, typechecks, lints, tests pass, PROGRESS.md updated, committed.
