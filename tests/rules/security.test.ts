import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-labaik-field',
    firestore: { rules: readFileSync('rules/firestore.rules', 'utf8') },
    storage: { rules: readFileSync('rules/storage.rules', 'utf8') },
  });
});
after(async () => {
  await env?.cleanup();
});
test('bootstrap Firestore rules deny anonymous reads', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'jobs/private')));
});
test('bootstrap Storage rules deny anonymous writes', async () => {
  await assertFails(
    uploadBytes(
      ref(env.unauthenticatedContext().storage(), 'proofs/a/b/c/d.mp4'),
      new Uint8Array(1),
      { contentType: 'video/mp4' },
    ),
  );
});
