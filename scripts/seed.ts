import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? 'demo-labaik-field';
if (!projectId.startsWith('demo-')) throw Error('Only demo projects may be seeded.');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error(
    'Seed requires FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST. Never seeds production.',
  );
}
initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();
const password = 'DemoPass123!'; // Local emulator fixture only, not a production credential.

async function seed() {
  for (const [uid, role, status] of [
    ['supervisor', 'supervisor', 'approved'],
    ['performer-a', 'performer', 'approved'],
    ['performer-b', 'performer', 'approved'],
    ['pending', 'performer', 'pending'],
  ] as const) {
    const email = `${uid}@labaik.test`;
    const existing = await auth.getUser(uid).catch((error: { code?: string }) => {
      if (error.code !== 'auth/user-not-found') throw error;
      return null;
    });
    if (existing) await auth.updateUser(uid, { email, password });
    else await auth.createUser({ uid, email, password });
    await auth.setCustomUserClaims(uid, status === 'approved' ? { role } : {});
    await db.doc(`users/${uid}`).set({ role, status, email });
  }
  // Re-seeding resets demo job, offers and locks; use only on a disposable emulator.
  for (const collection of ['jobs', 'offers', 'activeJobs']) {
    await db.recursiveDelete(db.collection(collection));
  }
  await db.doc('jobs/demo-job').set({
    title: 'Makkah field visit',
    status: 'offered',
    fee: 15000,
    currency: 'SAR',
    location: { latitude: 21.4225, longitude: 39.8262 },
    version: Date.now(),
    assignedTo: null,
    offerId: 'demo-offer',
    requiredSteps: ['proof-1'],
    processedActions: {},
    proofSteps: [],
  });
  await db.doc('offers/demo-offer').set({
    jobId: 'demo-job',
    performerId: 'performer-a',
    status: 'pending',
    expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
    round: 0,
  });
  console.log(
    'Seeded demo-labaik-field. Login: supervisor, performer-a, performer-b, pending @labaik.test / DemoPass123!',
  );
}
seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
