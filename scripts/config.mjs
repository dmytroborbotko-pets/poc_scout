#!/usr/bin/env node
// Config CLI — used by Claude commands, shell scripts and humans.
//   node scripts/config.mjs init                      create missing config/*.yaml from examples
//   node scripts/config.mjs validate [name]           validate one or all configs
//   node scripts/config.mjs get <name> [dotted.path]  print JSON (or a single value)
//   node scripts/config.mjs set <name> <file.json>    replace config with JSON content (comments kept)
//   node scripts/config.mjs patch <name> <file.json>  deep-merge JSON into config (comments kept)
//   node scripts/config.mjs preset <preset-name>      add a source preset's sources (by id, no duplicates)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMES, REPO, YAML, diff, init, pick, read, render, validate, write } from './lib/config.mjs';

const [cmd, name, arg] = process.argv.slice(2);
const fail = (msg) => { console.error(msg); process.exit(1); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => (isObj(a) && isObj(b)
  ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, k in b ? merge(a[k], b[k]) : a[k]]))
  : b);

function save(n, data) {
  const { before, after } = render(n, data);
  try { write(n, data); } catch (e) { fail(`Not saved — config/${n}.yaml is invalid:\n${e.message}`); }
  const changes = diff(before, after);
  console.log(changes.length ? changes.join('\n') : 'no changes');
}

switch (cmd) {
  case 'init': {
    const created = init();
    console.log(created.length ? `created: ${created.map((n) => `config/${n}.yaml`).join(', ')}` : 'all config files already exist');
    break;
  }
  case 'validate': {
    let bad = 0;
    for (const n of name ? [name] : NAMES) {
      const { exists, data } = read(n);
      if (!exists) { console.log(`config/${n}.yaml: missing (run: node scripts/config.mjs init)`); bad++; continue; }
      const errors = validate(n, data);
      console.log(errors.length ? `config/${n}.yaml: INVALID\n  ${errors.join('\n  ')}` : `config/${n}.yaml: ok`);
      bad += errors.length ? 1 : 0;
    }
    process.exit(bad ? 1 : 0);
  }
  case 'get': {
    const { data } = read(name);
    const v = arg ? pick(data, arg) : data;
    console.log(typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? ''));
    break;
  }
  case 'set':
  case 'patch': {
    if (!arg || !existsSync(arg)) fail(`usage: config.mjs ${cmd} <name> <file.json>`);
    const incoming = JSON.parse(readFileSync(arg, 'utf8'));
    save(name, cmd === 'set' ? incoming : merge(read(name).data, incoming));
    break;
  }
  case 'preset': {
    const dir = join(REPO, 'presets', 'sources');
    const file = join(dir, `${name}.yaml`);
    if (!existsSync(file)) fail(`unknown preset "${name}". Available: ${readdirSync(dir).map((f) => f.replace('.yaml', '')).join(', ')}`);
    const extra = YAML.parse(readFileSync(file, 'utf8')).sources;
    const data = read('sources').data;
    const have = new Set((data.sources ?? []).map((s) => s.id));
    data.sources = [...(data.sources ?? []), ...extra.filter((s) => !have.has(s.id))];
    save('sources', data);
    break;
  }
  default:
    fail(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n').replaceAll('// ', ''));
}
