#!/usr/bin/env node
// Technical setup: detailed questions in the terminal. Enter keeps the [default].
// Works with piped answers too (one per line) — useful for scripted installs.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { REPO, YAML, init, read, root, write } from './lib/config.mjs';

// Own line queue: readline drops lines that arrive before a question when stdin is piped.
const rl = createInterface({ input: process.stdin });
const queue = [], waiters = [];
let closed = false;
rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : queue.push(l)));
rl.on('close', () => { closed = true; while (waiters.length) waiters.shift()(null); });
const nextLine = () => (queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((r) => waiters.push(r)));

async function ask(q, dflt = '') {
  process.stdout.write(`${q}${dflt !== '' ? ` [${dflt}]` : ''}: `);
  const a = await nextLine();
  if (a === null || !process.stdin.isTTY) process.stdout.write(`${a ?? ''}\n`);
  return (a ?? '').trim() || String(dflt);
}
const yes = async (q, d = false) => /^y/i.test(await ask(`${q} (y/n)`, d ? 'y' : 'n'));
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const num = async (q, d, min, max) => {
  for (;;) {
    const n = Number(await ask(q, d));
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    console.log(`  enter a number between ${min} and ${max}`);
  }
};
const pickOne = async (q, options, d) => {
  for (;;) {
    const a = await ask(`${q} (${options.join('/')})`, d);
    if (options.includes(a)) return a;
    console.log(`  choose one of: ${options.join(', ')}`);
  }
};
const h = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

function save(name, data) {
  try { write(name, data); } catch (e) { console.error(`\n✗ config/${name}.yaml not saved:\n  ${(e.errors ?? [e.message]).join('\n  ')}`); process.exit(1); }
}

init();
const profile = read('profile').data, rubric = read('rubric').data, sources = read('sources').data, run = read('run').data;

h('1/8 Reports');
profile.report_language = await ask('Report language code', profile.report_language ?? 'en');

h('2/8 Interests (comma-separated; empty = anything)');
profile.interests.priority = list(await ask('Most interesting areas', (profile.interests.priority ?? []).join(', ')));
profile.interests.excluded = list(await ask('Excluded areas', (profile.interests.excluded ?? []).join(', ')));
profile.interests.exceptions = list(await ask('Exceptions allowed inside excluded areas', (profile.interests.exceptions ?? []).join(', ')));

h('3/8 Your own scores (optional extra 1–5 axes)');
profile.custom_axes ??= [];
while (await yes('Add a custom score?', false)) {
  const name = (await ask('  short name (lowercase_with_underscores)', 'my_axis')).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  profile.custom_axes.push({ name, question: await ask('  question for the judge', 'How well does this fit my goals?'), enabled: true, affects_selection: await yes('  count it when picking top ideas?', false) });
}
save('profile', profile);

h('4/8 Hard no-go rules (one match rejects an idea)');
for (const r of rubric.no_go) console.log(`  [${r.enabled ? 'on' : 'off'}] ${r.id}: ${r.text}`);
if (!(await yes('Keep these rules as they are?', true))) {
  for (const r of rubric.no_go) {
    const a = await pickOne(`  ${r.id}: keep / edit / off / on`, ['keep', 'edit', 'off', 'on'], 'keep');
    if (a === 'edit') r.text = await ask('    new text', r.text);
    if (a === 'off') r.enabled = false;
    if (a === 'on') r.enabled = true;
  }
}
for (let text; (text = await ask('Add your own rule (empty to finish)', '')); ) {
  rubric.no_go.push({ id: `custom-${rubric.no_go.length + 1}`, text, enabled: true });
}

h('5/8 Scoring and selection');
rubric.tool_first = await pickOne('When an idea needs a tool you lack', ['suggest', 'strict'], rubric.tool_first);
rubric.max_poc_days = await num('Max days per PoC', rubric.max_poc_days, 1, 60);
for (const [k, v] of Object.entries(rubric.scores)) v.weight = await num(`Weight of ${k} (0 = off)`, v.weight, 0, 5);
rubric.selection.top_n = await num('Reports per scan', rubric.selection.top_n, 1, 50);
rubric.selection.min_sum = await num('Minimum weighted total', rubric.selection.min_sum, 0, 1000);
save('rubric', rubric);

