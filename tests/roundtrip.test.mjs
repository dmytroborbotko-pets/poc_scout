// Interchangeability: a config made by any mode survives edits by every other mode
// — comments and unknown fields included.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { REPO, configPath, init, read, validate, write } from '../scripts/lib/config.mjs';

let dir;
const cli = (...args) => execFileSync('node', [join(REPO, 'scripts', 'config.mjs'), ...args], { env: { ...process.env, POCSCOUT_ROOT: dir }, encoding: 'utf8' });
const json = (obj) => { const p = join(dir, `in-${Math.random()}.json`); writeFileSync(p, JSON.stringify(obj)); return p; };

before(() => { dir = mkdtempSync(join(tmpdir(), 'pocscout-rt-')); process.env.POCSCOUT_ROOT = dir; });
after(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.POCSCOUT_ROOT; });

test('non-technical: init + preset produce valid configs', () => {
  assert.equal(init().length, 5);
  cli('preset', 'general-startups');
  for (const n of ['profile', 'sources', 'tools', 'rubric', 'run']) assert.deepEqual(validate(n, read(n).data), [], n);
  assert.ok(read('sources').data.sources.some((s) => s.id === 'yc-rfs'));
  // `sources: []` in the example must become a normal block list, not a one-line flow blob
  const text = readFileSync(configPath('sources'), 'utf8');
  assert.match(text, /^ {2}- id: yc-rfs$/m);
  assert.doesNotMatch(text, /\{\s*id: yc-rfs/);
});

test('technical hand edit → UI-style write keeps comments and unknown fields', () => {
  appendFileSync(configPath('profile'), '\n# my hand-written note\nmy_custom_field: keep me\n');
  const { data, hash } = read('profile');
  data.interests.priority = ['robotics', 'climate']; // what the UI sends back: full object incl. unknown field
  write('profile', data, hash);
  const text = readFileSync(configPath('profile'), 'utf8');
  assert.match(text, /# my hand-written note/);
  assert.match(text, /my_custom_field: keep me/);
  assert.match(text, /# Areas you want most/); // example comment survived
  assert.deepEqual(read('profile').data.interests.priority, ['robotics', 'climate']);
});

test('quick mode (Claude via CLI patch) keeps comments and unknown fields', () => {
  cli('patch', 'profile', json({ interests: { excluded: ['gambling'] } }));
  const text = readFileSync(configPath('profile'), 'utf8');
  assert.match(text, /# my hand-written note/);
  assert.match(text, /my_custom_field: keep me/);
  const d = read('profile').data;
  assert.deepEqual(d.interests.excluded, ['gambling']);
  assert.deepEqual(d.interests.priority, ['robotics', 'climate']);
});

test('rubric: disabling a default no-go and adding one keeps item comments', () => {
  const { data, hash } = read('rubric');
  data.no_go.find((r) => r.id === 'gui-only').enabled = false;
  data.no_go.push({ id: 'needs-lab', text: 'Needs a wet lab', enabled: true });
  write('rubric', data, hash);
  const text = readFileSync(configPath('rubric'), 'utf8');
  assert.match(text, /# Hard rejection rules/);
  assert.equal(read('rubric').data.no_go.find((r) => r.id === 'gui-only').enabled, false);
  assert.equal(read('rubric').data.no_go.at(-1).id, 'needs-lab');
});

test('shrinking a list keeps the remaining items intact', () => {
  const { data, hash } = read('sources');
  const keep = data.sources[0];
  data.sources = [keep];
  write('sources', data, hash);
  assert.deepEqual(read('sources').data.sources, [keep]);
  assert.match(readFileSync(configPath('sources'), 'utf8'), /# Verified 2026-11-03|# Pages the scanner reads/);
});

test('stale hash is refused (manual edit while UI was open)', () => {
  const { data, hash } = read('run');
  appendFileSync(configPath('run'), '# edited in an editor meanwhile\n');
  data.budget_usd = 3;
  assert.throws(() => write('run', data, hash), { code: 'CONFLICT' });
  assert.match(readFileSync(configPath('run'), 'utf8'), /edited in an editor meanwhile/);
});

test('invalid data is refused with human messages and the file is untouched', () => {
  const before = readFileSync(configPath('run'), 'utf8');
  const { data } = read('run');
  data.schedule.hour = 25;
  data.models.judge = 'gpt';
  assert.throws(() => write('run', data), (e) => e.code === 'INVALID'
    && e.errors.some((m) => m.includes('schedule → hour'))
    && e.errors.some((m) => m.includes('one of sonnet, opus, haiku')));
  assert.equal(readFileSync(configPath('run'), 'utf8'), before);
});

test('CLI set of a full object keeps comments on unchanged parts', () => {
  const d = read('run').data;
  d.notify = false;
  cli('set', 'run', json(d));
  const text = readFileSync(configPath('run'), 'utf8');
  assert.match(text, /# How and when scans run/);
  assert.match(text, /notify: false/);
});
