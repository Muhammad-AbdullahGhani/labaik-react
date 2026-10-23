import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Transaction } from 'firebase-admin/firestore';
import {
  onCall,
  HttpsError,
  type CallableRequest,
  type FunctionsErrorCode,
} from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as v1 from 'firebase-functions/v1';
import { createHash } from 'node:crypto';
import { geofence } from './domain/geofence';

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const options = { region: 'us-central1' };

function fail(code: FunctionsErrorCode, reason: string): never {
  throw new HttpsError(code, reason, { reason });
}
function id(data: unknown, field: string): string {
  const value =
    data && typeof data === 'object' ? (data as Record<string, unknown>)[field] : undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    fail('invalid-argument', 'INVALID_' + field);
  return value;
}
function identity(request: CallableRequest<unknown>, role?: string) {
  if (!request.auth) fail('unauthenticated', 'SIGN_IN_REQUIRED');
  if (role && request.auth.token.role !== role) fail('permission-denied', 'ROLE_REQUIRED');
  return { uid: request.auth.uid, role: request.auth.token.role as unknown };
}
async function approved(tx: Transaction, actor: { uid: string; role: unknown }) {
  const user = (await tx.get(db.doc(`users/${actor.uid}`))).data();
  if (user?.status !== 'approved' || user.role !== actor.role)
    fail('permission-denied', 'USER_NOT_APPROVED');
}

