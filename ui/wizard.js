// First-run setup funnel: one question per screen, saved after every step.
// Uses the same files and API as the regular UI (helpers from app.js: el, t, api, cfg, ...).
'use strict';

const WIZ_STEPS = ['welcome', 'interests', 'excluded', 'sources', 'selection', 'schedule', 'done'];
const LANGS = { en: 'English', uk: 'Українська', de: 'Deutsch', fr: 'Français', es: 'Español', pl: 'Polski' };
let wizErr = '';

async function wizSave(name, data) {
  try {
    cfg[name].hash = (await api('PUT', `/api/config/${name}`, { data, hash: cfg[name].hash })).hash;
    cfg[name].data = data;
    cfg[name].orig = structuredClone(data);
    return true;
  } catch (e) {
    wizErr = e.status === 409 ? t('wz_err_conflict') : (e.data?.errors ?? [e.message]).join('\n');
    if (e.status === 409) await load();
    return false;
  }
}
async function wizGo(step, extra = {}) {
  wizard.step = step;
  await api('PUT', '/api/wizard', { step, ...extra });
  render();
  window.scrollTo(0, 0);
}
async function wizExit(markDone) {
  await api('PUT', '/api/wizard', { step: wizard.step, done: markDone, skipped: !markDone });
  wizard.active = false;
  location.hash = 'interests';
  render();
}

// Clickable example chips that append to a textarea.
function chips(list, area, onChange) {
  return el('div', { class: 'chips' }, list.split(',').map((x) => x.trim()).filter(Boolean).map((x) => el('button', {
    class: 'chip', type: 'button',
    onclick: () => { const have = lines(area.value); if (!have.includes(x)) { area.value = [...have, x].join(', '); onChange(); } },
  }, `+ ${x}`)));
}

function listStep(key, examplesKey) {
  const p = structuredClone(cfg.profile.data);
  p.interests ??= { priority: [], excluded: [] };
  const area = el('textarea', { value: (p.interests[key] ?? []).join(', '), rows: 3 });
  const sync = () => { p.interests[key] = lines(area.value); };
  area.addEventListener('input', sync);
  return {
    body: [area, el('p', { class: 'hint' }, t('wz_examples')), chips(t(examplesKey), area, sync)],
    save: () => wizSave('profile', p),
  };
}

