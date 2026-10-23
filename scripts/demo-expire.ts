import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
initializeApp({ projectId: 'demo-labaik-field' });
async function expire() {
  const ref = getFirestore().doc('offers/demo-offer');
  const offer = (await ref.get()).data();
  if (offer?.status !== 'pending') throw Error('Re-seed first: demo offer must still be pending.');
  await ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  console.log('Demo offer deadline set in the past. Run the supervisor sweep button.');
}
expire().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
