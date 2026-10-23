import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from '@react-native-firebase/functions';
import { connectStorageEmulator, getStorage } from '@react-native-firebase/storage';

const app = getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);

// Module-scoped initialization runs before any listeners or requests.
if (process.env.EXPO_PUBLIC_USE_EMULATORS !== 'false') {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? '10.0.2.2';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8180);
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
}