const WIZ = {
  welcome() {
    const p = structuredClone(cfg.profile.data);
    const cur = p.report_language ?? 'en';
    const sel = el('select', { onchange: (e) => { p.report_language = e.target.value; } },
      Object.entries({ ...LANGS, ...(LANGS[cur] ? {} : { [cur]: cur }) }).map(([v, n]) => el('option', { value: v, selected: v === cur }, n)));
    return {
      body: [
        el('ul', { class: 'facts' }, ['wz_w1', 'wz_w2', 'wz_w3', 'wz_w4'].map((k) => el('li', {}, t(k)))),
        field(t('report_language'), t('wz_lang_hint'), sel),
      ],
      save: () => wizSave('profile', p),
    };
  },
  interests: () => listStep('priority', 'wz_interest_examples'),
  excluded: () => listStep('excluded', 'wz_excluded_examples'),

  sources() {
    const s = structuredClone(cfg.sources.data);
    s.sources ??= [];
    const byId = new Map(s.sources.map((x) => [x.id, x]));
    const chosen = new Set(s.sources.filter((x) => x.enabled).map((x) => x.id));
    const added = [];
    // Popular set first; a source shared by several presets is shown once, under the first one.
    const ordered = [...presets].sort((a, b) => (a.name === 'general-startups' ? -1 : b.name === 'general-startups' ? 1 : a.name.localeCompare(b.name)));
    const shown = new Set();
    const groups = ordered.map((p) => ({ p, list: p.sources.filter((x) => !shown.has(x.id) && shown.add(x.id)) })).filter((g) => g.list.length).map(({ p, list }) => el('div', { class: 'preset' },
      el('strong', {}, t(`wz_preset_${p.name}`) === `wz_preset_${p.name}` ? p.name : t(`wz_preset_${p.name}`)),
      list.map((src) => el('label', { class: 'check' },
        el('input', { type: 'checkbox', checked: chosen.has(src.id), onchange: (e) => (e.target.checked ? chosen.add(src.id) : chosen.delete(src.id)) }),
        el('span', {}, src.name, ' ', el('span', { class: `badge ${src.status}` }, t(`status_${src.status}`)),
          src.status !== 'recommended' ? el('span', { class: 'hint' }, ` — ${t('wz_unverified_note')}`) : '')))));
    const url = el('input', { type: 'url', placeholder: 'https://…' });
    const mine = el('ul', { class: 'hint' });
    const addUrl = () => {
      if (!/^https?:\/\//.test(url.value)) return alertBox(t('bad_url'));
      const host = new URL(url.value).hostname.replace(/^www\./, '');
      added.push({ id: slug(host), name: host, url: url.value, access: 'html', status: 'unverified', last_verified: null, last_seen_update: null, enabled: false, notes: t('new_source_note') });
      mine.append(el('li', {}, `${url.value} — ${t('wz_url_later')}`));
      url.value = '';
    };
    return {
      body: [...groups, el('div', { class: 'field' }, el('strong', {}, t('add_url')), el('div', { class: 'hint' }, t('wz_url_hint')), el('div', { class: 'row' }, url, el('button', { type: 'button', onclick: addUrl }, t('btn_add')))), mine],
      save: () => {
        for (const p of presets) for (const src of p.sources) {
          if (chosen.has(src.id) && !byId.has(src.id)) { const c = structuredClone(src); s.sources.push(c); byId.set(c.id, c); }
          if (byId.has(src.id)) byId.get(src.id).enabled = chosen.has(src.id);
        }
        // A URL that is already in the list (e.g. from a preset) is not added twice.
        for (const a of added) if (!byId.has(a.id) && !s.sources.some((x) => x.url === a.url)) { s.sources.push(a); byId.set(a.id, a); }
        if (!s.sources.some((x) => x.enabled) && !added.length) { wizErr = t('wz_err_no_sources'); return false; }
        return wizSave('sources', s);
      },
    };
  },

  selection() {
    const r = structuredClone(cfg.rubric.data);
    const num = (obj, key, min, max) => el('input', { type: 'number', min, max, value: obj[key], oninput: (e) => { obj[key] = Number(e.target.value); } });
    return {
      body: [
        field(t('max_days'), t('wz_days_hint'), num(r, 'max_poc_days', 1, 60)),
        field(t('top_n'), t('wz_topn_hint'), num(r.selection, 'top_n', 1, 50)),
        field(t('no_go'), t('wz_nogo_hint'), el('div', {}, r.no_go.map((g) => el('label', { class: 'check' },
          el('input', { type: 'checkbox', checked: g.enabled, onchange: (e) => { g.enabled = e.target.checked; } }), el('span', {}, g.text))))),
        el('p', { class: 'hint' }, t('wz_tools_note')),
      ],
      save: () => wizSave('rubric', r),
    };
  },

  schedule() {
    const run = structuredClone(cfg.run.data);
    const s = run.schedule;
    const mode = el('select', {}, ['off', 'monthly', 'weekly'].map((v) => el('option', { value: v, selected: (s.enabled ? s.frequency : 'off') === v }, t(`wz_sched_${v}`))));
    const days = t('wz_weekdays').split(',');
    const when = el('div', { class: 'row' });
    const drawWhen = () => when.replaceChildren(...(mode.value === 'off' ? [] : [
      mode.value === 'monthly'
        ? field(t('day_of_month'), '', el('input', { type: 'number', min: 1, max: 28, value: s.day_of_month ?? 1, oninput: (e) => { s.day_of_month = Number(e.target.value); } }))
        : field(t('weekday'), '', el('select', { onchange: (e) => { s.weekday = Number(e.target.value); } }, days.map((d, i) => el('option', { value: i, selected: (s.weekday ?? 1) === i }, d.trim())))),
      field(t('hour'), '', el('input', { type: 'number', min: 0, max: 23, value: s.hour, oninput: (e) => { s.hour = Number(e.target.value); } })),
    ]));
    mode.addEventListener('change', drawWhen);
    drawWhen();
    return {
      body: [
        field(t('frequency'), t('wz_sched_hint'), mode), when,
        field(t('budget'), t('wz_budget_hint'), el('input', { type: 'number', min: 0.5, step: 0.5, value: run.budget_usd, oninput: (e) => { run.budget_usd = Number(e.target.value); } })),
      ],
      save: () => {
        s.enabled = mode.value !== 'off';
        if (s.enabled) s.frequency = mode.value;
        return wizSave('run', run);
      },
    };
  },

  done() {
    const p = cfg.profile.data, src = cfg.sources.data.sources ?? [], r = cfg.rubric.data, run = cfg.run.data;
    const on = src.filter((x) => x.enabled);
    const pending = src.filter((x) => !x.enabled && x.status === 'unverified' && x.last_verified == null);
    const s = run.schedule;
    const sched = s.enabled
      ? (s.frequency === 'weekly' ? t('wz_sum_weekly', { day: t('wz_weekdays').split(',')[s.weekday ?? 1].trim(), hour: s.hour }) : t('wz_sum_monthly', { day: s.day_of_month ?? 1, hour: s.hour }))
      : t('wz_sum_manual');
    const summary = [
      `${t('report_language')}: ${LANGS[p.report_language] ?? p.report_language}`,
      `${t('priority')}: ${(p.interests?.priority ?? []).join(', ') || t('wz_anything')}`,
      `${t('excluded')}: ${(p.interests?.excluded ?? []).join(', ') || t('val_empty')}`,
      `${t('nav_sources')}: ${on.map((x) => x.name).join(', ') || t('val_empty')}`,
      t('wz_sum_select', { n: r.selection.top_n, days: r.max_poc_days, rules: r.no_go.filter((g) => g.enabled).length }),
      `${t('nav_schedule')}: ${sched} · ${t('wz_sum_budget', { usd: run.budget_usd })}`,
    ];
    return {
      body: [
        el('ul', { class: 'facts' }, summary.map((x) => el('li', {}, x))),
        !trust.trusted ? el('div', { class: 'banner' }, el('strong', {}, t('trust_title')), el('p', {}, t('trust_body')), el('code', {}, `cd "${trust.folder}" && claude`)) : '',
        el('h3', {}, t('wz_next')),
        el('div', { class: 'wz-actions' },
          el('button', { class: 'primary', onclick: () => runAction('scan-small') }, t('wz_first_scan')),
          pending.length ? el('button', { onclick: () => runAction('verify') }, t('wz_check_sources', { n: pending.length })) : '',
          s.enabled ? el('button', { onclick: () => runAction('schedule-install') }, t('wz_turn_on_schedule')) : '',
          el('button', { onclick: () => wizExit(true) }, t('wz_to_settings'))),
        el('p', { class: 'hint' }, t('wz_first_scan_hint')),
      ],
    };
  },
};

async function renderWizard() {
  const i = Math.min(wizard.step, WIZ_STEPS.length - 1);
  const key = WIZ_STEPS[i];
  const step = WIZ[key]();
  if (key === 'done') api('PUT', '/api/wizard', { step: i, done: true });
  const err = el('p', { class: 'errors' }, wizErr);
  wizErr = '';
  const next = async () => {
    if (step.save && !(await step.save())) { err.textContent = wizErr; wizErr = ''; return; }
    wizGo(i + 1);
  };
  const fill = el('div');
  fill.style.width = `${((i + 1) / WIZ_STEPS.length) * 100}%`; // CSSOM, allowed by the page's CSP (style attributes are not)
  $('#main').replaceChildren(el('section', { class: 'wizard' },
    el('div', { class: 'wz-top' },
      el('span', { class: 'hint' }, t('wz_progress', { n: i + 1, total: WIZ_STEPS.length })),
      key !== 'done' ? el('button', { class: 'link', onclick: () => wizExit(false) }, t('wz_skip')) : ''),
    el('div', { class: 'wz-bar' }, fill),
    el('h2', {}, t(`wz_${key}_title`)),
    el('p', { class: 'wz-context' }, t(`wz_${key}_why`)),
    ...step.body,
    err,
    key !== 'done' ? el('div', { class: 'wz-nav' },
      i > 0 ? el('button', { onclick: () => wizGo(i - 1) }, t('wz_back')) : el('span'),
      el('button', { class: 'primary', onclick: next }, i === WIZ_STEPS.length - 2 ? t('wz_finish') : t('wz_next_btn'))) : ''));
}