h('6/8 Sources');
const presetDir = join(REPO, 'presets', 'sources');
const presets = readdirSync(presetDir).map((f) => f.replace('.yaml', ''));
for (const p of presets) console.log(`  - ${p}: ${YAML.parse(readFileSync(join(presetDir, `${p}.yaml`), 'utf8')).sources.map((s) => s.name).join(', ')}`);
const chosen = list(await ask('Presets to add (comma-separated, "none")', sources.sources?.length ? 'none' : 'general-startups')).filter((p) => p !== 'none');
sources.sources ??= [];
for (const p of chosen) {
  if (!presets.includes(p)) { console.log(`  unknown preset "${p}", skipped`); continue; }
  const have = new Set(sources.sources.map((s) => s.id));
  sources.sources.push(...YAML.parse(readFileSync(join(presetDir, `${p}.yaml`), 'utf8')).sources.filter((s) => !have.has(s.id)));
}
const urls = list(await ask('Your own source URLs (comma-separated, empty = none)', ''));
for (const url of urls) {
  if (!/^https?:\/\//.test(url)) { console.log(`  not a URL, skipped: ${url}`); continue; }
  const host = new URL(url).hostname.replace(/^www\./, '');
  sources.sources.push({ id: host.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), name: host, url, access: 'html', status: 'unverified', last_verified: null, last_seen_update: null, enabled: false, notes: 'Added in setup — run /poc-verify-sources, then enable.' });
}
save('sources', sources);
if (urls.length) console.log('  → your URLs are disabled until verified: run claude "/poc-verify-sources"');

h('7/8 Runs');
run.models ??= {};
for (const a of ['scanner', 'judge', 'reporter', 'builder']) run.models[a] = await pickOne(`Model for ${a}`, ['sonnet', 'opus', 'haiku'], run.models[a] ?? 'sonnet');
run.budget_usd = await num('Budget per scan in USD (claude --max-budget-usd)', run.budget_usd, 0.5, 1000);
run.isolate = await yes('Run scans without your personal plugins/MCP servers?', run.isolate !== false);
run.notify = await yes('Desktop notification after scheduled scans?', run.notify !== false);

h('8/8 Schedule');
const s = run.schedule;
s.enabled = await yes('Run scans automatically?', s.enabled);
if (s.enabled) {
  s.frequency = await pickOne('Frequency', ['monthly', 'weekly'], s.frequency);
  if (s.frequency === 'monthly') s.day_of_month = await num('Day of month', s.day_of_month ?? 1, 1, 28);
  else s.weekday = await num('Weekday (0 = Sunday)', s.weekday ?? 1, 0, 6);
  s.hour = await num('Hour', s.hour, 0, 23);
  s.minute = await num('Minute', s.minute, 0, 59);
}
save('run', run);
if (s.enabled && await yes('Install the schedule now?', true)) spawnSync('bash', [join(REPO, 'scripts', 'schedule.sh'), 'install'], { stdio: 'inherit', env: { ...process.env, POCSCOUT_ROOT: root() } });

h('Optional: global install');
console.log('  Copies agents and commands to ~/.claude/ so /poc-* commands work from any folder (existing files are never overwritten).');
if (await yes('Install globally?', false)) {
  const note = `\n> PoC Scout project root: \`${root()}\` — run from there (cd first) so config/ and scripts/ resolve.\n`;
  for (const [sub, re] of [['agents', /^pocscout-.*\.md$/], ['commands', /^poc-.*\.md$/]]) {
    const dst = join(homedir(), '.claude', sub);
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(join(REPO, '.claude', sub)).filter((x) => re.test(x))) {
      const to = join(dst, f);
      if (existsSync(to)) { console.log(`  skipped (exists): ~/.claude/${sub}/${f}`); continue; }
      if (sub === 'commands') writeFileSync(to, readFileSync(join(REPO, '.claude', sub, f), 'utf8') + note);
      else copyFileSync(join(REPO, '.claude', sub, f), to);
      console.log(`  installed: ~/.claude/${sub}/${f}`);
    }
  }
}

h('Done');
console.log(`Files written: config/profile.yaml, config/rubric.yaml, config/sources.yaml, config/run.yaml (tools: config/tools.yaml)
Edit any of them by hand — comments and extra fields are kept by every mode.
  agents:   .claude/agents/pocscout-*.md      commands: .claude/commands/poc-*.md
  schemas:  schema/*.schema.json              check:    node scripts/config.mjs validate
Next:
  node scripts/detect-tools.mjs               mark installed tools
  claude "/poc-scan max_sources=2 top_n=2"     small first scan
  npm run ui                                  browser view`);
rl.close();
