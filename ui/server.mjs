#!/usr/bin/env node
// Local configurator. Listens on 127.0.0.1 only, no telemetry, no outbound requests.
// Mutating requests need header "X-PocScout: 1" (blocks cross-site form posts) and a
// Host header of 127.0.0.1/localhost (blocks DNS rebinding).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAMES, REPO, YAML, diff, read, render, root, write } from '../scripts/lib/config.mjs';

const UI = join(REPO, 'ui');
const STATIC = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/i18n/en.json': 'i18n/en.json', '/i18n/uk.json': 'i18n/uk.json' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const STATUSES = ['new', 'in-progress', 'done'];

// Actions the UI may start. Claude-backed ones go through run_scan.sh (same permissions as scheduled runs).
const ACTIONS = {
  'detect-tools': { claude: false, cmd: ['node', [join(REPO, 'scripts', 'detect-tools.mjs')]] },
  'schedule-install': { claude: false, cmd: ['bash', [join(REPO, 'scripts', 'schedule.sh'), 'install']] },
  'schedule-uninstall': { claude: false, cmd: ['bash', [join(REPO, 'scripts', 'schedule.sh'), 'uninstall']] },
  'schedule-status': { claude: false, cmd: ['bash', [join(REPO, 'scripts', 'schedule.sh'), 'status']] },
  verify: { claude: true, cmd: ['bash', [join(REPO, 'scripts', 'run_scan.sh'), 'verify']] },
  scan: { claude: true, cmd: ['bash', [join(REPO, 'scripts', 'run_scan.sh'), 'scan']] },
};
const jobs = new Map();
let jobSeq = 0;

const reportsDir = () => join(root(), 'reports');
function safeReport(rel) {
  const p = resolve(reportsDir(), String(rel ?? ''));
  if (!p.startsWith(reportsDir() + sep) || extname(p) !== '.md' || !existsSync(p)) throw Object.assign(new Error('report not found'), { status: 404 });
  return p;
}
const frontmatter = (text) => YAML.parse(text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '') ?? {};

function listReports() {
  if (!existsSync(reportsDir())) return [];
  return readdirSync(reportsDir())
    .filter((d) => statSync(join(reportsDir(), d)).isDirectory())
    .sort().reverse()
    .map((tag) => ({
      tag,
      overview: existsSync(join(reportsDir(), tag, 'OVERVIEW.md')) ? `${tag}/OVERVIEW.md` : null,
      reports: readdirSync(join(reportsDir(), tag)).filter((f) => f.endsWith('.md') && f !== 'OVERVIEW.md').map((f) => {
        let fm = {};
        try { fm = frontmatter(readFileSync(join(reportsDir(), tag, f), 'utf8')); } catch { /* broken front matter: show file anyway */ }
        return { path: `${tag}/${f}`, title: fm.title ?? f, status: fm.status ?? 'new', days: fm.poc_days_estimate ?? null };
      }),
    }));
}

function setStatus(rel, status) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error(`status must be one of ${STATUSES.join(', ')}`), { status: 422 });
  const p = safeReport(rel);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^status:.*$/m, `status: ${status}`));
  const index = join(reportsDir(), 'INDEX.md');
  if (existsSync(index)) {
    const lines = readFileSync(index, 'utf8').split('\n').map((l) => (l.includes(`](${rel})`) ? l.replace(/\| (new|in-progress|done) \|/, `| ${status} |`) : l));
    writeFileSync(index, lines.join('\n'));
  }
}

// Exact claude invocation (tools, budget) a Claude-backed action will use — shown before the user clicks.
function describeAction(action) {
  if (!ACTIONS[action].claude) return null;
  try {
    return JSON.parse(execFileSync('bash', [join(REPO, 'scripts', 'run_scan.sh'), '--describe', action], { cwd: root(), env: { ...process.env, POCSCOUT_ROOT: root() }, encoding: 'utf8' }));
  } catch (e) {
    return { error: e.stderr?.toString() || e.message };
  }
}

// Has the user accepted Claude Code's "trust this folder" prompt here (or for a parent folder)?
// Read-only: we never write Claude's config.
function trusted() {
  try {
    const p = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')).projects ?? {};
    const parts = root().split('/');
    for (let i = parts.length; i > 1; i--) if (p[parts.slice(0, i).join('/')]?.hasTrustDialogAccepted) return true;
  } catch { /* no Claude config yet */ }
  return false;
}

