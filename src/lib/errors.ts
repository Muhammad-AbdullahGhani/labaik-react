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
    PROOF_VIDEO_REQUIRED: 'Record and upload a video instead of using the old proof marker.',
    ARRIVE_BEFORE_RECORDING: 'Arrive at the job before recording proof.',
    INVALID_VIDEO: 'Use a nonempty MP4 up to 3 minutes and 60 MiB.',
    UPLOAD_NOT_FOUND: 'Upload is not finished yet. It will retry.',
    INVALID_UPLOADED_VIDEO:
      'Uploaded file metadata does not match the reserved video. Retake the recording.',
    LOCAL_VIDEO_MISSING_OR_CHANGED:
      'The local recording is missing or changed. Discard this failed upload and retake it.',
    PROOF_UPLOAD_IN_PROGRESS:
      'This proof step already has an upload in progress. Retry or discard that upload first.',
    PROOF_AWAITING_REVIEW:
      'This video is already uploaded or approved. Wait for supervisor review.',
    STALE_PROOF_ATTEMPT: 'This recording was replaced. The old attempt cannot update the step.',
    INVALID_TITLE: 'Enter a job title between 3 and 100 characters.',
    INVALID_FEE: 'Enter a positive fee with at most two decimal places.',
    INVALID_LOCATION: 'Enter valid latitude and longitude coordinates.',
    INVALID_TIME_WINDOW: 'Use a future time window lasting no more than 24 hours.',
    INVALID_PROOF_STEPS:
      'Enter one to five different proof descriptions, at least 3 characters each.',
    NO_AVAILABLE_PERFORMER:
      'No approved performer is free. Finish an active job or approve another performer.',
    REQUEST_ID_REUSED:
      'This request ID was already used for a different job. Edit the form and submit again.',
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
      'LOCAL_VIDEO_MISSING_OR_CHANGED',
      'INVALID_VIDEO',
      'INVALID_UPLOADED_VIDEO',
      'PROOF_UPLOAD_IN_PROGRESS',
      'PROOF_AWAITING_REVIEW',
      'STALE_PROOF_ATTEMPT',
      'PROOF_VIDEO_REQUIRED',
    ].includes(reason)
  )
    return new ReplayError('permanent', errorMessage(error));
  return new ReplayError('transient', errorMessage(error));
}
