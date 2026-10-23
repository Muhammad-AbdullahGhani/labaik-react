import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'demo-labaik-field',
    firestore: { rules: readFileSync('rules/firestore.rules', 'utf8') },
    storage: { rules: readFileSync('rules/storage.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, status] of [
      ['supervisor', 'supervisor', 'approved'],
      ['a', 'performer', 'approved'],
      ['b', 'performer', 'approved'],
      ['pending', 'performer', 'pending'],
      ['suspended', 'performer', 'suspended'],
    ])
      await setDoc(doc(db, `users/${uid}`), { role, status });
    for (const [id, owner, status] of [
      ['a-job', 'a', 'accepted'],
      ['b-job', 'b', 'accepted'],
      ['done', 'a', 'complete'],
      ['pending-job', 'pending', 'accepted'],
      ['suspended-job', 'suspended', 'accepted'],
    ])
      await setDoc(doc(db, `jobs/${id}`), {
        assignedTo: owner,
        status,
        fee: 15000,
        version: 1,
        requiredSteps: ['proof-1'],
      });
    await setDoc(doc(db, 'offers/offer-a'), { performerId: 'a' });
    await setDoc(doc(db, 'activeJobs/a'), { jobId: 'a-job' });
  });
});
after(async () => {
  await env?.cleanup();
});
const actor = (uid: string, role = 'performer') => env.authenticatedContext(uid, { role });
async function reserve(path: string, jobId = 'a-job', stepId = 'proof-1') {
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `jobs/${jobId}`), {
      proofs: { [stepId]: { path, status: 'uploading', jobVersion: 1 } },
    });
  });
}