export const onUserCreate = v1.auth.user().onCreate(async (user) => {
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${user.uid}`);
    if (!(await tx.get(ref)).exists)
      tx.create(ref, { email: user.email ?? '', role: 'performer', status: 'pending' });
  });
});

export const approveUser = onCall(options, async (request) => {
  const actor = identity(request, 'supervisor');
  const uid = id(request.data, 'uid');
  await db.runTransaction(async (tx) => {
    await approved(tx, actor);
    const target = (await tx.get(db.doc(`users/${uid}`))).data();
    if (!target || target.role !== 'performer' || !['pending', 'approved'].includes(target.status))
      fail('failed-precondition', 'NOT_PENDING_PERFORMER');
  });
  // Auth and Firestore cannot commit together. Claim-first is safe because pending status
  // still denies access. A retry repairs a crash between these two operations.
  const user = await adminAuth.getUser(uid);
  await adminAuth.setCustomUserClaims(uid, { ...user.customClaims, role: 'performer' });
  await db.runTransaction(async (tx) => {
    await approved(tx, actor);
    const ref = db.doc(`users/${uid}`);
    const current = (await tx.get(ref)).data();
    if (
      !current ||
      current.role !== 'performer' ||
      !['pending', 'approved'].includes(current.status)
    )
      fail('failed-precondition', 'NOT_PENDING_PERFORMER');
    tx.update(ref, { status: 'approved' });
  });
  return { uid, status: 'approved' };
});

export const acceptOffer = onCall(options, async (request) => {
  const actor = identity(request, 'performer');
  const offerId = id(request.data, 'offerId');
  const round = request.data.round;
  if (!Number.isInteger(round) || round < 0) fail('invalid-argument', 'ROUND_REQUIRED');
  return db.runTransaction(async (tx) => {
    await approved(tx, actor);
    const offerRef = db.doc(`offers/${offerId}`);
    const offer = (await tx.get(offerRef)).data();
    if (!offer) fail('not-found', 'OFFER_NOT_FOUND');
    const jobRef = db.doc(`jobs/${offer.jobId}`);
    const lockRef = db.doc(`activeJobs/${actor.uid}`);
    const [jobSnap, lockSnap] = await Promise.all([tx.get(jobRef), tx.get(lockRef)]);
    const job = jobSnap.data();
    if (!job) fail('not-found', 'JOB_NOT_FOUND');
    if (offer.round !== round) fail('deadline-exceeded', 'OFFER_EXPIRED');
    if (offer.status === 'accepted' && offer.acceptedBy === actor.uid) return offer.result;
    if (offer.status === 'accepted' || job.assignedTo)
      fail('already-exists', 'OFFER_ALREADY_TAKEN');
    if (offer.status !== 'pending' || offer.expiresAt.toMillis() <= Date.now())
      fail('deadline-exceeded', 'OFFER_EXPIRED');
    if (offer.performerId !== actor.uid) fail('permission-denied', 'OFFER_NOT_YOURS');
    if (job.status !== 'offered' || job.offerId !== offerId)
      fail('already-exists', 'OFFER_ALREADY_TAKEN');
    if (lockSnap.exists) fail('failed-precondition', 'ALREADY_HAS_ACTIVE_JOB');
    const result = { offerId, jobId: offer.jobId as string, performerId: actor.uid };
    tx.update(offerRef, {
      status: 'accepted',
      acceptedBy: actor.uid,
      result,
      acceptedAt: Timestamp.now(),
    });
    tx.update(jobRef, { status: 'accepted', assignedTo: actor.uid });
    tx.create(lockRef, { jobId: offer.jobId });
    return result;
  });
});

async function advanceOffer(
  offerId: string,
  declineActor?: { uid: string; role: unknown },
  round?: number,
) {
  return db.runTransaction(async (tx) => {
    if (declineActor) await approved(tx, declineActor);
    const ref = db.doc(`offers/${offerId}`);
    const offer = (await tx.get(ref)).data();
    if (!offer || offer.status === 'accepted') return { moved: false };
    if (declineActor && (offer.performerId !== declineActor.uid || offer.round !== round))
      return { moved: false };
    if (!declineActor && offer.expiresAt.toMillis() > Date.now()) return { moved: false };
    const jobRef = db.doc(`jobs/${offer.jobId}`);
    const job = (await tx.get(jobRef)).data();
    if (!job || job.assignedTo || job.status !== 'offered' || job.offerId !== offerId)
      return { moved: false };
    const users = await tx.get(
      db.collection('users').where('role', '==', 'performer').where('status', '==', 'approved'),
    );
    const candidates = users.docs.map((user) => user.id).sort();
    const locks = await Promise.all(candidates.map((uid) => tx.get(db.doc(`activeJobs/${uid}`))));
    const free = candidates.filter((_, index) => !locks[index]?.exists);
    const next = free.find((uid) => uid > offer.performerId) ?? free[0];
    if (!next) {
      tx.update(ref, { status: 'expired', expiresAt: Timestamp.fromMillis(Date.now() + 60_000) });
      return { moved: false };
    }
    tx.update(ref, {
      performerId: next,
      status: 'pending',
      round: (offer.round ?? 0) + 1,
      expiresAt: Timestamp.fromMillis(Date.now() + 120_000),
    });
    // Touch the job too: accept and expiry have the same transaction contention boundary.
    tx.update(jobRef, { offerRound: (offer.round ?? 0) + 1 });
    return { moved: true, performerId: next };
  });
}

export const declineOffer = onCall(options, async (request) => {
  const actor = identity(request, 'performer');
  const offerId = id(request.data, 'offerId');
  const round = request.data?.round;
  if (!Number.isInteger(round) || round < 0) fail('invalid-argument', 'ROUND_REQUIRED');
  return advanceOffer(offerId, actor, round);
});

async function sweep() {
  const expired = await db
    .collection('offers')
    .where('status', 'in', ['pending', 'expired'])
    .where('expiresAt', '<=', Timestamp.now())
    .limit(100)
    .get();
  let moved = 0;
  for (const offer of expired.docs) if ((await advanceOffer(offer.id)).moved) moved++;
  return { moved };
}
export const expireOffers = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1' },
  async () => {
    await sweep();
  },
);
export const runExpirySweep = onCall(options, async (request) => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') fail('permission-denied', 'EMULATOR_ONLY');
  const actor = identity(request, 'supervisor');
  await db.runTransaction((tx) => approved(tx, actor));
  return sweep();
});
export const getServerTime = onCall(options, async (request) => {
  const actor = identity(request);
  await db.runTransaction((tx) => approved(tx, actor));
  return { serverTime: Date.now() };
});

export const applyJobAction = onCall(options, async (request) => {
  const actor = identity(request, 'performer');
  const actionId = id(request.data, 'id');
  const uid = id(request.data, 'uid');
  const jobId = id(request.data, 'jobId');
  if (uid !== actor.uid) fail('permission-denied', 'ACCOUNT_MISMATCH');
  const { kind, jobVersion } = request.data;
  if (
    !['start', 'arrive', 'proof', 'complete'].includes(kind) ||
    !Number.isInteger(jobVersion) ||
    jobVersion < 1
  )
    fail('invalid-argument', 'INVALID_ACTION');
  const input = request.data.payload ?? {};
  const payload =
    kind === 'arrive'
      ? {
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy,
          mocked: input.mocked === true,
        }
      : kind === 'proof'
        ? { stepId: input.stepId }
        : {};
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ uid, jobId, kind, jobVersion, payload }))
    .digest('hex');
  return db.runTransaction(async (tx) => {
    await approved(tx, actor);
    const ref = db.doc(`jobs/${jobId}`);
    const lockRef = db.doc(`activeJobs/${uid}`);
    const [snapshot, lock] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
    const job = snapshot.data();
    if (!job || job.assignedTo !== uid) fail('permission-denied', 'JOB_NOT_ASSIGNED');
    const receipts = job.processedActions ?? {};
    const existing = receipts[actionId];
    if (existing) {
      if (existing.fingerprint !== fingerprint) fail('invalid-argument', 'ACTION_ID_REUSED');
      return existing.result;
    }
    if (job.version !== jobVersion) fail('failed-precondition', 'JOB_VERSION_CHANGED');
    if (lock.data()?.jobId !== jobId) fail('failed-precondition', 'ACTIVE_JOB_CHANGED');
    if (Object.keys(receipts).length >= 32) fail('resource-exhausted', 'ACTION_RECEIPT_LIMIT');
    const requiredState: Record<string, string[]> = {
      start: ['accepted'],
      arrive: ['started'],
      proof: ['arrived', 'proof'],
      complete: ['proof'],
    };
    if (!requiredState[kind]?.includes(job.status))
      fail('failed-precondition', 'INVALID_TRANSITION');
    if (
      kind === 'arrive' &&
      !geofence(
        payload as { latitude: number; longitude: number; accuracy: number; mocked: boolean },
        job.location ?? { latitude: NaN, longitude: NaN },
      ).allowed
    )
      fail('failed-precondition', 'GEOFENCE_REJECTED');
    const proofSteps: string[] = job.proofSteps ?? [];
    if (kind === 'proof') {
      if (typeof input.stepId !== 'string' || !job.requiredSteps.includes(input.stepId))
        fail('invalid-argument', 'INVALID_PROOF_STEP');
      if (!proofSteps.includes(input.stepId)) proofSteps.push(input.stepId);
    }
    if (
      kind === 'complete' &&
      !job.requiredSteps.every((step: string) => proofSteps.includes(step))
    )
      fail('failed-precondition', 'PROOF_STEPS_MISSING');
    const statuses: Record<string, string> = {
      start: 'started',
      arrive: 'arrived',
      proof: 'proof',
      complete: 'complete',
    };
    const result = { id: actionId, status: statuses[kind], jobVersion: job.version };
    tx.update(ref, {
      status: result.status,
      proofSteps,
      processedActions: { ...receipts, [actionId]: { fingerprint, result } },
    });
    if (kind === 'complete') tx.delete(lockRef);
    return result;
  });
});
