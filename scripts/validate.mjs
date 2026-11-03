#!/usr/bin/env node
// Validate examples, presets and (if present) your real configs against schema/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMES, REPO, YAML, configPath, examplePath, validate } from './lib/config.mjs';

const checks = [
  ...NAMES.map((n) => [n, examplePath(n)]),
  ...readdirSync(join(REPO, 'presets', 'sources')).map((f) => ['sources', join(REPO, 'presets', 'sources', f)]),
  ...NAMES.filter((n) => existsSync(configPath(n))).map((n) => [n, configPath(n)]),
];

let bad = 0;
for (const [name, file] of checks) {
  const rel = file.replace(`${REPO}/`, '');
  let errors;
  try {
    errors = validate(name, YAML.parse(readFileSync(file, 'utf8')) ?? {});
  } catch (e) {
    errors = [`YAML syntax: ${e.message.split('\n')[0]}`];
  }
  console.log(errors.length ? `✗ ${rel}\n    ${errors.join('\n    ')}` : `✓ ${rel}`);
  bad += errors.length ? 1 : 0;
}
process.exit(bad ? 1 : 0);
