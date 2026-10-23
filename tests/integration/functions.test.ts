import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage as adminStorage } from 'firebase-admin/storage';
import { initializeApp as initializeClientApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth as clientAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getStorage as clientStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
} from 'firebase/storage';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw Error('Emulators required');
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-labaik-field' });
const db = getFirestore(),
  auth = getAuth();
const tokens: Record<string, string> = {};
const password = 'DemoPass123!';
const clients = new Map<string, FirebaseApp>();
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-labaik-tests';
async function uploadAs(uid: string, path: string, size = 4, contentType = 'video/mp4') {
  let app = clients.get(uid);
  if (!app) {
    app = initializeClientApp(
      { projectId, apiKey: 'demo-key', storageBucket: `${projectId}.appspot.com` },
      uid,
    );
    clients.set(uid, app);
    const auth = clientAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
      disableWarnings: true,
    });
    await signInWithEmailAndPassword(auth, `${uid}@labaik.test`, password);
    const [host, port] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(':');
    connectStorageEmulator(clientStorage(app), host!, Number(port));
  }
  return uploadBytes(ref(clientStorage(app), path), new Uint8Array(size), { contentType });
}
after(async () => {
  await Promise.all([...clients.values()].map((app) => deleteApp(app)));
});
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
  const payload =
    name === 'acceptOffer' ? { round: 0, ...(data as Record<string, unknown>) } : data;
  const response = await fetch(
    `http://127.0.0.1:15001/${process.env.GCLOUD_PROJECT ?? 'demo-labaik-tests'}/us-central1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(uid ? { Authorization: `Bearer ${tokens[uid]}` } : {}),
      },
      body: JSON.stringify({ data: payload }),
    },
  );
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
    (await call('acceptOffer', 'performer-b', { offerId: 'race-offer', round: 0 })).error?.details
      ?.reason,
    'OFFER_EXPIRED',
  );
  assert.equal(
    (await call('acceptOffer', 'performer-b', { offerId: 'race-offer', round: 1 })).error,
    undefined,
  );
  assert.equal(
    (await call('acceptOffer', 'performer-a', { offerId: 'race-offer', round: 1 })).error?.details
      ?.reason,
    'OFFER_ALREADY_TAKEN',
  );
  const time = (await call('getServerTime', 'performer-a')).result as { serverTime: number };
  assert.ok(Math.abs(time.serverTime - Date.now()) < 5000);
});

// Replay transport is tested against real callable authorization and durable server receipts.
test('ordered replay receipts, version conflict, account guard, geofence and lock release', async () => {
  await call('acceptOffer', 'performer-a', { offerId: 'race-offer' });
  await db.doc('jobs/race-job').update({ location: { latitude: 21.4225, longitude: 39.8262 } });
  const action = (
    id: string,
    kind: string,
    payload: unknown = {},
    jobVersion = 1,
    uid = 'performer-a',
  ) => ({ id, uid, jobId: 'race-job', jobVersion, kind, payload });
  assert.equal(
    (
      await call(
        'applyJobAction',
        'performer-a',
        action('wrong-account', 'start', {}, 1, 'performer-b'),
      )
    ).error?.details?.reason,
    'ACCOUNT_MISMATCH',
  );
  assert.equal(
    (await call('applyJobAction', 'performer-a', action('conflict', 'start', {}, 2))).error?.details
      ?.reason,
    'JOB_VERSION_CHANGED',
  );
  assert.equal(
    (await call('applyJobAction', 'performer-a', action('skip', 'complete'))).error?.details
      ?.reason,
    'INVALID_TRANSITION',
  );
  const first = await call('applyJobAction', 'performer-a', action('start-1', 'start'));
  assert.ok(first.result);
  assert.deepEqual(await call('applyJobAction', 'performer-a', action('start-1', 'start')), first);
  assert.equal(
    (await call('applyJobAction', 'performer-a', action('start-1', 'arrive'))).error?.details
      ?.reason,
    'ACTION_ID_REUSED',
  );
  assert.equal(
    (
      await call(
        'applyJobAction',
        'performer-a',
        action('arrive-bad', 'arrive', { latitude: 0, longitude: 0, accuracy: 1 }),
      )
    ).error?.details?.reason,
    'GEOFENCE_REJECTED',
  );
  assert.ok(
    (
      await call(
        'applyJobAction',
        'performer-a',
        action('arrive-1', 'arrive', { latitude: 21.4225, longitude: 39.8262, accuracy: 10 }),
      )
    ).result,
  );
  assert.equal(
    (await call('applyJobAction', 'performer-a', action('proof-1', 'proof', { stepId: 'proof-1' })))
      .error?.details?.reason,
    'PROOF_VIDEO_REQUIRED',
  );
  const upload = {
    uid: 'performer-a',
    jobId: 'race-job',
    jobVersion: 1,
    stepId: 'proof-1',
    attemptId: 'proof-attempt-1',
  };
  const reservation = await call('beginProofUpload', 'performer-a', {
    ...upload,
    size: 4,
    durationMs: 1000,
  });
  assert.ok(reservation.result);
  await uploadAs('performer-a', (reservation.result as { path: string }).path);
  const finalized = await call('finalizeProofUpload', 'performer-a', upload);
  assert.ok(finalized.result);
  assert.deepEqual(await call('finalizeProofUpload', 'performer-a', upload), finalized);
  const complete = await call('applyJobAction', 'performer-a', action('complete-1', 'complete'));
  assert.ok(complete.result);
  assert.equal((await db.doc('activeJobs/performer-a').get()).exists, false);
  assert.deepEqual(
    await call('applyJobAction', 'performer-a', action('complete-1', 'complete')),
    complete,
  );
  assert.equal((await db.doc('jobs/race-job').get()).data()?.status, 'complete');
});

test('supervisor creates and initially dispatches jobs atomically, idempotently and round-robin', async () => {
  await db.doc('users/supervisor').update({ lastDispatchUid: '' });
  const draft = {
    title: 'Created in app',
    fee: 15000,
    currency: 'SAR',
    location: { latitude: 21.4225, longitude: 39.8262 },
    startsAt: Date.now(),
    endsAt: Date.now() + 3600000,
    proofLabels: ['Show completed work'],
  };
  assert.equal(
    (await call('createJob', 'performer-a', { requestId: 'denied', job: draft })).error?.status,
    'PERMISSION_DENIED',
  );
  assert.equal(
    (await call('createJob', 'supervisor', { requestId: 'invalid', job: { ...draft, fee: 0 } }))
      .error?.status,
    'INVALID_ARGUMENT',
  );
  const [a, b] = await Promise.all([
    call('createJob', 'supervisor', { requestId: 'creation-1', job: draft }),
    call('createJob', 'supervisor', { requestId: 'creation-1', job: draft }),
  ]);
  assert.ok(a.result);
  assert.deepEqual(a, b);
  const created = a.result as { jobId: string; offerId: string; performerId: string };
  const job = (await db.doc(`jobs/${created.jobId}`).get()).data();
  assert.equal(job?.fee, 15000);
  assert.equal(job?.status, 'offered');
  assert.deepEqual(job?.requiredSteps, ['proof-1']);
  const offer = (await db.doc(`offers/${created.offerId}`).get()).data();
  assert.equal(offer?.performerId, created.performerId);
  assert.ok(offer?.expiresAt.toMillis() > Date.now());
  assert.equal(
    (
      await call('createJob', 'supervisor', {
        requestId: 'creation-1',
        job: { ...draft, title: 'Other intent' },
      })
    ).error?.details?.reason,
    'REQUEST_ID_REUSED',
  );
  const next = (await call('createJob', 'supervisor', { requestId: 'creation-2', job: draft }))
    .result as { performerId: string };
  assert.notEqual(next.performerId, created.performerId);
  const eligible = await db
    .collection('users')
    .where('status', '==', 'approved')
    .where('role', '==', 'performer')
    .get();
  for (const user of eligible.docs) await db.doc(`activeJobs/${user.id}`).set({ jobId: 'busy' });
  assert.equal(
    (await call('createJob', 'supervisor', { requestId: 'no-free', job: draft })).error?.details
      ?.reason,
    'NO_AVAILABLE_PERFORMER',
  );
});

test('proof reservation and finalization validate roles, ownership, metadata, stale attempts and cancellation', async () => {
  await call('acceptOffer', 'performer-a', { offerId: 'race-offer' });
  await db.doc('jobs/race-job').update({ status: 'arrived' });
  const data = {
    uid: 'performer-a',
    jobId: 'race-job',
    jobVersion: 1,
    stepId: 'proof-1',
    attemptId: 'first-attempt',
    size: 4,
    durationMs: 1000,
  };
  assert.equal(
    (await call('beginProofUpload', 'performer-b', data)).error?.status,
    'PERMISSION_DENIED',
  );
  assert.equal(
    (await call('beginProofUpload', 'supervisor', data)).error?.status,
    'PERMISSION_DENIED',
  );
  assert.equal(
    (await call('beginProofUpload', 'performer-a', { ...data, size: 60 * 1024 * 1024 + 1 })).error
      ?.details?.reason,
    'INVALID_VIDEO',
  );
  const first = await call('beginProofUpload', 'performer-a', data);
  assert.ok(first.result);
  assert.deepEqual(await call('beginProofUpload', 'performer-a', data), first);
  assert.equal(
    (await call('beginProofUpload', 'performer-a', { ...data, size: 5 })).error?.details?.reason,
    'ACTION_ID_REUSED',
  );
  assert.equal(
    (await call('finalizeProofUpload', 'performer-a', data)).error?.details?.reason,
    'UPLOAD_NOT_FOUND',
  );
  assert.equal(
    (await call('beginProofUpload', 'performer-a', { ...data, attemptId: 'other-attempt' })).error
      ?.details?.reason,
    'PROOF_UPLOAD_IN_PROGRESS',
  );
  assert.equal(
    (await call('cancelProofUpload', 'performer-b', data)).error?.status,
    'PERMISSION_DENIED',
  );
  assert.equal((await call('cancelProofUpload', 'performer-a', data)).error, undefined);
  const replacement = { ...data, attemptId: 'replacement' };
  const reserved = await call('beginProofUpload', 'performer-a', replacement);
  assert.ok(reserved.result);
  assert.equal(
    (await call('finalizeProofUpload', 'performer-a', data)).error?.details?.reason,
    'STALE_PROOF_ATTEMPT',
  );
  const path = (reserved.result as { path: string }).path;
  // Admin bypass is deliberate here: the callable must independently reject bad metadata.
  await adminStorage()
    .bucket(`${projectId}.appspot.com`)
    .file(path)
    .save(Buffer.from([1, 2, 3, 4]), { contentType: 'text/plain' });
  assert.equal(
    (await call('finalizeProofUpload', 'performer-a', replacement)).error?.details?.reason,
    'INVALID_UPLOADED_VIDEO',
  );
});
