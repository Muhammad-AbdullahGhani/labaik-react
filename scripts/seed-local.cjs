const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8180',
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? 'demo-labaik-field',
  },
});
process.exitCode = result.status ?? 1;
