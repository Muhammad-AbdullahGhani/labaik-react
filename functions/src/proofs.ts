import { getApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall } from 'firebase-functions/v2/https';
import { approved, fail, id, identity } from './security';
import { proofPath, validProofSize, MAX_PROOF_DURATION_MS, type ProofRecord } from './domain/proof';
const options = { region: 'us-central1' };
function input(data: unknown) {
  const uid = id(data, 'uid'),
    jobId = id(data, 'jobId'),
    stepId = id(data, 'stepId'),
    attemptId = id(data, 'attemptId');
  const value = data as Record<string, unknown>;
  if (
    typeof value.jobVersion !== 'number' ||
    !Number.isSafeInteger(value.jobVersion) ||
    value.jobVersion < 1
  )
    fail('invalid-argument', 'INVALID_JOB_VERSION');
  return {
    uid,
    jobId,
    stepId,
    attemptId,
    jobVersion: value.jobVersion,
    path: proofPath(jobId, uid, stepId, attemptId),
  };
}
export const beginProofUpload = onCall(options, async (request) => {
  const actor = identity(request, 'performer'),
    data = input(request.data);
  if (actor.uid !== data.uid) fail('permission-denied', 'ACCOUNT_MISMATCH');
  const { size, durationMs } = request.data;
  if (
    !validProofSize(size) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > MAX_PROOF_DURATION_MS
  )
    fail('invalid-argument', 'INVALID_VIDEO');
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    await approved(tx, actor);
    const ref = db.doc(`jobs/${data.jobId}`);
    const job = (await tx.get(ref)).data();
    if (!job || job.assignedTo !== actor.uid) fail('permission-denied', 'JOB_NOT_ASSIGNED');
    if (job.version !== data.jobVersion) fail('failed-precondition', 'JOB_VERSION_CHANGED');
    if (!job.requiredSteps.includes(data.stepId)) fail('invalid-argument', 'INVALID_PROOF_STEP');
    const current = job.proofs?.[data.stepId] as ProofRecord | undefined;
    if (current?.attemptId === data.attemptId) {
      if (
        current.uid !== actor.uid ||
        current.expectedSize !== size ||
        current.durationMs !== durationMs ||
        current.jobVersion !== data.jobVersion
      )
        fail('invalid-argument', 'ACTION_ID_REUSED');
      return current;
    }
    if (!['arrived', 'proof'].includes(job.status))
      fail('failed-precondition', 'ARRIVE_BEFORE_RECORDING');
    const lock = await tx.get(db.doc(`activeJobs/${actor.uid}`));
    if (lock.data()?.jobId !== data.jobId) fail('failed-precondition', 'ACTIVE_JOB_CHANGED');
    if (
      current &&
      current.jobVersion === job.version &&
      !['rejected', 'cancelled'].includes(current.status)
    )
      fail(
        'failed-precondition',
        current.status === 'uploading' ? 'PROOF_UPLOAD_IN_PROGRESS' : 'PROOF_AWAITING_REVIEW',
      );
    const record: ProofRecord = {
      uid: actor.uid,
      attemptId: data.attemptId,
      path: data.path,
      jobVersion: data.jobVersion,
      expectedSize: size,
      durationMs,
      status: 'uploading',
    };
    tx.update(ref, { proofs: { ...job.proofs, [data.stepId]: record } });
    return record;
  });
});
export const cancelProofUpload = onCall(options, async (request) => {
  const actor = identity(request, 'performer'),
    data = input(request.data);
  if (actor.uid !== data.uid) fail('permission-denied', 'ACCOUNT_MISMATCH');
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    await approved(tx, actor);
    const ref = db.doc(`jobs/${data.jobId}`),
      job = (await tx.get(ref)).data();
    if (!job || job.assignedTo !== actor.uid) fail('permission-denied', 'JOB_NOT_ASSIGNED');
    const record = job.proofs?.[data.stepId] as ProofRecord | undefined;
    if (!record || record.attemptId !== data.attemptId) return { cancelled: false };
    if (record.status === 'cancelled') return { cancelled: true };
    if (record.status !== 'uploading') fail('failed-precondition', 'PROOF_AWAITING_REVIEW');
    tx.update(ref, {
      proofs: { ...job.proofs, [data.stepId]: { ...record, status: 'cancelled' } },
    });
    return { cancelled: true };
  });
});
export const finalizeProofUpload = onCall(options, async (request) => {
  const actor = identity(request, 'performer'),
    data = input(request.data);
  if (actor.uid !== data.uid) fail('permission-denied', 'ACCOUNT_MISMATCH');
  const db = getFirestore(),
    ref = db.doc(`jobs/${data.jobId}`);
  const check = async (tx: FirebaseFirestore.Transaction) => {
    await approved(tx, actor);
    const job = (await tx.get(ref)).data();
    if (!job || job.assignedTo !== actor.uid) fail('permission-denied', 'JOB_NOT_ASSIGNED');
    if (job.version !== data.jobVersion) fail('failed-precondition', 'JOB_VERSION_CHANGED');
    const current = job.proofs?.[data.stepId] as ProofRecord | undefined;
    if (
      !current ||
      current.attemptId !== data.attemptId ||
      current.path !== data.path ||
      current.uid !== actor.uid ||
      current.jobVersion !== data.jobVersion
    )
      fail('failed-precondition', 'STALE_PROOF_ATTEMPT');
    return { job, current };
  };
  const initial = await db.runTransaction(check);
  if (initial.current.status !== 'uploading') return initial.current;
  const app = getApp(),
    bucket =
      app.options.storageBucket ??
      `${app.options.projectId ?? process.env.GCLOUD_PROJECT}.appspot.com`;
  let metadata;
  try {
    [metadata] = await getStorage().bucket(bucket).file(data.path).getMetadata();
  } catch (error) {
    if ((error as { code?: number }).code === 404) fail('failed-precondition', 'UPLOAD_NOT_FOUND');
    throw error;
  }
  const size = Number(metadata.size);
  if (
    metadata.contentType !== 'video/mp4' ||
    !validProofSize(size) ||
    size !== initial.current.expectedSize
  )
    fail('failed-precondition', 'INVALID_UPLOADED_VIDEO');
  return db.runTransaction(async (tx) => {
    const { job, current } = await check(tx);
    if (current.status !== 'uploading') return current;
    if (!['arrived', 'proof'].includes(job.status))
      fail('failed-precondition', 'INVALID_TRANSITION');
    const record = {
      ...current,
      status: 'uploaded' as const,
      generation: String(metadata.generation),
      uploadedSize: size,
      uploadedAt: Timestamp.now(),
    };
    const proofSteps = [...new Set<string>([...(job.proofSteps ?? []), data.stepId])];
    tx.update(ref, {
      proofs: { ...job.proofs, [data.stepId]: record },
      proofSteps,
      status: 'proof',
    });
    return record;
  });
});
