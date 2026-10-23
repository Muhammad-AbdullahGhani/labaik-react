export interface JobDraft {
  title: string;
  fee: number;
  currency: 'SAR';
  location: { latitude: number; longitude: number };
  startsAt: number;
  endsAt: number;
  proofLabels: string[];
}
export function parseJobDraft(input: unknown): JobDraft {
  if (!input || typeof input !== 'object') throw Error('INVALID_JOB');
  const data = input as Record<string, unknown>;
  const location = data.location as Record<string, unknown> | undefined;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (title.length < 3 || title.length > 100) throw Error('INVALID_TITLE');
  if (
    typeof data.fee !== 'number' ||
    !Number.isSafeInteger(data.fee) ||
    data.fee < 1 ||
    data.fee > 100_000_000
  )
    throw Error('INVALID_FEE');
  if (data.currency !== 'SAR') throw Error('INVALID_CURRENCY');
  if (
    !location ||
    typeof location.latitude !== 'number' ||
    typeof location.longitude !== 'number' ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180
  )
    throw Error('INVALID_LOCATION');
  if (
    typeof data.startsAt !== 'number' ||
    typeof data.endsAt !== 'number' ||
    !Number.isSafeInteger(data.startsAt) ||
    !Number.isSafeInteger(data.endsAt) ||
    data.endsAt <= data.startsAt ||
    data.endsAt - data.startsAt > 86_400_000
  )
    throw Error('INVALID_TIME_WINDOW');
  if (
    !Array.isArray(data.proofLabels) ||
    data.proofLabels.length < 1 ||
    data.proofLabels.length > 5
  )
    throw Error('INVALID_PROOF_STEPS');
  const proofLabels = data.proofLabels.map((value) =>
    typeof value === 'string' ? value.trim() : '',
  );
  if (
    proofLabels.some((label) => label.length < 3 || label.length > 100) ||
    new Set(proofLabels).size !== proofLabels.length
  )
    throw Error('INVALID_PROOF_STEPS');
  return {
    title,
    fee: data.fee,
    currency: 'SAR',
    location: { latitude: location.latitude, longitude: location.longitude },
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    proofLabels,
  };
}