test('performer reads own job; cannot read another performer job, offer or lock', async () => {
  const db = actor('a').firestore();
  await assertSucceeds(getDoc(doc(db, 'jobs/a-job')));
  await assertFails(getDoc(doc(db, 'jobs/b-job')));
  await assertFails(getDoc(doc(actor('b').firestore(), 'offers/offer-a')));
  await assertFails(getDoc(doc(actor('b').firestore(), 'activeJobs/a')));
});
test('performer cannot approve, change fee or forge assignment/role/lock', async () => {
  const db = actor('a').firestore();
  await assertFails(updateDoc(doc(db, 'jobs/done'), { status: 'approved' }));
  await assertFails(updateDoc(doc(db, 'jobs/a-job'), { fee: 1 }));
  await assertFails(updateDoc(doc(db, 'jobs/a-job'), { assignedTo: 'b' }));
  await assertFails(updateDoc(doc(db, 'users/a'), { role: 'supervisor' }));
  await assertFails(setDoc(doc(db, 'activeJobs/a'), { jobId: 'b-job' }));
});
test('pending/suspended users denied workload even with stale approved claims', async () => {
  for (const uid of ['pending', 'suspended']) {
    const db = actor(uid).firestore();
    await assertFails(getDoc(doc(db, `jobs/${uid}-job`)));
    await assertFails(updateDoc(doc(db, `jobs/${uid}-job`), { status: 'started' }));
    await assertFails(getDoc(doc(db, 'offers/offer-a')));
    await assertSucceeds(getDoc(doc(db, `users/${uid}`))); // Status screen only.
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'jobs/a-job')));
  await assertFails(getDoc(doc(actor('a', 'supervisor').firestore(), 'jobs/b-job')));
});
test('invalid transitions fail; allowed transition and supervisor final approval succeed', async () => {
  const db = actor('a').firestore();
  await assertFails(updateDoc(doc(db, 'jobs/a-job'), { status: 'complete' }));
  await assertFails(updateDoc(doc(db, 'jobs/a-job'), { status: 'arrived' }));
  await assertSucceeds(updateDoc(doc(db, 'jobs/a-job'), { status: 'started' }));
  await assertFails(updateDoc(doc(db, 'jobs/a-job'), { status: 'accepted' }));
  const supervisor = actor('supervisor', 'supervisor').firestore();
  await assertSucceeds(updateDoc(doc(supervisor, 'jobs/done'), { status: 'approved' }));
  await assertFails(updateDoc(doc(supervisor, 'jobs/a-job'), { status: 'approved' }));
  assert.equal((await getDoc(doc(supervisor, 'jobs/a-job'))).data()?.fee, 15000);
});
test('Storage accepts only assigned performer, valid step and MP4; denies overwrite/delete', async () => {
  const path = 'proofs/a-job/a/proof-1/valid.mp4';
  await reserve(path);
  const file = ref(actor('a').storage(), path);
  await assertSucceeds(uploadBytes(file, new Uint8Array([1]), { contentType: 'video/mp4' }));
  await assertSucceeds(getBytes(file));
  await assertFails(uploadBytes(file, new Uint8Array([2]), { contentType: 'video/mp4' }));
  await assertFails(deleteObject(file));
  await assertFails(
    uploadBytes(ref(actor('b').storage(), path + '.mp4'), new Uint8Array([1]), {
      contentType: 'video/mp4',
    }),
  );
  await assertFails(getBytes(ref(actor('b').storage(), path)));
  await reserve('proofs/a-job/a/proof-1/wrong.mp4');
  await assertFails(
    uploadBytes(
      ref(actor('a').storage(), 'proofs/a-job/a/proof-1/wrong.mp4'),
      new Uint8Array([1]),
      { contentType: 'text/plain' },
    ),
  );
  await assertFails(
    uploadBytes(ref(actor('a').storage(), 'proofs/a-job/a/wrong/file.mp4'), new Uint8Array([1]), {
      contentType: 'video/mp4',
    }),
  );
  for (const uid of ['pending', 'suspended']) {
    await reserve(`proofs/${uid}-job/${uid}/proof-1/file.mp4`, `${uid}-job`);
    await assertFails(
      uploadBytes(
        ref(actor(uid).storage(), `proofs/${uid}-job/${uid}/proof-1/file.mp4`),
        new Uint8Array([1]),
        { contentType: 'video/mp4' },
      ),
    );
  }
  await assertFails(
    uploadBytes(ref(env.unauthenticatedContext().storage(), path + '.mp4'), new Uint8Array([1]), {
      contentType: 'video/mp4',
    }),
  );
});
test('Storage 60 MiB inclusive limit, oversize denied', { timeout: 120000 }, async () => {
  const storage = actor('a').storage();
  await reserve('proofs/a-job/a/proof-1/boundary.mp4');
  await assertSucceeds(
    uploadBytes(
      ref(storage, 'proofs/a-job/a/proof-1/boundary.mp4'),
      new Uint8Array(60 * 1024 * 1024),
      { contentType: 'video/mp4' },
    ),
  );
  await reserve('proofs/a-job/a/proof-1/large.mp4');
  await assertFails(
    uploadBytes(
      ref(storage, 'proofs/a-job/a/proof-1/large.mp4'),
      new Uint8Array(60 * 1024 * 1024 + 1),
      { contentType: 'video/mp4' },
    ),
  );
});

test('Storage refuses unreserved, stale-version and completed upload attempts', async () => {
  const path = 'proofs/a-job/a/proof-1/unreserved.mp4',
    storage = actor('a').storage();
  await assertFails(
    uploadBytes(ref(storage, path), new Uint8Array([1]), { contentType: 'video/mp4' }),
  );
  await reserve(path);
  await env.withSecurityRulesDisabled(async (context) =>
    updateDoc(doc(context.firestore(), 'jobs/a-job'), { 'proofs.proof-1.jobVersion': 0 }),
  );
  await assertFails(
    uploadBytes(ref(storage, path), new Uint8Array([1]), { contentType: 'video/mp4' }),
  );
  await reserve(path);
  await env.withSecurityRulesDisabled(async (context) =>
    updateDoc(doc(context.firestore(), 'jobs/a-job'), { 'proofs.proof-1.status': 'uploaded' }),
  );
  await assertFails(
    uploadBytes(ref(storage, path), new Uint8Array([1]), { contentType: 'video/mp4' }),
  );
});
