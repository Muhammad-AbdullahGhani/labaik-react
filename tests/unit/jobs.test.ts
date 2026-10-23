import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDraft } from '../../functions/src/domain/job';
const valid = {
  title: '  Field visit  ',
  fee: 15000,
  currency: 'SAR',
  location: { latitude: 21.4225, longitude: 39.8262 },
  startsAt: 1000,
  endsAt: 61000,
  proofLabels: ['  Show completed work  '],
};
test('job draft normalizes labels/title and preserves integer monetary units', () => {
  const result = parseJobDraft(valid);
  assert.equal(result.title, 'Field visit');
  assert.deepEqual(result.proofLabels, ['Show completed work']);
  assert.equal(result.fee, 15000);
});
test('job draft rejects invalid fee, coordinates, windows and proof definitions', () => {
  for (const patch of [
    { fee: NaN },
    { fee: 0 },
    { fee: 1.5 },
    { currency: 'USD' },
    { location: { latitude: 91, longitude: 1 } },
    { startsAt: NaN },
    { endsAt: 1000 },
    { proofLabels: [] },
    { proofLabels: ['duplicate', ' duplicate '] },
    { proofLabels: ['a'] },
  ])
    assert.throws(() => parseJobDraft({ ...valid, ...patch }));
});
