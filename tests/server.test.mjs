// UI server: reads/writes configs safely, refuses foreign hosts and header-less writes.
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { configPath, init } from '../scripts/lib/config.mjs';
import { createApp } from '../ui/server.mjs';

let dir, server, port;

function call(method, path, body, { host, header = true } = {}) {
  return new Promise((ok, bad) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = request({
      host: '127.0.0.1', port, method, path,
      headers: { Host: host ?? `127.0.0.1:${port}`, 'Content-Type': 'application/json', ...(header ? { 'X-PocScout': '1' } : {}) },
    }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => ok({ status: res.statusCode, body: s ? JSON.parse(s) : null })); });
    req.on('error', bad);
    req.end(data);
  });
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pocscout-ui-'));
  process.env.POCSCOUT_ROOT = dir;
  init();
  mkdirSync(join(dir, 'reports', '2026-01-01'), { recursive: true });
  writeFileSync(join(dir, 'reports', '2026-01-01', 'idea.md'), '---\ntitle: Idea\nstatus: new\n---\n## Body\n');
  writeFileSync(join(dir, 'reports', 'INDEX.md'), '| a | Idea | new | [r](2026-01-01/idea.md) |\n');
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); delete process.env.POCSCOUT_ROOT; });

test('listens on 127.0.0.1 only', () => {
  assert.equal(server.address().address, '127.0.0.1');
});

test('rejects foreign Host header (DNS rebinding)', async () => {
  assert.equal((await call('GET', '/api/config', null, { host: 'evil.example:80' })).status, 403);
});

test('rejects writes without X-PocScout header', async () => {
  const r = await call('PUT', '/api/config/run', { data: {} }, { header: false });
  assert.equal(r.status, 403);
});

test('GET config → PUT change → comments kept', async () => {
  const { body } = await call('GET', '/api/config');
  const run = body.run;
  run.data.budget_usd = 4;
  const put = await call('PUT', '/api/config/run', { data: run.data, hash: run.hash });
  assert.equal(put.status, 200);
  const text = readFileSync(configPath('run'), 'utf8');
  assert.match(text, /budget_usd: 4/);
  assert.match(text, /# How and when scans run/);
});

test('preview shows diff and validation errors without writing', async () => {
  const { body } = await call('GET', '/api/config');
  const d = body.run.data;
  d.schedule.hour = 99;
  const before = readFileSync(configPath('run'), 'utf8');
  const r = await call('POST', '/api/preview/run', { data: d, hash: body.run.hash });
  assert.equal(r.status, 200);
  assert.ok(r.body.errors.some((e) => e.includes('hour')));
  assert.ok(r.body.diff.some((l) => l.startsWith('+') && l.includes('99')));
  assert.equal(readFileSync(configPath('run'), 'utf8'), before);
});

test('invalid PUT → 422, stale hash → 409', async () => {
  const { body } = await call('GET', '/api/config');
  const bad = structuredClone(body.run.data);
  bad.models.judge = 'gpt';
  assert.equal((await call('PUT', '/api/config/run', { data: bad, hash: body.run.hash })).status, 422);
  appendFileSync(configPath('run'), '# manual edit\n');
  assert.equal((await call('PUT', '/api/config/run', { data: body.run.data, hash: body.run.hash })).status, 409);
});

test('reports: list, read, status change updates report and INDEX', async () => {
  const list = (await call('GET', '/api/reports')).body;
  assert.equal(list[0].reports[0].path, '2026-01-01/idea.md');
  assert.equal((await call('POST', '/api/report-status', { path: '2026-01-01/idea.md', status: 'in-progress' })).status, 200);
  assert.match(readFileSync(join(dir, 'reports', '2026-01-01', 'idea.md'), 'utf8'), /status: in-progress/);
  assert.match(readFileSync(join(dir, 'reports', 'INDEX.md'), 'utf8'), /\| in-progress \|/);
});

test('report path traversal is refused', async () => {
  assert.equal((await call('GET', '/api/report?path=../config/run.yaml')).status, 404);
  assert.equal((await call('GET', `/api/report?path=${encodeURIComponent('../../etc/passwd')}`)).status, 404);
});

test('describe shows permissions for Claude actions without running anything', async () => {
  const a = (await call('GET', '/api/actions')).body;
  assert.equal(a.scan.claude, true);
  assert.equal(a.scan.describe.permission_mode, 'dontAsk');
  assert.ok(a.scan.describe.allowedTools.includes('WebFetch'));
  assert.equal(a['detect-tools'].claude, false);
});
