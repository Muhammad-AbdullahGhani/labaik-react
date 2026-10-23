export const MAX_PROOF_BYTES = 60 * 1024 * 1024;
export const MAX_PROOF_DURATION_MS = 180_000;
export type ProofStatus = 'uploading' | 'uploaded' | 'approved' | 'rejected' | 'cancelled';
export interface ProofRecord {
  attemptId: string;
  uid: string;
  path: string;
  jobVersion: number;
  expectedSize: number;
  durationMs: number;
  status: ProofStatus;
  generation?: string;
  uploadedSize?: number;
  rejectionReason?: string;
  reviewedBy?: string;
}
export interface ProofJob {
  id: string;
  title: string;
  status: string;
  version: number;
  requiredSteps: string[];
  proofLabels?: string[];
  proofs?: Record<string, ProofRecord>;
}
export function proofPath(jobId: string, uid: string, stepId: string, attemptId: string) {
  for (const part of [jobId, uid, stepId, attemptId])
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(part)) throw Error('INVALID_PROOF_PATH');
  return `proofs/${jobId}/${uid}/${stepId}/${attemptId}.mp4`;
}
export function validProofSize(size: number) {
  return Number.isSafeInteger(size) && size > 0 && size <= MAX_PROOF_BYTES;
}