function startJob(action) {
  if ([...jobs.values()].some((j) => j.exit === null)) throw Object.assign(new Error('another action is still running'), { status: 409 });
  const [cmd, args] = ACTIONS[action].cmd;
  const job = { id: String(++jobSeq), action, log: '', exit: null, started: new Date().toISOString() };
  const child = spawn(cmd, args, { cwd: root(), env: { ...process.env, POCSCOUT_ROOT: root(), POCSCOUT_FROM_UI: '1' } });
  const add = (b) => { job.log = (job.log + b.toString()).slice(-20000); };
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  child.on('close', (code) => { job.exit = code; });
  child.on('error', (e) => { add(`\n${e.message}\n`); job.exit = -1; });
  jobs.set(job.id, job);
  return job;
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:" });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const body = (req) => new Promise((ok, bad) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 2e6) bad(Object.assign(new Error('body too large'), { status: 413 })); });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { bad(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
});

export function createApp() {
  const server = createServer(async (req, res) => {
    try {
      const port = server.address().port;
      const host = req.headers.host ?? '';
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, { error: 'bad host' });
      const url = new URL(req.url, `http://${host}`);
      const mutating = req.method !== 'GET';
      if (mutating && req.headers['x-pocscout'] !== '1') return send(res, 403, { error: 'missing X-PocScout header' });

      if (req.method === 'GET' && STATIC[url.pathname]) {
        const f = join(UI, STATIC[url.pathname]);
        return send(res, 200, readFileSync(f, 'utf8'), TYPES[extname(f)]);
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return send(res, 200, Object.fromEntries(NAMES.map((n) => { const r = read(n); return [n, { data: r.data, hash: r.hash, exists: r.exists }]; })));
      }
      if (req.method === 'GET' && url.pathname === '/api/schema') {
        return send(res, 200, Object.fromEntries(NAMES.map((n) => [n, JSON.parse(readFileSync(join(REPO, 'schema', `${n}.schema.json`), 'utf8'))])));
      }
      if (req.method === 'GET' && url.pathname === '/api/presets') {
        const dir = join(REPO, 'presets', 'sources');
        return send(res, 200, readdirSync(dir).map((f) => ({ name: f.replace('.yaml', ''), sources: YAML.parse(readFileSync(join(dir, f), 'utf8')).sources })));
      }
      const m = url.pathname.match(/^\/api\/(preview|config)\/([a-z]+)$/);
      if (m && (req.method === 'POST' || req.method === 'PUT') && NAMES.includes(m[2])) {
        const { data, hash: base } = await body(req);
        if (m[1] === 'preview') {
          const r = render(m[2], data);
          return send(res, 200, { diff: diff(r.before, r.after), errors: r.errors, stale: base !== read(m[2]).hash });
        }
        try {
          return send(res, 200, { hash: write(m[2], data, base) });
        } catch (e) {
          if (e.code === 'CONFLICT') return send(res, 409, { error: e.message });
          if (e.code === 'INVALID') return send(res, 422, { error: 'invalid', errors: e.errors });
          throw e;
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/trust') return send(res, 200, { trusted: trusted(), folder: root() });
      if (req.method === 'GET' && url.pathname === '/api/reports') return send(res, 200, listReports());
      if (req.method === 'GET' && url.pathname === '/api/report') return send(res, 200, { text: readFileSync(safeReport(url.searchParams.get('path')), 'utf8') });
      if (req.method === 'POST' && url.pathname === '/api/report-status') {
        const { path, status } = await body(req);
        setStatus(path, status);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/actions') {
        return send(res, 200, Object.fromEntries(Object.keys(ACTIONS).map((a) => [a, { claude: ACTIONS[a].claude, describe: describeAction(a) }])));
      }
      const a = url.pathname.match(/^\/api\/action\/([a-z-]+)$/);
      if (a && req.method === 'POST' && ACTIONS[a[1]]) return send(res, 202, startJob(a[1]));
      const j = url.pathname.match(/^\/api\/job\/(\d+)$/);
      if (j && req.method === 'GET' && jobs.has(j[1])) return send(res, 200, jobs.get(j[1]));
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, e.status ?? 500, { error: e.message });
    }
  });
  return server;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const start = Number(process.env.PORT || 4317);
  const tryPort = (port, left) => {
    const app = createApp();
    app.once('error', (e) => (e.code === 'EADDRINUSE' && left > 0 ? tryPort(port + 1, left - 1) : (console.error(e.message), process.exit(1))));
    app.listen(port, '127.0.0.1', () => {
      const link = `http://127.0.0.1:${port}/`;
      console.log(`PoC Scout UI: ${link}  (Ctrl+C to stop)`);
      if (process.argv.includes('--open')) spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [link], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    });
  };
  tryPort(start, 10);
}
