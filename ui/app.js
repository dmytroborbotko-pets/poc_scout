// PoC Scout configurator — vanilla JS, no build step.
// Edits the same config/*.yaml files as the CLI and hand edits; the server keeps comments.
'use strict';

const OS = /Mac/i.test(navigator.platform) ? 'macos' : 'linux';
const SECTIONS = ['interests', 'sources', 'tools', 'rubric', 'schedule', 'reports'];
const SECTION_CONFIG = { interests: 'profile', sources: 'sources', tools: 'tools', rubric: 'rubric', schedule: 'run' };
let T = {}; // i18n strings
let cfg = {}; // { name: { data, hash, exists } }
let presets = [];
let actions = {};
let current = location.hash.slice(1) || 'interests';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const t = (k, vars = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value' || (k in e && typeof v !== 'string')) e[k] = v; // textarea ignores the value attribute
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-PocScout': '1' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}
const field = (label, hint, input) => el('label', { class: 'field' }, el('span', {}, label), hint && el('div', { class: 'hint' }, hint), input);
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `item-${Date.now()}`;
const lines = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);

function modal(content, { okText, cancel = true } = {}) {
  const d = $('#modal');
  $('#modal-body').replaceChildren(content);
  $('#modal-ok').textContent = okText ?? t('btn_confirm');
  $('#modal-cancel').classList.toggle('hidden', !cancel);
  d.showModal();
  return new Promise((ok) => {
    const done = (v) => { d.close(); $('#modal-ok').onclick = $('#modal-cancel').onclick = null; ok(v); };
    $('#modal-ok').onclick = () => done(true);
    $('#modal-cancel').onclick = () => done(false);
    d.oncancel = () => done(false);
  });
}

