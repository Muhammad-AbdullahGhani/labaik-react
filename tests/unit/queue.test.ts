import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  ActionQueue,
  ReplayEngine,
  ReplayError,
  retryDelay,
  type JobAction,
  type SqlDatabase,
  type AccountScope,
} from '../../src/lib/queue';
import { geofence } from '../../src/lib/geofence';
import { errorReason, errorMessage, replayError } from '../../src/lib/errors';
function connect(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  const adapter: SqlDatabase = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, ...params) {
      return db.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) {
      return db.prepare(sql).all(...params) as T[];
    },
  };
  return { db, queue: new ActionQueue(adapter) };
}
const action = (id: string, kind: JobAction['kind'] = 'start', uid = 'a'): JobAction => ({
  id,
  uid,
  jobId: 'job',
  jobVersion: 1,
  kind,
  payload: {},
});
test('real SQLite persists ordered actions across database close/reopen', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'labaik-queue-')),
    file = join(folder, 'queue.db');
  let instance = connect(file);
  try {
    await instance.queue.init();
    for (const [i, kind] of (['start', 'arrive', 'proof', 'complete'] as const).entries())
      await instance.queue.enqueue(action(`action-${i}`, kind));
    instance.db.close();
    instance = connect(file);
    await instance.queue.init();
    const sent: string[] = [];
    await new ReplayEngine(
      instance.queue,
      () => ({ uid: 'a', epoch: 0 }),
      async (row) => {
        sent.push(row.kind);
      },
    ).replay();
    assert.deepEqual(sent, ['start', 'arrive', 'proof', 'complete']);
    assert.ok((await instance.queue.list('a')).every((row) => row.status === 'applied'));
  } finally {
    instance.db.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + 'labaik-queue-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
test('lost response retries the same action ID and never overtakes a failed head', async () => {
  const { db, queue } = connect();
  await queue.init();
  try {
    await queue.enqueue(action('one'));
    await queue.enqueue(action('two', 'arrive'));
    let now = 100,
      lost = true;
    const receipts = new Set<string>(),
      attempts: string[] = [];
    const engine = new ReplayEngine(
      queue,
      () => ({ uid: 'a', epoch: 0 }),
      async (row) => {
        attempts.push(row.id);
        receipts.add(row.id);
        if (lost) {
          lost = false;
          throw Error('network response lost');
        }
      },
      () => now,
      () => 0.5,
    );
    await engine.replay();
    assert.deepEqual(attempts, ['one']);
    await engine.replay();
    assert.deepEqual(attempts, ['one']);
    now = 1100;
    await engine.replay();
    assert.deepEqual(attempts, ['one', 'one', 'two']);
    assert.equal(receipts.size, 2);
  } finally {
    db.close();
  }
});
test('version conflict preserves action and blocks later actions', async () => {
  const { db, queue } = connect();
  await queue.init();
  try {
    await queue.enqueue(action('one'));
    await queue.enqueue(action('two', 'arrive'));
    const sent: string[] = [];
    await new ReplayEngine(
      queue,
      () => ({ uid: 'a', epoch: 0 }),
      async (row) => {
        sent.push(row.id);
        throw new ReplayError('conflict', 'JOB_VERSION_CHANGED');
      },
    ).replay();
    const rows = await queue.list('a');
    assert.equal(rows[0]?.status, 'conflict');
    assert.equal(rows[1]?.status, 'pending');
    assert.deepEqual(sent, ['one']);
  } finally {
    db.close();
  }
});
test('account guard isolates queues and ignores old in-flight callbacks including switch back', async () => {
  const { db, queue } = connect();
  await queue.init();
  try {
    await queue.enqueue(action('a-action'));
    await queue.enqueue(action('b-action', 'start', 'b'));
    let scope: AccountScope = { uid: 'a', epoch: 1 };
    const sent: JobAction[] = [];
    const engine = new ReplayEngine(
      queue,
      () => scope,
      async (row) => {
        sent.push(row);
        scope = { uid: 'a', epoch: 3 };
      },
    );
    await engine.replay();
    assert.equal((await queue.list('a'))[0]?.status, 'pending');
    scope = { uid: 'b', epoch: 4 };
    await new ReplayEngine(
      queue,
      () => scope,
      async (row) => {
        assert.equal(row.uid, 'b');
        sent.push(row);
      },
    ).replay();
    assert.equal(sent[1]?.id, 'b-action');
    assert.equal((await queue.list('a'))[0]?.status, 'pending');
    await queue.clear('a');
    assert.equal((await queue.list('a')).length, 0);
    assert.equal((await queue.list('b')).length, 1);
  } finally {
    db.close();
  }
});
test('duplicate enqueue is idempotent but payload/account ID reuse is rejected', async () => {
  const { db, queue } = connect();
  await queue.init();
  try {
    await queue.enqueue(action('same'));
    await queue.enqueue(action('same'));
    assert.equal((await queue.list('a')).length, 1);
    await assert.rejects(queue.enqueue(action('same', 'arrive')), /ACTION_ID_REUSED/);
    await assert.rejects(queue.enqueue(action('same', 'start', 'b')), /ACTION_ID_REUSED/);
  } finally {
    db.close();
  }
});
test('permanent failure does not endlessly retry; concurrent replay calls serialize', async () => {
  const { db, queue } = connect();
  await queue.init();
  try {
    await queue.enqueue(action('one'));
    let sends = 0;
    const engine = new ReplayEngine(
      queue,
      () => ({ uid: 'a', epoch: 0 }),
      async () => {
        sends++;
        await Promise.resolve();
        throw new ReplayError('permanent', 'PERMISSION_DENIED');
      },
    );
    await Promise.all([engine.replay(), engine.replay()]);
    await engine.replay();
    assert.equal(sends, 1);
    assert.equal((await queue.list('a'))[0]?.status, 'failed');
  } finally {
    db.close();
  }
});
test('exponential jitter is bounded and grows before cap', () => {
  assert.equal(
    retryDelay(1, () => 0),
    500,
  );
  assert.equal(
    retryDelay(1, () => 1),
    1500,
  );
  assert.equal(
    retryDelay(2, () => 0.5),
    2000,
  );
  assert.equal(
    retryDelay(100, () => 1),
    300000,
  );
});
test('geofence uses distance plus accuracy and rejects invalid/mocked fixes', () => {
  const target = { latitude: 21.4225, longitude: 39.8262 };
  assert.equal(geofence({ ...target, accuracy: 300 }, target).allowed, true);
  assert.equal(geofence({ ...target, accuracy: 301 }, target).allowed, false);
  assert.equal(
    geofence({ latitude: 21.4245, longitude: 39.8262, accuracy: 100 }, target).allowed,
    false,
  );
  assert.equal(
    geofence({ latitude: 21.4245, longitude: 39.8262, accuracy: 20 }, target).allowed,
    true,
  );
  for (const fix of [
    { ...target, accuracy: -1 },
    { ...target, accuracy: NaN },
    { latitude: 100, longitude: 1, accuracy: 1 },
    { ...target, accuracy: 1, mocked: true },
  ])
    assert.equal(geofence(fix, target).allowed, false);
});

test('native wrapped callable messages retain conflict/permanent categories and clear offer feedback', () => {
  const wrapped = {
    code: 'functions/failed-precondition',
    message: '[functions/failed-precondition] JOB_VERSION_CHANGED',
  };
  assert.equal(errorReason(wrapped), 'JOB_VERSION_CHANGED');
  assert.equal(replayError(wrapped).category, 'conflict');
  assert.equal(
    replayError({ code: 'functions/permission-denied', message: 'No access' }).category,
    'permanent',
  );
  assert.equal(replayError(Error('network disconnected')).category, 'transient');
  assert.match(errorMessage({ details: { reason: 'OFFER_ALREADY_TAKEN' } }), /already taken/);
  assert.match(errorMessage({ message: '[functions/deadline-exceeded] OFFER_EXPIRED' }), /expired/);
});
