export type ActionKind = 'start' | 'arrive' | 'proof' | 'complete';
export type ActionStatus = 'pending' | 'retry' | 'conflict' | 'failed' | 'applied';
export interface JobAction {
  id: string;
  uid: string;
  jobId: string;
  jobVersion: number;
  kind: ActionKind;
  payload: Record<string, unknown>;
}
export interface QueueRow extends JobAction {
  sequence: number;
  status: ActionStatus;
  attempts: number;
  nextAttemptAt: number;
  error: string;
}
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
}
interface StoredRow extends Omit<QueueRow, 'payload'> {
  payload: string;
}
export class ActionQueue {
  constructor(private readonly db: SqlDatabase) {}
  async init() {
    await this.db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS actions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        uid TEXT NOT NULL, jobId TEXT NOT NULL, jobVersion INTEGER NOT NULL,
        kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0, nextAttemptAt INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT ''
      ); CREATE INDEX IF NOT EXISTS actions_uid ON actions(uid, sequence);`);
  }
  async enqueue(action: JobAction) {
    if (
      !action.uid ||
      !action.id ||
      !action.jobId ||
      !Number.isInteger(action.jobVersion) ||
      action.jobVersion < 1
    )
      throw Error('INVALID_ACTION');
    await this.db.runAsync(
      'INSERT OR IGNORE INTO actions (id,uid,jobId,jobVersion,kind,payload) VALUES (?,?,?,?,?,?)',
      action.id,
      action.uid,
      action.jobId,
      action.jobVersion,
      action.kind,
      JSON.stringify(action.payload),
    );
    const existing = await this.db.getAllAsync<StoredRow>(
      'SELECT * FROM actions WHERE id = ?',
      action.id,
    );
    if (existing[0]) {
      const row = existing[0];
      if (
        row.uid !== action.uid ||
        row.jobId !== action.jobId ||
        row.jobVersion !== action.jobVersion ||
        row.kind !== action.kind ||
        row.payload !== JSON.stringify(action.payload)
      )
        throw Error('ACTION_ID_REUSED');
      return;
    }
    throw Error('ACTION_NOT_PERSISTED');
  }
  async list(uid: string): Promise<QueueRow[]> {
    const rows = await this.db.getAllAsync<StoredRow>(
      'SELECT * FROM actions WHERE uid = ? ORDER BY sequence',
      uid,
    );
    return rows.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    }));
  }
  async update(
    row: QueueRow,
    status: ActionStatus,
    attempts = row.attempts,
    nextAttemptAt = 0,
    error = '',
  ) {
    await this.db.runAsync(
      'UPDATE actions SET status = ?, attempts = ?, nextAttemptAt = ?, error = ? WHERE id = ? AND uid = ?',
      status,
      attempts,
      nextAttemptAt,
      error,
      row.id,
      row.uid,
    );
  }
}
export class ReplayError extends Error {
  constructor(
    public readonly category: 'conflict' | 'permanent' | 'transient',
    message: string,
  ) {
    super(message);
  }
}
export interface AccountScope {
  uid: string | null;
  epoch: number;
}
export function retryDelay(attempt: number, random: () => number = Math.random) {
  return Math.min(
    300_000,
    Math.round(1000 * 2 ** Math.min(Math.max(0, attempt - 1), 12) * (0.5 + random())),
  );
}
export class ReplayEngine {
  private running = false;
  constructor(
    private queue: ActionQueue,
    private scope: () => AccountScope,
    private send: (action: JobAction) => Promise<void>,
    private now = Date.now,
    private random = Math.random,
  ) {}
  async replay() {
    if (this.running) return;
    const account = this.scope();
    if (!account.uid) return;
    this.running = true;
    const valid = () => {
      const current = this.scope();
      return current.uid === account.uid && current.epoch === account.epoch;
    };
    try {
      const rows = await this.queue.list(account.uid);
      for (const row of rows) {
        if (!valid()) return;
        if (row.status === 'applied') continue;
        // A blocked head prevents later actions overtaking it, even after a restart.
        if (row.status === 'conflict' || row.status === 'failed' || row.nextAttemptAt > this.now())
          return;
        try {
          if (row.uid !== account.uid) throw new ReplayError('permanent', 'ACCOUNT_MISMATCH');
          await this.send(row);
          if (!valid()) return; // An old account callback must never update current-account state.
          await this.queue.update(row, 'applied');
        } catch (error) {
          if (!valid()) return;
          const category = error instanceof ReplayError ? error.category : 'transient';
          const message = error instanceof Error ? error.message : 'REPLAY_FAILED';
          if (category === 'conflict')
            await this.queue.update(row, 'conflict', row.attempts, 0, message);
          else if (category === 'permanent')
            await this.queue.update(row, 'failed', row.attempts, 0, message);
          else {
            const attempts = row.attempts + 1;
            await this.queue.update(
              row,
              'retry',
              attempts,
              this.now() + retryDelay(attempts, this.random),
              message,
            );
          }
          return;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
