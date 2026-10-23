import { openDatabaseAsync } from 'expo-sqlite';
import FileSystem from './files';
import { randomUUID } from 'expo-crypto';
import {
  ref,
  putFile,
  getMetadata,
  type FirebaseStorageTypes,
} from '@react-native-firebase/storage';
import { storage, auth } from './firebase';
import { call } from './api';
import { UploadQueue, ownedProofUri, type ProofUpload, type UploadTransfer } from '../lib/uploads';
import { MAX_PROOF_BYTES, validProofSize, type ProofRecord } from '../lib/proofs';
let database: Promise<UploadQueue> | undefined;
export function getUploadQueue() {
  database ??= openDatabaseAsync('labaik-uploads.db')
    .then(async (db) => {
      const queue = new UploadQueue(db);
      await queue.init();
      return queue;
    })
    .catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
export async function persistRecording(
  uid: string,
  jobId: string,
  jobVersion: number,
  stepId: string,
  uri: string,
  durationMs: number,
) {
  if (auth.currentUser?.uid !== uid) throw Error('ACCOUNT_MISMATCH');
  if (!/\.mp4$/i.test(uri))
    throw Error(
      'This recording is not MP4. Container conversion is not implemented for this device.',
    );
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || !validProofSize(info.size))
    throw Error('Video is missing, empty, or over 60 MiB. Retake a shorter clip.');
  if ((await FileSystem.getFreeDiskStorageAsync()) < info.size + 5 * 1024 * 1024)
    throw Error('Not enough storage to save this recording. Free space and try again.');
  if (!FileSystem.documentDirectory) throw Error('Persistent file storage unavailable.');
  const directory = `${FileSystem.documentDirectory}proofs/${encodeURIComponent(uid)}/`;
  const attemptId = randomUUID(),
    localUri = ownedProofUri(FileSystem.documentDirectory, uid, attemptId),
    temporary = `${directory}${attemptId}.partial.mp4`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  try {
    await FileSystem.copyAsync({ from: uri, to: temporary });
    if (auth.currentUser?.uid !== uid) throw Error('ACCOUNT_MISMATCH');
    await FileSystem.moveAsync({ from: temporary, to: localUri });
    const queue = await getUploadQueue();
    if (auth.currentUser?.uid !== uid) throw Error('ACCOUNT_MISMATCH');
    await queue.add({
      attemptId,
      uid,
      jobId,
      jobVersion,
      stepId,
      localUri,
      size: info.size,
      durationMs: Math.min(180000, Math.max(1, durationMs)),
    });
    return attemptId;
  } catch (error) {
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    throw error;
  }
}
export async function removeUploadedFile(row: ProofUpload) {
  if (
    !FileSystem.documentDirectory ||
    row.localUri !== ownedProofUri(FileSystem.documentDirectory, row.uid, row.attemptId)
  )
    throw Error('INVALID_LOCAL_PATH');
  await FileSystem.deleteAsync(row.localUri, { idempotent: true });
}
export function transferVideo(
  row: ProofUpload,
  isCurrent: () => boolean,
  onProgress: (value: number) => void,
): UploadTransfer {
  let task: FirebaseStorageTypes.Task | undefined,
    cancelled = false;
  const guard = () => {
    if (cancelled || !isCurrent() || auth.currentUser?.uid !== row.uid)
      throw Error('ACCOUNT_MISMATCH');
  };
  const done = (async () => {
    guard();
    if (
      !FileSystem.documentDirectory ||
      row.localUri !== ownedProofUri(FileSystem.documentDirectory, row.uid, row.attemptId)
    )
      throw Error('LOCAL_VIDEO_MISSING_OR_CHANGED');
    const data = {
      uid: row.uid,
      jobId: row.jobId,
      stepId: row.stepId,
      attemptId: row.attemptId,
      jobVersion: row.jobVersion,
    };
    const reservation = await call<ProofRecord>('beginProofUpload', {
      ...data,
      size: row.size,
      durationMs: row.durationMs,
    });
    guard();
    if (reservation.status === 'cancelled') throw Error('STALE_PROOF_ATTEMPT');
    if (reservation.status === 'uploading') {
      const object = ref(storage, reservation.path);
      let exists = false;
      try {
        await getMetadata(object);
        exists = true;
      } catch (error) {
        if ((error as { code?: string }).code !== 'storage/object-not-found') throw error;
      }
      guard();
      if (!exists) {
        const local = await FileSystem.getInfoAsync(row.localUri);
        guard();
        if (
          !local.exists ||
          local.isDirectory ||
          local.size !== row.size ||
          local.size > MAX_PROOF_BYTES
        )
          throw Object.assign(Error('LOCAL_VIDEO_MISSING_OR_CHANGED'), {
            code: 'functions/failed-precondition',
            details: { reason: 'LOCAL_VIDEO_MISSING_OR_CHANGED' },
          });
        task = putFile(object, row.localUri, { contentType: 'video/mp4' });
        const unsubscribe = task.on('state_changed', (snapshot) =>
          onProgress(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
        );
        try {
          await task;
        } finally {
          unsubscribe();
        }
      }
      guard();
      await call('finalizeProofUpload', data);
      guard();
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      void task?.cancel().catch(() => {});
    },
  };
}
