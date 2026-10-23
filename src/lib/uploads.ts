import type { AccountScope, SqlDatabase } from './queue';
import { retryDelay } from './queue';
import { replayError } from './errors';
export function ownedProofUri(base: string, uid: string, attemptId: string) {
  if (
    !base.endsWith('/') ||
    ![uid, attemptId].every((value) => /^[a-zA-Z0-9_-]{1,128}$/.test(value))
  )
    throw Error('INVALID_LOCAL_PATH');
  return `${base}proofs/${encodeURIComponent(uid)}/${attemptId}.mp4`;
}
export type UploadStatus = 'queued' | 'uploading' | 'retry' | 'uploaded' | 'failed' | 'discarded';
export interface ProofUpload {
  attemptId: string;
  uid: string;
  jobId: string;
  jobVersion: number;
  stepId: string;
  localUri: string;
  size: number;
  durationMs: number;
  status: UploadStatus;
  attempts: number;
  nextAttemptAt: number;
  progress: number;
  error: string;
}
export type NewUpload = Omit<
  ProofUpload,
  'status' | 'attempts' | 'nextAttemptAt' | 'progress' | 'error'
>;
export class UploadQueue {
  constructor(private db: SqlDatabase) {}
  async init() {
    await this.db.execAsync(`CREATE TABLE IF NOT EXISTS proof_uploads (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, attemptId TEXT UNIQUE NOT NULL,
    uid TEXT NOT NULL, jobId TEXT NOT NULL, jobVersion INTEGER NOT NULL, stepId TEXT NOT NULL,
    localUri TEXT NOT NULL, size INTEGER NOT NULL, durationMs INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,
    nextAttemptAt INTEGER NOT NULL DEFAULT 0,progress REAL NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT ''
  ); CREATE INDEX IF NOT EXISTS uploads_uid ON proof_uploads(uid,sequence);`);
  }
  async add(item: NewUpload) {
    await this.db.runAsync(
      'INSERT OR IGNORE INTO proof_uploads (attemptId,uid,jobId,jobVersion,stepId,localUri,size,durationMs) VALUES (?,?,?,?,?,?,?,?)',
      item.attemptId,
      item.uid,
      item.jobId,
      item.jobVersion,
      item.stepId,
      item.localUri,
      item.size,
      item.durationMs,
    );
    const rows = await this.db.getAllAsync<ProofUpload>(
      'SELECT * FROM proof_uploads WHERE attemptId = ?',
      item.attemptId,
    );
    const row = rows[0];
    if (
      !row ||
      row.uid !== item.uid ||
      row.jobId !== item.jobId ||
      row.stepId !== item.stepId ||
      row.jobVersion !== item.jobVersion ||
      row.localUri !== item.localUri ||
      row.size !== item.size ||
      row.durationMs !== item.durationMs
    )
      throw Error('ACTION_ID_REUSED');
  }
  list(uid: string) {
    return this.db.getAllAsync<ProofUpload>(
      'SELECT * FROM proof_uploads WHERE uid = ? ORDER BY sequence',
      uid,
    );
  }
  async state(
    item: ProofUpload,
    status: UploadStatus,
    attempts = item.attempts,
    nextAttemptAt = 0,
    error = '',
  ) {
    await this.db.runAsync(
      'UPDATE proof_uploads SET status = ?, attempts = ?, nextAttemptAt = ?, error = ?, progress = ? WHERE attemptId = ? AND uid = ?',
      status,
      attempts,
      nextAttemptAt,
      error,
      status === 'uploaded' ? 1 : item.progress,
      item.attemptId,
      item.uid,
    );
  }
  async progress(item: ProofUpload, value: number) {
    await this.db.runAsync(
      "UPDATE proof_uploads SET progress = ? WHERE attemptId = ? AND uid = ? AND status = 'uploading'",
      Math.max(0, Math.min(1, value)),
      item.attemptId,
      item.uid,
    );
  }
  async retry(item: ProofUpload) {
    await this.state(item, 'queued', item.attempts);
  }
}
export interface UploadTransfer {
  done: Promise<void>;
  cancel: () => void;
}
export class UploadWorker {
  private running = false;
  private generation = 0;
  private cancel: (() => void) | undefined;
  constructor(
    private queue: UploadQueue,
    private scope: () => AccountScope,
    private transfer: (
      row: ProofUpload,
      isCurrent: () => boolean,
      progress: (value: number) => void,
    ) => UploadTransfer,
    private removeLocal: (row: ProofUpload) => Promise<void>,
    private now = Date.now,
    private random = Math.random,
  ) {}
  stop() {
    this.generation++;
    this.cancel?.();
  }
  async run() {
    if (this.running) return;
    const account = this.scope();
    if (!account.uid) return;
    const generation = this.generation;
    const valid = () => {
      const current = this.scope();
      return (
        current.uid === account.uid &&
        current.epoch === account.epoch &&
        generation === this.generation
      );
    };
    this.running = true;
    try {
      const rows = await this.queue.list(account.uid);
      // One transfer at a time; failed items do not prevent a rejected step's new attempt.
      const row = rows.find(
        (value) =>
          ['queued', 'retry', 'uploading'].includes(value.status) &&
          value.nextAttemptAt <= this.now(),
      );
      if (!row || !valid()) return;
      await this.queue.state(row, 'uploading');
      if (!valid()) return;
      try {
        const task = this.transfer(row, valid, (value) => {
          if (valid()) void this.queue.progress(row, value).catch(() => {});
        });
        this.cancel = task.cancel;
        await task.done;
        if (!valid()) return;
        await this.queue.state(row, 'uploaded');
        // Failure to remove an already-uploaded local file must not re-upload the object.
        await this.removeLocal(row).catch(() => {});
      } catch (error) {
        if (!valid()) return;
        const failure = replayError(error);
        if (failure.category !== 'transient')
          await this.queue.state(row, 'failed', row.attempts, 0, failure.message);
        else {
          const attempts = row.attempts + 1;
          await this.queue.state(
            row,
            'retry',
            attempts,
            this.now() + retryDelay(attempts, this.random),
            failure.message,
          );
        }
      }
    } finally {
      this.cancel = undefined;
      this.running = false;
    }
  }
}
