import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw Error('Emulators required');
initializeApp({ projectId: 'demo-labaik-field' });
async function verify() {
  const db = getFirestore(),
    auth = getAuth();
  assert.equal((await auth.listUsers()).users.length, 4);
  assert.equal((await db.collection('users').get()).size, 4);
  assert.equal((await db.collection('jobs').get()).size, 1);
  assert.equal((await db.collection('offers').get()).size, 1);
  assert.equal((await db.collection('activeJobs').get()).size, 0);
  for (const uid of ['supervisor', 'performer-a', 'performer-b']) {
    assert.equal((await db.doc(`users/${uid}`).get()).data()?.status, 'approved');
    assert.equal(
      (await auth.getUser(uid)).customClaims?.role,
      uid === 'supervisor' ? 'supervisor' : 'performer',
    );
  }
  assert.equal((await db.doc('users/pending').get()).data()?.status, 'pending');
  assert.equal((await auth.getUser('pending')).customClaims?.role, undefined);
  console.log(
    'Seed verified: 1 supervisor, 2 approved performers, 1 pending user, 1 job/offer, no active locks.',
  );
}
verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
