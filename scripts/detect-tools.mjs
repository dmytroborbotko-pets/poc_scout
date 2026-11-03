#!/usr/bin/env node
// Set tools[].installed from each tool's "detect" block (commands on PATH or existing paths).
// Tools without "detect" keep their hand-set value. Comments in tools.yaml are kept.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, write } from './lib/config.mjs';

const onPath = (cmd) => (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, cmd)));
const expand = (p) => p.replace(/^~(?=\/)/, homedir());

export function detect(tool) {
  if (!tool.detect) return tool.installed;
  const { commands = [], paths = [] } = tool.detect;
  return commands.some(onPath) || paths.some((p) => existsSync(expand(p)));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const { data, exists } = read('tools');
  if (!exists) { console.error('config/tools.yaml missing — run: node scripts/config.mjs init'); process.exit(1); }
  for (const t of data.tools) t.installed = detect(t);
  write('tools', data);
  for (const t of data.tools) console.log(`${t.installed ? '✓' : '·'} ${t.name}`);
}
