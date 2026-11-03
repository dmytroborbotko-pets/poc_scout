import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from '../scripts/lib/config.mjs';

test('examples and presets are valid against schema/', () => {
  // Point POCSCOUT_ROOT at an empty dir so only shipped files are checked.
  const out = execFileSync('node', [join(REPO, 'scripts', 'validate.mjs')], { env: { ...process.env, POCSCOUT_ROOT: '/nonexistent' }, encoding: 'utf8' });
  assert.doesNotMatch(out, /✗/);
});
