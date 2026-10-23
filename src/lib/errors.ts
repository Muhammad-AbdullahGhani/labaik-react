import { ReplayError } from './queue';
export function errorReason(error: unknown): string {
  const value = error as { details?: { reason?: unknown }; message?: unknown; code?: unknown };
  const raw = value?.details?.reason ?? value?.message ?? value?.code;
  if (typeof raw !== 'string') return 'UNKNOWN_ERROR';
  return raw.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/)?.[0] ?? raw;
}
export function errorMessage(error: unknown) {
  const reason = errorReason(error);
  const messages: Record<string, string> = {
    OFFER_EXPIRED: 'This offer expired. Wait for the next offer.',
    OFFER_ALREADY_TAKEN: 'Another acceptance won. This offer is already taken.',
    OFFER_NOT_YOURS: 'This offer was moved to another performer.',
    ALREADY_HAS_ACTIVE_JOB: 'You already have an active job. Finish it before accepting another.',
    USER_NOT_APPROVED: 'Your account is pending or suspended. Access is unavailable.',
    JOB_VERSION_CHANGED:
      'The supervisor changed this job. Your queued action is retained for review.',
    ACCOUNT_MISMATCH: 'Account changed. This action will not replay as another user.',
    INVALID_TRANSITION: 'The server job changed. Review its current state.',
    GEOFENCE_REJECTED: 'Location plus accuracy is outside the 300 m arrival boundary.',
  };
  return messages[reason] ?? reason.replace(/^\[.*?\]\s*/, '');
}
export function replayError(error: unknown) {
  const reason = errorReason(error);
  const code = (error as { code?: string })?.code ?? '';
  if (['JOB_VERSION_CHANGED', 'INVALID_TRANSITION', 'ACTIVE_JOB_CHANGED'].includes(reason))
    return new ReplayError('conflict', errorMessage(error));
  if (
    ['permission-denied', 'unauthenticated', 'invalid-argument', 'resource-exhausted'].some(
      (part) => code.includes(part),
    ) ||
    [
      'GEOFENCE_REJECTED',
      'PROOF_STEPS_MISSING',
      'USER_NOT_APPROVED',
      'ACCOUNT_MISMATCH',
      'ACTION_ID_REUSED',
      'ACTION_RECEIPT_LIMIT',
    ].includes(reason)
  )
    return new ReplayError('permanent', errorMessage(error));
  return new ReplayError('transient', errorMessage(error));
}
