import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selftest } from '../scripts/ids.mjs';

test('ids selftest (normalization, dedup, truncated titles)', () => {
  assert.equal(selftest(), 'selftest ok');
});
