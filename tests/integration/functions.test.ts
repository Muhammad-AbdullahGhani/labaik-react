import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw Error('Emulators required');
initializeApp({ projectId: 'demo-labaik-field' });
const db = getFirestore(),
  auth = getAuth();
const tokens: Record<string, string> = {};
const password = 'DemoPass123!';
async function signIn(uid: string) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${uid}@labaik.test`, password, returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { idToken?: string };
  assert.ok(body.idToken);
  return body.idToken;
}
async function call(name: string, uid: string | null, data: unknown = {}) {
  const response = await fetch(`http://127.0.0.1:5001/demo-labaik-field/us-central1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(uid ? { Authorization: `Bearer ${tokens[uid]}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await response.json()) as {
    result?: unknown;
    error?: { status: string; message: string; details?: { reason: string } };
  };
  return body;
}
async function offered(jobId = 'race-job', offerId = 'race-offer', ttl = 120000) {
  await db.doc(`jobs/${jobId}`).set({
    title: 'Test job',
    status: 'offered',
    assignedTo: null,
    fee: 100,
    version: 1,
    offerId,
    requiredSteps: ['proof-1'],
    processedActions: {},
    proofSteps: [],
  });
  await db.doc(`offers/${offerId}`).set({
    jobId,
    performerId: 'performer-a',
    status: 'pending',
    round: 0,
    expiresAt: Timestamp.fromMillis(Date.now() + ttl),
  });
}
before(async () => {
  for (const [uid, role, status] of [
    ['supervisor', 'supervisor', 'approved'],
    ['performer-a', 'performer', 'approved'],
    ['performer-b', 'performer', 'approved'],
    ['pending', 'performer', 'pending'],
    ['suspended', 'performer', 'suspended'],
  ] as const) {
    await auth.createUser({ uid, email: `${uid}@labaik.test`, password }).catch(async () => {
      await auth.updateUser(uid, { password });
    });
    await auth.setCustomUserClaims(uid, status === 'pending' ? {} : { role });
    await db.doc(`users/${uid}`).set({ role, status, email: `${uid}@labaik.test` });
    tokens[uid] = await signIn(uid);
  }
});
beforeEach(async () => {
  for (const collection of ['jobs', 'offers', 'activeJobs'])
    await db.recursiveDelete(db.collection(collection));
  await offered();
});
test('onCreate creates pending account; only supervisor can approve and claims are set', async () => {
  const uid = 'new-user';
  await auth.createUser({ uid, email: `${uid}@labaik.test`, password });
  let user;
  for (let i = 0; i < 100; i++) {
    user = (await db.doc(`users/${uid}`).get()).data();
    if (user) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(user?.status, 'pending');
  assert.equal(
    (await call('approveUser', 'performer-a', { uid })).error?.status,
    'PERMISSION_DENIED',
  );
  assert.equal((await call('approveUser', 'supervisor', { uid })).error, undefined);
  assert.equal((await auth.getUser(uid)).customClaims?.role, 'performer');
  assert.equal((await db.doc(`users/${uid}`).get()).data()?.status, 'approved');
  assert.equal((await call('approveUser', 'supervisor', { uid })).error, undefined);
});
test('REAL concurrent different-performer calls: only target wins and owns the only lock', async () => {
  const outcomes = await Promise.all(
    ['performer-a', 'performer-b'].map((uid) =>
      call('acceptOffer', uid, { offerId: 'race-offer' }),
    ),
  );
  assert.equal(outcomes.filter((value) => value.result).length, 1);
  assert.equal(outcomes.filter((value) => value.error).length, 1);
  assert.equal((await db.doc('jobs/race-job').get()).data()?.assignedTo, 'performer-a');
  assert.equal((await db.collection('activeJobs').get()).size, 1);
});
test('REAL concurrent double tap returns identical results; retry after timeout is stable', async () => {
  const [first, second] = await Promise.all([
    call('acceptOffer', 'performer-a', { offerId: 'race-offer' }),
    call('acceptOffer', 'performer-a', { offerId: 'race-offer' }),
  ]);
  assert.ok(first.result);
  assert.deepEqual(first, second);
  assert.deepEqual(await call('acceptOffer', 'performer-a', { offerId: 'race-offer' }), first);
});
test('REAL concurrent two-job acceptance by one performer allows only one active job', async () => {
  await offered('other-job', 'other-offer');
  const results = await Promise.all(
    ['race-offer', 'other-offer'].map((offerId) => call('acceptOffer', 'performer-a', { offerId })),
  );
  assert.equal(results.filter((value) => value.result).length, 1);
  assert.equal(
    results.find((value) => value.error)?.error?.details?.reason,
    'ALREADY_HAS_ACTIVE_JOB',
  );
  assert.equal(
    (await db.collection('jobs').where('assignedTo', '==', 'performer-a').get()).size,
    1,
  );
});
test('expired accept vs sweep launched together cannot assign expired offer or recreate a lock', async () => {
  await db.doc('offers/race-offer').update({ expiresAt: Timestamp.fromMillis(Date.now()) });
  const [accept, expiry] = await Promise.all([
    call('acceptOffer', 'performer-a', { offerId: 'race-offer' }),
    call('runExpirySweep', 'supervisor'),
  ]);
  assert.ok(accept.error);
  assert.equal(expiry.error, undefined);
  assert.ok(['OFFER_EXPIRED', 'OFFER_NOT_YOURS'].includes(accept.error.details?.reason ?? ''));
  assert.equal((await db.doc('jobs/race-job').get()).data()?.assignedTo, null);
  assert.equal((await db.collection('activeJobs').get()).size, 0);
  assert.equal((await db.doc('offers/race-offer').get()).data()?.performerId, 'performer-b');
});
test('live accept vs sweep launched together preserves accepted assignment', async () => {
  const [accept] = await Promise.all([
    call('acceptOffer', 'performer-a', { offerId: 'race-offer' }),
    call('runExpirySweep', 'supervisor'),
  ]);
  assert.ok(accept.result);
  assert.equal((await db.doc('offers/race-offer').get()).data()?.status, 'accepted');
});
test('expired and taken errors, pending/suspended denial, decline idempotency and server time', async () => {
  assert.equal((await call('getServerTime', null)).error?.status, 'UNAUTHENTICATED');
  for (const uid of ['pending', 'suspended'])
    assert.equal(
      (await call('acceptOffer', uid, { offerId: 'race-offer' })).error?.status,
      'PERMISSION_DENIED',
    );
  await db.doc('offers/race-offer').update({ expiresAt: Timestamp.fromMillis(Date.now() - 100) });
  assert.equal(
    (await call('acceptOffer', 'performer-a', { offerId: 'race-offer' })).error?.details?.reason,
    'OFFER_EXPIRED',
  );
  await offered();
  assert.equal(
    (await call('declineOffer', 'performer-a', { offerId: 'race-offer', round: 0 })).error,
    undefined,
  );
  const after = (await db.doc('offers/race-offer').get()).data();
  await call('declineOffer', 'performer-a', { offerId: 'race-offer', round: 0 });
  assert.equal((await db.doc('offers/race-offer').get()).data()?.round, after?.round);
  assert.equal(
    (await call('acceptOffer', 'performer-b', { offerId: 'race-offer' })).error,
    undefined,
  );
  assert.equal(
    (await call('acceptOffer', 'performer-a', { offerId: 'race-offer' })).error?.details?.reason,
    'OFFER_ALREADY_TAKEN',
  );
  const time = (await call('getServerTime', 'performer-a')).result as { serverTime: number };
  assert.ok(Math.abs(time.serverTime - Date.now()) < 5000);
});
