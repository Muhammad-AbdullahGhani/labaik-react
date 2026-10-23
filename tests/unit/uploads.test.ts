import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { UploadQueue, UploadWorker, ownedProofUri, type NewUpload } from '../../src/lib/uploads';
import type { AccountScope, SqlDatabase } from '../../src/lib/queue';
import { proofPath, validProofSize, MAX_PROOF_BYTES } from '../../src/lib/proofs';
function open(file = ':memory:') {
  const db = new DatabaseSync(file);
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
  return { db, queue: new UploadQueue(adapter) };
}
const item = (attemptId: string, uid = 'a'): NewUpload => ({
  attemptId,
  uid,
  jobId: 'job',
  jobVersion: 1,
  stepId: 'proof-1',
  localUri: ownedProofUri('file:///data/', uid, attemptId),
  size: 4,
  durationMs: 1000,
});
test('upload records survive a real SQLite restart and acknowledge a completed remote transfer without rewriting it', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'labaik-uploads-'));
  let store = open(join(folder, 'uploads.db'));
  try {
    await store.queue.init();
    await store.queue.add(item('one'));
    store.db.close();
    store = open(join(folder, 'uploads.db'));
    await store.queue.init();
    let now = 0,
      writes = 0,
      calls = 0,
      cleaned = 0;
    const remote = new Set<string>();
    const worker = new UploadWorker(
      store.queue,
      () => ({ uid: 'a', epoch: 0 }),
      (row) => ({
        cancel() {},
        done: (async () => {
          calls++;
          if (!remote.has(row.attemptId)) {
            remote.add(row.attemptId);
            writes++;
            throw Error('response lost');
          }
        })(),
      }),
      async () => {
        cleaned++;
      },
      () => now,
      () => 0.5,
    );
    await worker.run();
    assert.equal((await store.queue.list('a'))[0]?.status, 'retry');
    assert.equal(cleaned, 0);
    await worker.run();
    assert.equal(calls, 1);
    now = 1000;
    await worker.run();
    assert.equal(writes, 1);
    assert.equal(cleaned, 1);
    assert.equal((await store.queue.list('a'))[0]?.status, 'uploaded');
    await worker.run();
    assert.equal(calls, 2);
  } finally {
    store.db.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + 'labaik-uploads-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
test('account switch cancels transfer and cannot acknowledge old-user work as a new user', async () => {
  const { db, queue } = open();
  await queue.init();
  try {
    await queue.add(item('a-one'));
    await queue.add(item('b-one', 'b'));
    let scope: AccountScope = { uid: 'a', epoch: 1 },
      cancelled = 0;
    const sent: string[] = [];
    let finish!: () => void;
    const worker = new UploadWorker(
      queue,
      () => scope,
      (row) => {
        sent.push(row.uid);
        return {
          cancel() {
            cancelled++;
            finish();
          },
          done: new Promise<void>((resolve) => {
            finish = resolve;
          }),
        };
      },
      async () => {},
    );
    const pending = worker.run();
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
    scope = { uid: 'b', epoch: 2 };
    worker.stop();
    await pending;
    assert.equal(cancelled, 1);
    assert.equal((await queue.list('a'))[0]?.status, 'uploading');
    await new UploadWorker(
      queue,
      () => scope,
      (row) => ({
        cancel() {},
        done: (async () => {
          assert.equal(row.uid, 'b');
          sent.push(row.uid);
        })(),
      }),
      async () => {},
    ).run();
    assert.deepEqual(sent, ['a', 'b']);
    assert.equal((await queue.list('a'))[0]?.status, 'uploading');
    assert.equal((await queue.list('b'))[0]?.status, 'uploaded');
  } finally {
    db.close();
  }
});
test('permanent errors retain the file and explicit retry preserves attempt identity', async () => {
  const { db, queue } = open();
  await queue.init();
  try {
    await queue.add(item('same'));
    await queue.add(item('same'));
    await assert.rejects(queue.add({ ...item('same'), size: 5 }), /ACTION_ID_REUSED/);
    let cleanup = 0;
    const worker = new UploadWorker(
      queue,
      () => ({ uid: 'a', epoch: 0 }),
      () => ({
        cancel() {},
        done: Promise.reject({ details: { reason: 'LOCAL_VIDEO_MISSING_OR_CHANGED' } }),
      }),
      async () => {
        cleanup++;
      },
    );
    await worker.run();
    const row = (await queue.list('a'))[0]!;
    assert.equal(row.status, 'failed');
    assert.equal(cleanup, 0);
    await queue.retry(row);
    assert.equal((await queue.list('a'))[0]?.attemptId, 'same');
    assert.equal((await queue.list('a'))[0]?.status, 'queued');
  } finally {
    db.close();
  }
});
test('proof storage and local paths are scoped and size boundaries are inclusive', () => {
  assert.equal(proofPath('j', 'u', 's', 'id'), 'proofs/j/u/s/id.mp4');
  assert.throws(() => proofPath('../j', 'u', 's', 'id'));
  assert.equal(validProofSize(MAX_PROOF_BYTES), true);
  assert.equal(validProofSize(MAX_PROOF_BYTES + 1), false);
  assert.equal(validProofSize(0), false);
  assert.notEqual(
    ownedProofUri('file:///data/', 'a', 'id'),
    ownedProofUri('file:///data/', 'b', 'id'),
  );
  assert.throws(() => ownedProofUri('file:///data/', '../b', 'id'));
});