// Minimal, escaping markdown renderer for reports (report text may quote web pages — never trust it as HTML).
function markdown(src) {
  const box = el('div', { class: 'report' });
  const inline = (s) => {
    const frag = document.createDocumentFragment();
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
    let last = 0;
    for (const m of s.matchAll(re)) {
      frag.append(s.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith('**')) frag.append(el('strong', {}, tok.slice(2, -2)));
      else if (tok.startsWith('`')) frag.append(el('code', {}, tok.slice(1, -1)));
      else {
        const [, text, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
        frag.append(/^https?:\/\//.test(href) ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text) : text);
      }
      last = m.index + tok.length;
    }
    frag.append(s.slice(last));
    return frag;
  };
  const body = src.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (fm) box.append(el('pre', {}, fm[1]));
  let list = null, table = null;
  for (const line of body.split('\n')) {
    if (/^\|/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      table ??= box.appendChild(el('table'));
      table.append(el('tr', {}, line.slice(1, -1).split('|').map((c) => el('td', {}, inline(c.trim())))));
      continue;
    }
    table = null;
    if (/^\s*[-*] /.test(line)) { list ??= box.appendChild(el('ul')); list.append(el('li', {}, inline(line.replace(/^\s*[-*] /, '')))); continue; }
    list = null;
    const h = line.match(/^(#{1,3}) (.*)/);
    if (h) box.append(el(`h${h[1].length}`, {}, inline(h[2])));
    else if (line.trim()) box.append(el('p', {}, inline(line)));
  }
  return box;
}

// ---------- saving ----------
const status = {};
let previewTimer;
function changed(name) {
  status[name] = 'dirty';
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => preview(name), 400);
  renderSaveBar(name);
}
async function preview(name) {
  const r = await api('POST', `/api/preview/${name}`, { data: cfg[name].data, hash: cfg[name].hash });
  status[`${name}:errors`] = r.errors;
  renderSaveBar(name);
  return r;
}
async function save(name) {
  const r = await preview(name);
  if (r.errors.length) return;
  const diffBox = el('pre', {}, r.diff.length ? r.diff.map((l) => el('div', { class: l.startsWith('+') ? 'diff-add' : 'diff-del' }, l)) : t('no_changes'));
  const ok = await modal(el('div', {}, el('h3', {}, t('confirm_save', { file: `config/${name}.yaml` })), r.stale ? el('p', { class: 'errors' }, t('stale')) : '', diffBox));
  if (!ok) return;
  try {
    cfg[name].hash = (await api('PUT', `/api/config/${name}`, { data: cfg[name].data, hash: cfg[name].hash })).hash;
    status[name] = 'saved';
  } catch (e) {
    status[`${name}:errors`] = e.data?.errors ?? [e.message];
  }
  renderSaveBar(name);
}
function saveBar(name) {
  return el('div', { class: 'save-bar', id: `bar-${name}` });
}
function renderSaveBar(name) {
  const bar = document.getElementById(`bar-${name}`);
  if (!bar) return;
  const errs = status[`${name}:errors`] ?? [];
  bar.replaceChildren(
    el('button', { class: 'primary', onclick: () => save(name), disabled: errs.length > 0 }, t('btn_save')),
    el('span', { class: 'state' }, errs.length ? t('fix_errors') : status[name] === 'dirty' ? t('unsaved') : status[name] === 'saved' ? t('saved') : ''),
  );
  bar.nextElementSibling?.classList.contains('errors') && bar.nextElementSibling.remove();
  if (errs.length) bar.after(el('ul', { class: 'errors' }, errs.map((e) => el('li', {}, e))));
}

// ---------- jobs (Claude-backed and local actions) ----------
async function runAction(action) {
  const info = actions[action];
  if (info?.claude) {
    const d = info.describe ?? {};
    const ok = await modal(el('div', {},
      el('h3', {}, t(`confirm_${action}`)),
      el('p', {}, t('claude_runs_with')),
      el('ul', {},
        el('li', {}, t('budget'), ': $', String(d.budget_usd)),
        el('li', {}, t('permission_mode'), ': ', el('code', {}, d.permission_mode)),
        el('li', {}, t('allowed_tools'), ': ', d.allowedTools?.map((x) => el('code', {}, x, ' ')))),
      el('p', { class: 'hint' }, t('claude_note'))), { okText: t('btn_run') });
    if (!ok) return;
  }
  let job;
  try { job = await api('POST', `/api/action/${action}`); } catch (e) { return alertBox(e.message); }
  $('#job').classList.remove('hidden');
  $('#job-title').textContent = t(`job_${action}`);
  const poll = async () => {
    job = await api('GET', `/api/job/${job.id}`);
    $('#job-log').textContent = job.log || t('working');
    $('#job-log').scrollTop = 1e9;
    if (job.exit === null) return setTimeout(poll, 1500);
    $('#job-title').textContent = `${t(`job_${action}`)} — ${job.exit === 0 ? t('done') : t('failed', { code: job.exit })}`;
    await load();
  };
  poll();
}
const alertBox = (msg) => modal(el('p', {}, msg), { okText: t('btn_close'), cancel: false });

// ---------- sections ----------
function interests() {
  const p = cfg.profile.data;
  p.interests ??= { priority: [], excluded: [] };
  p.custom_axes ??= [];
  const list = (key) => el('textarea', { value: (p.interests[key] ?? []).join('\n'), oninput: (e) => { p.interests[key] = lines(e.target.value); changed('profile'); } });
  const axes = el('div');
  const drawAxes = () => axes.replaceChildren(
    el('table', {}, el('tr', {}, el('th', {}, t('axis_name')), el('th', {}, t('axis_question')), el('th', {}, t('axis_on')), el('th', {}, t('axis_counts')), el('th')),
      p.custom_axes.map((a, i) => el('tr', {},
        el('td', {}, el('input', { type: 'text', value: a.name, oninput: (e) => { a.name = e.target.value; changed('profile'); } })),
        el('td', {}, el('input', { type: 'text', value: a.question, placeholder: t('axis_question_placeholder'), oninput: (e) => { a.question = e.target.value; changed('profile'); } })),
        el('td', {}, el('input', { type: 'checkbox', checked: a.enabled, onchange: (e) => { a.enabled = e.target.checked; changed('profile'); } })),
        el('td', {}, el('input', { type: 'checkbox', checked: a.affects_selection, onchange: (e) => { a.affects_selection = e.target.checked; changed('profile'); } })),
        el('td', {}, el('button', { class: 'small', onclick: () => { p.custom_axes.splice(i, 1); changed('profile'); drawAxes(); } }, '✕'))))),
    el('button', { class: 'small', onclick: () => { p.custom_axes.push({ name: 'my_axis', question: '', enabled: true, affects_selection: false }); changed('profile'); drawAxes(); } }, t('add_axis')),
    el('div', { class: 'hint legend' }, t('axis_legend').split('\n').map((l) => el('p', {}, l))));
  drawAxes();
  return [
    field(t('report_language'), t('report_language_hint'), el('input', { type: 'text', value: p.report_language ?? 'en', oninput: (e) => { p.report_language = e.target.value.trim(); changed('profile'); } })),
    field(t('priority'), t('priority_hint'), list('priority')),
    field(t('excluded'), t('excluded_hint'), list('excluded')),
    field(t('exceptions'), t('exceptions_hint'), list('exceptions')),
    field(t('custom_axes'), t('custom_axes_hint'), axes),
    saveBar('profile'),
  ];
}

function sources() {
  const s = cfg.sources.data;
  s.sources ??= [];
  const table = el('div');
  const draw = () => table.replaceChildren(el('table', {},
    el('tr', {}, el('th', {}, t('on')), el('th', {}, t('source')), el('th', {}, t('status')), el('th', {}, t('last_update')), el('th')),
    s.sources.map((src, i) => el('tr', {},
      el('td', {}, el('input', { type: 'checkbox', checked: src.enabled, onchange: (e) => { src.enabled = e.target.checked; changed('sources'); } })),
      el('td', {}, el('div', {}, src.name), el('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer', class: 'hint' }, src.url), src.notes ? el('div', { class: 'hint' }, src.notes) : ''),
      el('td', {}, el('span', { class: `badge ${src.status ?? 'unverified'}` }, t(`status_${src.status ?? 'unverified'}`))),
      el('td', {}, src.last_seen_update ?? '—', src.date_source ? el('div', { class: 'hint' }, src.date_source) : '', src.last_verified ? el('div', { class: 'hint' }, t('checked_on', { date: src.last_verified })) : ''),
      el('td', {}, el('button', { class: 'small', onclick: () => { s.sources.splice(i, 1); changed('sources'); draw(); } }, '✕'))))));
  draw();
  const presetSel = el('select', {}, presets.map((p) => el('option', { value: p.name }, `${p.name} (${p.sources.length})`)));
  const addPreset = () => {
    const have = new Set(s.sources.map((x) => x.id));
    s.sources.push(...structuredClone(presets.find((p) => p.name === presetSel.value).sources.filter((x) => !have.has(x.id))));
    changed('sources'); draw();
  };
  const name = el('input', { type: 'text', placeholder: t('source_name') });
  const url = el('input', { type: 'url', placeholder: 'https://…' });
  const addUrl = () => {
    if (!/^https?:\/\//.test(url.value)) return alertBox(t('bad_url'));
    s.sources.push({ id: slug(name.value || new URL(url.value).hostname), name: name.value || new URL(url.value).hostname, url: url.value, access: 'html', status: 'unverified', last_verified: null, last_seen_update: null, enabled: false, notes: t('new_source_note') });
    name.value = url.value = '';
    changed('sources'); draw();
  };
  return [
    el('p', { class: 'hint' }, t('sources_rules')),
    table,
    el('div', { class: 'row' }, field(t('add_preset'), '', presetSel), el('button', { onclick: addPreset }, t('btn_add'))),
    el('div', { class: 'row' }, field(t('source_name'), '', name), field(t('add_url'), '', url), el('button', { onclick: addUrl }, t('btn_add'))),
    el('div', { class: 'row' }, el('button', { onclick: () => runAction('verify') }, t('btn_verify'))),
    saveBar('sources'),
  ];
}

function tools() {
  const list = cfg.tools.data.tools ?? [];
  return [
    el('p', { class: 'hint' }, t('tools_hint')),
    el('button', { onclick: () => runAction('detect-tools') }, t('btn_detect')),
    el('table', {}, el('tr', {}, el('th', {}, t('tool')), el('th', {}, t('installed')), el('th', {}, t('install_cmd'))),
      list.map((x) => el('tr', {},
        el('td', {}, el('div', {}, x.name), el('div', { class: 'hint' }, `${x.domain} · ${x.control}`), x.can_simulate ? el('div', { class: 'hint' }, x.can_simulate) : ''),
        el('td', {}, el('span', { class: `badge ${x.installed ? 'yes' : 'no'}` }, x.installed ? t('yes') : t('no'))),
        el('td', {}, x.installed ? '' : el('code', {}, x.install_cmd?.[OS] ?? '—'))))),
  ];
}

function rubric() {
  const r = cfg.rubric.data;
  const rules = el('div');
  const draw = () => rules.replaceChildren(el('table', {},
    el('tr', {}, el('th', {}, t('on')), el('th', {}, t('rule')), el('th')),
    r.no_go.map((g, i) => el('tr', {},
      el('td', {}, el('input', { type: 'checkbox', checked: g.enabled, onchange: (e) => { g.enabled = e.target.checked; changed('rubric'); } })),
      el('td', {}, el('input', { type: 'text', value: g.text, oninput: (e) => { g.text = e.target.value; changed('rubric'); } })),
      el('td', {}, el('button', { class: 'small', onclick: () => { r.no_go.splice(i, 1); changed('rubric'); draw(); } }, '✕'))))),
  el('button', { class: 'small', onclick: () => { r.no_go.push({ id: `custom-${r.no_go.length + 1}`, text: t('new_rule'), enabled: true }); changed('rubric'); draw(); } }, t('add_rule')));
  draw();
  const num = (obj, key, min, max) => el('input', { type: 'number', min, max, step: 'any', value: obj[key], oninput: (e) => { obj[key] = Number(e.target.value); changed('rubric'); } });
  return [
    field(t('tool_first'), t('tool_first_hint'), el('select', { onchange: (e) => { r.tool_first = e.target.value; changed('rubric'); } },
      ['suggest', 'strict'].map((v) => el('option', { value: v, selected: r.tool_first === v }, t(`tool_first_${v}`))))),
    field(t('max_days'), t('max_days_hint'), num(r, 'max_poc_days', 1, 60)),
    field(t('no_go'), t('no_go_hint'), rules),
    field(t('weights'), t('weights_hint'), el('div', { class: 'row' }, Object.entries(r.scores).map(([k, v]) => field(t(`score_${k}`) === `score_${k}` ? k : t(`score_${k}`), '', num(v, 'weight', 0, 5))))),
    el('div', { class: 'row' }, field(t('top_n'), t('top_n_hint'), num(r.selection, 'top_n', 1, 50)), field(t('min_sum'), t('min_sum_hint'), num(r.selection, 'min_sum', 0))),
    saveBar('rubric'),
  ];
}

function schedule() {
  const run = cfg.run.data;
  const s = run.schedule;
  const num = (key, min, max) => el('input', { type: 'number', min, max, value: s[key] ?? min, oninput: (e) => { s[key] = Number(e.target.value); changed('run'); } });
  return [
    field(t('schedule_on'), t('schedule_hint'), el('input', { type: 'checkbox', checked: s.enabled, onchange: (e) => { s.enabled = e.target.checked; changed('run'); } })),
    el('div', { class: 'row' },
      field(t('frequency'), '', el('select', { onchange: (e) => { s.frequency = e.target.value; changed('run'); } }, ['monthly', 'weekly'].map((v) => el('option', { value: v, selected: s.frequency === v }, t(v))))),
      field(t('day_of_month'), '', num('day_of_month', 1, 28)),
      field(t('weekday'), t('weekday_hint'), num('weekday', 0, 6)),
      field(t('hour'), '', num('hour', 0, 23)),
      field(t('minute'), '', num('minute', 0, 59))),
    el('div', { class: 'row' },
      field(t('budget'), t('budget_hint'), el('input', { type: 'number', min: 0.5, step: 0.5, value: run.budget_usd, oninput: (e) => { run.budget_usd = Number(e.target.value); changed('run'); } })),
      field(t('notify'), '', el('input', { type: 'checkbox', checked: run.notify, onchange: (e) => { run.notify = e.target.checked; changed('run'); } }))),
    saveBar('run'),
    el('p', { class: 'hint' }, t('apply_schedule_hint')),
    el('div', { class: 'row' },
      el('button', { onclick: () => runAction(s.enabled ? 'schedule-install' : 'schedule-uninstall') }, t('btn_apply_schedule')),
      el('button', { onclick: () => runAction('schedule-status') }, t('btn_schedule_status'))),
  ];
}

async function reports() {
  const box = el('div', {}, t('loading'));
  const runs = await api('GET', '/api/reports');
  if (!runs.length) { box.replaceChildren(el('p', { class: 'muted' }, t('no_reports'))); return [box]; }
  const open = async (path) => modal(markdown((await api('GET', `/api/report?path=${encodeURIComponent(path)}`)).text), { okText: t('btn_close'), cancel: false });
  box.replaceChildren(...runs.map((r) => el('div', {},
    el('h3', {}, r.tag, ' ', r.overview ? el('button', { class: 'small', onclick: () => open(r.overview) }, t('overview')) : ''),
    el('table', {}, r.reports.map((x) => el('tr', {},
      el('td', {}, el('a', { href: '#reports', onclick: (e) => { e.preventDefault(); open(x.path); } }, x.title)),
      el('td', {}, x.days ? t('days', { n: x.days }) : ''),
      el('td', {}, el('select', { onchange: async (e) => { await api('POST', '/api/report-status', { path: x.path, status: e.target.value }); } },
        ['new', 'in-progress', 'done'].map((v) => el('option', { value: v, selected: x.status === v }, t(`st_${v}`))))),
      el('td', {}, el('button', { class: 'small', onclick: async () => {
        const cmd = `claude "/poc-build reports/${x.path}"`;
        await navigator.clipboard?.writeText(cmd).catch(() => {});
        alertBox(t('copied', { cmd }));
      } }, t('btn_copy_build')))))))));
  return [el('p', { class: 'hint' }, t('reports_hint')), box];
}

const RENDER = { interests, sources, tools, rubric, schedule, reports };

async function render() {
  $('#nav').replaceChildren(...SECTIONS.map((s) => el('a', { href: `#${s}`, class: s === current ? 'active' : '' }, t(`nav_${s}`))));
  const name = SECTION_CONFIG[current];
  const sec = el('section', {}, el('h2', {}, t(`nav_${current}`)), el('p', { class: 'hint' }, t(`desc_${current}`)));
  if (name && !cfg[name]?.exists) sec.append(el('p', { class: 'errors' }, t('missing_config', { file: `config/${name}.yaml` })));
  sec.append(...await RENDER[current]());
  $('#main').replaceChildren(sec);
  if (name) renderSaveBar(name);
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
}

async function load() {
  [cfg, presets, actions] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/presets'), api('GET', '/api/actions')]);
  await render();
}

async function setLang(lang) {
  T = await (await fetch(`/i18n/${lang}.json`)).json();
  document.documentElement.lang = lang;
  try { localStorage.setItem('pocscout-lang', lang); } catch { /* storage may be blocked */ }
  $('#lang').value = lang;
}

window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (SECTIONS.includes(next)) { current = next; render(); }
});
$('#lang').addEventListener('change', async (e) => { await setLang(e.target.value); render(); });
document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => runAction(b.dataset.action)));
$('#job-close').addEventListener('click', () => $('#job').classList.add('hidden'));

(async () => {
  let lang = 'en';
  try { lang = localStorage.getItem('pocscout-lang') || (navigator.language.startsWith('uk') ? 'uk' : 'en'); } catch { /* ignore */ }
  await setLang(lang);
  await load();
})();
