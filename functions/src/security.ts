import { getFirestore, type Transaction } from 'firebase-admin/firestore';
import {
  HttpsError,
  type CallableRequest,
  type FunctionsErrorCode,
} from 'firebase-functions/v2/https';
export function fail(code: FunctionsErrorCode, reason: string): never {
  throw new HttpsError(code, reason, { reason });
}
export function id(data: unknown, field: string): string {
  const value =
    data && typeof data === 'object' ? (data as Record<string, unknown>)[field] : undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    fail('invalid-argument', 'INVALID_' + field);
  return value;
}
export function identity(request: CallableRequest<unknown>, role?: string) {
  if (!request.auth) fail('unauthenticated', 'SIGN_IN_REQUIRED');
  if (role && request.auth.token.role !== role) fail('permission-denied', 'ROLE_REQUIRED');
  return { uid: request.auth.uid, role: request.auth.token.role as unknown };
}
export async function approved(tx: Transaction, actor: { uid: string; role: unknown }) {
  const user = (await tx.get(getFirestore().doc(`users/${actor.uid}`))).data();
  if (user?.status !== 'approved' || user.role !== actor.role)
    fail('permission-denied', 'USER_NOT_APPROVED');
}
