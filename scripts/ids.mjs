#!/usr/bin/env node
// Stable idea ids + dedup against state/seen.json. LLMs can't hash reliably, so agents call this.
//   node scripts/ids.mjs inbox <raw.json> <out.json>   add ids, drop already-seen and duplicate ideas
//   node scripts/ids.mjs seen <decisions.json>         record [{id,title,source_id,decision,reason}]
//   node scripts/ids.mjs selftest
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './lib/config.mjs';

export const SEEN = () => join(root(), 'state', 'seen.json');

export const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const ideaId = (sourceId, title) => createHash('sha256').update(`${norm(sourceId)}|${norm(title)}`).digest('hex');
// Fetchers sometimes cut titles with "…" — compare without the tail.
const stem = (t) => norm(t).replace(/[.…]+$/u, '').trim();

const load = (p, dflt) => (existsSync(p) && readFileSync(p, 'utf8').trim() ? JSON.parse(readFileSync(p, 'utf8')) : dflt);
const save = (p, d) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`); };

// Same source and one title is a prefix of the other (min 20 chars) → same idea.
// ponytail: linear scan over known titles; fine up to ~10k ideas, index by source_id beyond that.
function truncatedMatch(sourceId, title, known) {
  const s = stem(title), src = norm(sourceId);
  return known.some(([ks, kt]) => ks === src && Math.min(s.length, kt.length) >= 20 && (s.startsWith(kt) || kt.startsWith(s)));
}

export function inbox(rawPath, outPath, seenPath = SEEN()) {
  const seen = load(seenPath, {});
  const known = Object.values(seen).map((v) => [norm(v.source_id ?? ''), stem(v.title ?? '')]);
  const out = new Map();
  let skipped = 0;
  for (const idea of load(rawPath, [])) {
    const id = ideaId(idea.source_id, idea.title);
    if (seen[id] || out.has(id) || truncatedMatch(idea.source_id, idea.title, known)) { skipped++; continue; }
    out.set(id, { id, ...idea });
    known.push([norm(idea.source_id), stem(idea.title)]);
  }
  save(outPath, [...out.values()]);
  return { added: out.size, skipped };
}

export function markSeen(decisionsPath, seenPath = SEEN()) {
  const seen = load(seenPath, {});
  const date = new Date().toISOString().slice(0, 10);
  for (const d of load(decisionsPath, [])) {
    seen[d.id] = { title: d.title, source_id: d.source_id, decision: d.decision, reason: d.reason ?? null, date };
  }
  save(seenPath, seen);
  return Object.keys(seen).length;
}

export function selftest() {
  const assert = (c, m) => { if (!c) throw new Error(`selftest failed: ${m}`); };
  assert(ideaId('yc-rfs', '  Robots  Made in AMERICA ') === ideaId('YC-RFS', 'robots made in america'), 'normalization');
  const d = mkdtempSync(join(tmpdir(), 'pocscout-ids-'));
  try {
    const seen = join(d, 'seen.json'), raw = join(d, 'raw.json'), out = join(d, 'out.json'), dec = join(d, 'dec.json');
    save(raw, [{ source_id: 'a', title: 'X' }, { source_id: 'a', title: 'x ' }, { source_id: 'b', title: 'X' }]);
    let r = inbox(raw, out, seen);
    assert(r.added === 2 && r.skipped === 1, 'first run dedups within batch');
    save(dec, load(out, []).map((x) => ({ id: x.id, title: x.title, source_id: x.source_id, decision: 'rejected' })));
    assert(markSeen(dec, seen) === 2, 'markSeen count');
    r = inbox(raw, out, seen);
    assert(r.added === 0 && r.skipped === 3, 'second run adds nothing');
    save(dec, [{ id: 't', title: 'Grant programme up to 8 million…', source_id: 'b1', decision: 'accepted' }]);
    markSeen(dec, seen);
    save(raw, [
      { source_id: 'b1', title: 'Grant programme up to 8 million for prosthetics makers' },
      { source_id: 'other', title: 'Grant programme up to 8 million for prosthetics makers' },
      { source_id: 'b1', title: 'Grant' },
    ]);
    r = inbox(raw, out, seen);
    assert(r.added === 2 && r.skipped === 1, 'truncated title in same source is a duplicate; other source and short title are new');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
  return 'selftest ok';
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'inbox' && a && b) { const r = inbox(a, b); console.log(`new=${r.added} skipped=${r.skipped}`); }
  else if (cmd === 'seen' && a) console.log(`seen_total=${markSeen(a)}`);
  else if (cmd === 'selftest') console.log(selftest());
  else { console.error('usage: ids.mjs inbox <raw.json> <out.json> | seen <decisions.json> | selftest'); process.exit(1); }
}
