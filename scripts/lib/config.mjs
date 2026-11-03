// Shared config core for every mode (UI, CLI setup, Claude via scripts/config.mjs).
// Edits are applied node-by-node to the parsed YAML document, so comments and
// fields we don't know about survive any write.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import YAML, { isMap, isScalar, isSeq } from 'yaml';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const NAMES = ['profile', 'sources', 'tools', 'rubric', 'run'];
// One output style everywhere: no line folding, compact flow lists — so saves don't reformat untouched lines.
export const YAML_OUT = { lineWidth: 0, flowCollectionPadding: false };

// POCSCOUT_ROOT lets tests (and global installs) point at another working copy.
export const root = () => process.env.POCSCOUT_ROOT || REPO;
export const configPath = (name) => join(root(), 'config', `${name}.yaml`);
export const examplePath = (name) => join(REPO, 'config', `${name}.example.yaml`);

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = Object.fromEntries(
  NAMES.map((n) => [n, ajv.compile(JSON.parse(readFileSync(join(REPO, 'schema', `${n}.schema.json`), 'utf8')))]),
);

function checkName(name) {
  if (!NAMES.includes(name)) throw new Error(`Unknown config "${name}". Use one of: ${NAMES.join(', ')}`);
}

export const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Human-readable validation. Returns [] when valid. */
export function validate(name, data) {
  checkName(name);
  const v = validators[name];
  if (v(data)) return [];
  return v.errors.map((e) => {
    const where = e.instancePath ? e.instancePath.slice(1).replaceAll('/', ' → ') : name;
    if (e.keyword === 'required') return `${where}: "${e.params.missingProperty}" is required`;
    if (e.keyword === 'enum') return `${where}: must be one of ${e.params.allowedValues.join(', ')}`;
    if (e.keyword === 'pattern') return `${where}: has the wrong format`;
    return `${where}: ${e.message}`;
  });
}

/** Read a config file. Missing file → empty text, exists: false. */
export function read(name) {
  checkName(name);
  const p = configPath(name);
  const text = existsSync(p) ? readFileSync(p, 'utf8') : '';
  const doc = YAML.parseDocument(text);
  return { text, doc, data: doc.toJS() ?? {}, hash: hash(text), exists: existsSync(p) };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keyOf = (pair) => (isScalar(pair.key) ? pair.key.value : pair.key);

// Make the node at `path` equal to `value`, touching only what differs.
function sync(doc, path, value) {
  const node = path.length ? doc.getIn(path, true) : doc.contents;
  // An empty `[]` / `{}` in the file is flow style; filling it keeps that style and produces an
  // unreadable one-line blob — switch to normal block style once it gets content.
  const filling = (isObj(value) && Object.keys(value).length) || (Array.isArray(value) && value.length);
  if ((isMap(node) || isSeq(node)) && node.flow && node.items.length === 0 && filling) node.flow = false;
  if (isObj(value) && isMap(node)) {
    for (const [k, v] of Object.entries(value)) {
      if (node.has(k)) sync(doc, [...path, k], v);
      else node.set(k, doc.createNode(v));
    }
    for (const pair of [...node.items]) if (!(keyOf(pair) in value)) node.delete(keyOf(pair));
  } else if (Array.isArray(value) && isSeq(node)) {
    value.forEach((v, i) => (i < node.items.length ? sync(doc, [...path, i], v) : node.add(doc.createNode(v))));
    node.items.length = Math.min(node.items.length, value.length);
  } else if (isScalar(node) && !isObj(value) && !Array.isArray(value)) {
    if (node.value !== value) node.value = value;
  } else if (path.length) {
    doc.setIn(path, doc.createNode(value));
  } else {
    doc.contents = doc.createNode(value);
  }
}

/** Text the file would have after applying `data`, plus validation errors. */
export function render(name, data) {
  const { doc, text } = read(name);
  if (!doc.contents) doc.contents = doc.createNode({});
  sync(doc, [], data);
  return { before: text, after: doc.toString(YAML_OUT), errors: validate(name, data) };
}

/**
 * Write `data` to config/<name>.yaml.
 * baseHash (optional) must match the file on disk — protects edits made by
 * another mode since the caller last read it.
 */
export function write(name, data, baseHash) {
  const cur = read(name);
  if (baseHash && baseHash !== cur.hash) {
    const err = new Error(`config/${name}.yaml changed on disk since you opened it. Reload to see the latest version.`);
    err.code = 'CONFLICT';
    throw err;
  }
  const { after, errors } = render(name, data);
  if (errors.length) {
    const err = new Error(errors.join('\n'));
    err.code = 'INVALID';
    err.errors = errors;
    throw err;
  }
  mkdirSync(dirname(configPath(name)), { recursive: true });
  writeFileSync(configPath(name), after);
  return hash(after);
}

/** Create missing config files from the examples. Never overwrites. */
export function init() {
  const created = [];
  for (const n of NAMES) {
    if (!existsSync(configPath(n))) {
      mkdirSync(dirname(configPath(n)), { recursive: true });
      copyFileSync(examplePath(n), configPath(n));
      created.push(n);
    }
  }
  return created;
}

/** Minimal line diff (LCS) for "what will change" previews. */
export function diff(before, after) {
  const a = before.split('\n'), b = after.split('\n');
  const m = a.length, n = b.length;
  const L = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { i++; j++; }
    else if (j < n && (i >= m || L[i][j + 1] >= L[i + 1][j])) out.push(`+ ${b[j++]}`);
    else out.push(`- ${a[i++]}`);
  }
  return out;
}

/** Get a value by dotted path, e.g. get(data, 'schedule.hour'). */
export const pick = (data, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), data);

export { YAML, readFileSync, writeFileSync };
