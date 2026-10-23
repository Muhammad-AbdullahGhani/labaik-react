import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from './firebase';
import type { JobAction } from '../lib/queue';
import { replayError } from '../lib/errors';
export { errorReason, errorMessage } from '../lib/errors';
export async function call<T>(name: string, data: unknown = {}): Promise<T> {
  return (await httpsCallable(functions, name)(data)).data as T;
}
export async function sendAction(action: JobAction) {
  try {
    await call('applyJobAction', action);
  } catch (error) {
    throw replayError(error);
  }
}
