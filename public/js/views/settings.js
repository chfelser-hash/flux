// Einstellungen: Arbeitszeit, Jahre, Feiertage, eigene Feiertage, Sicherung, Über Flux. Dazu der erste Start.
import { h, modal, toast, confirmDialog } from '../ui.js';
import { HOLIDAYS, ruleDate, customDate, hm, parseDuration, fmtDays } from '../flux.js';
import { state, api, act, refresh, remove, today } from '../app.js';
import { field, fmtDate, WEEKDAYS, durationInput, saldo } from './shared.js';

const block = (id, title, ...children) => h('section', { class: 'block setup', id: 's-' + id }, h('h2', null, title), ...children);
const numVal = (inp) => { const v = Number(String(inp.value).replace(',', '.')); return inp.value.trim() === '' || !Number.isFinite(v) ? null : v; };

export function renderSettings(main, c) {
  const d = state.data;
  main.replaceChildren(
    h('h1', { class: 'page-title' }, 'Einstellungen'),
    h('nav', { class: 'toc' }, [['zeit', 'Arbeitszeit'], ['jahre', 'Jahre'], ['feiertage', 'Feiertage'], ['sicherung', 'Sicherung'], ['about', 'Über Flux']]
      .map(([id, l]) => h('a', { href: '#einstellungen/' + id, onclick: (e) => { e.preventDefault(); document.getElementById('s-' + id)?.scrollIntoView({ behavior: 'smooth' }); } }, l))),
    workBlock(d),
    yearsBlock(d, c),
    holidayBlock(d),
    backupBlock(),
    about(d));
}

// ---------- Arbeitszeit ----------
function workBlock(d) {
  const st = d.settings;
  const soll = durationInput({ name: 'soll' }, st.sollMin, false);
  const plus = h('input', { name: 'plus', inputmode: 'numeric', value: st.plusMin });
  const saveSoll = () => {
    const m = parseDuration(soll.value);
    if (!m || m <= 0) { toast('Sollzeit bitte als Stunden:Minuten, z.B. 8:24', { error: true }); soll.value = hm(st.sollMin); return; }
    act('PUT', '/api/settings', { sollMin: m }, { done: 'Gespeichert' });
  };
  soll.addEventListener('change', saveSoll);
  plus.addEventListener('change', () => act('PUT', '/api/settings', { plusMin: numVal(plus) ?? 0 }, { done: 'Gespeichert' }));
  const wd = [1, 2, 3, 4, 5, 6, 0].map((i) => h('label', { class: 'wd' },
    h('input', { type: 'checkbox', checked: st.weekdays.includes(i), onchange: (e) => {
      const next = new Set(st.weekdays);
      if (e.target.checked) next.add(i); else next.delete(i);
      act('PUT', '/api/settings', { weekdays: [...next] });
    } }), h('span', null, WEEKDAYS[i])));
  return block('zeit', 'Arbeitszeit',
    h('div', { class: 'form-grid' },
      field('Sollzeit pro Tag', soll, 'Stunden:Minuten'),
      field('Gleitzeit-Aufbau pro Tag', h('div', { class: 'unit' }, plus, h('span', null, 'Minuten')), 'So viel arbeitest du im Schnitt länger.')),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Arbeitstage'), h('div', { class: 'wds' }, wd)));
}

// ---------- Jahre ----------
function yearsBlock(d, c) {
  const keys = Object.keys(d.years).map(Number).sort((a, b) => a - b);
  const val = (fixed, autoVal, render) => (fixed !== null && fixed !== undefined ? h('span', null, render(fixed), h('span', { class: 'muted small' }, ' (fest)')) : h('span', null, render(autoVal), h('span', { class: 'muted small' }, ' (auto)')));
  const rows = keys.map((y, i) => {
    const yc = d.years[y];
    const sum = c.tl.byDate.get(`${y}-01-01`)?.startOfYear;
    return h('li', { class: 'year-row' },
      h('strong', { class: 'year-no' }, String(y)),
      h('dl', null,
        h('div', null, h('dt', null, 'Anspruch'), h('dd', null, `${fmtDays(yc.anspruch)} Tage`)),
        h('div', null, h('dt', null, 'Übertrag Ferien'), h('dd', null, val(yc.startFerien, sum?.uebertrag ?? 0, fmtDays))),
        h('div', null, h('dt', null, 'Gleitzeit am 1.1.'), h('dd', null, val(yc.startGleitMin, sum?.gleit ?? 0, saldo)))),
      h('div', { class: 'year-actions' },
        h('button', { class: 'icon-btn', 'aria-label': `${y} bearbeiten`, onclick: () => yearDialog(y, yc, i === 0) }, '✎'),
        keys.length > 1 && (i === 0 || i === keys.length - 1) ? h('button', { class: 'icon-btn', 'aria-label': `${y} löschen`, onclick: () => deleteYear(y) }, '✕') : null));
  });
  const next = keys[keys.length - 1] + 1;
  return block('jahre', 'Jahre',
    h('p', { class: 'hint' }, 'Am 1. Januar nimmt Flux den Gleitzeit-Saldo und die restlichen Ferientage mit ins neue Jahr. Frühere Jahre bleiben zum Anschauen.'),
    h('ul', { class: 'years' }, rows),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn', onclick: () => yearDialog(next, { anspruch: d.years[next - 1].anspruch, startFerien: null, startGleitMin: null }, false, true) }, `+ Jahr ${next}`),
      h('button', { class: 'btn ghost', onclick: () => yearDialog(keys[0] - 1, { anspruch: d.years[keys[0]].anspruch, startFerien: null, startGleitMin: null }, true, true) }, `+ Jahr ${keys[0] - 1}`)));
}

async function yearDialog(y, yc, first, isNew = false) {
  const anspruch = h('input', { name: 'anspruch', inputmode: 'decimal', value: yc.anspruch });
  const ferien = h('input', { name: 'startFerien', inputmode: 'decimal', value: yc.startFerien ?? '', placeholder: 'automatisch' });
  const gleit = durationInput({ name: 'startGleit', placeholder: 'automatisch' }, yc.startGleitMin);
  const err = h('p', { class: 'form-error', hidden: true });
  await modal(isNew ? `Jahr ${y} hinzufügen` : `Jahr ${y}`, h('div', null,
    field('Ferienanspruch', h('div', { class: 'unit' }, anspruch, h('span', null, 'Tage'))),
    h('p', { class: 'hint' }, first ? 'Leer lassen = Flux rechnet vom ersten eingetragenen Stand zurück. Nur ausfüllen, wenn du die Werte am 1. Januar kennst.' : 'Leer lassen = automatisch vom Vorjahr übernehmen. Nur ausfüllen, wenn der Übertrag anders ist.'),
    h('div', { class: 'form-grid two' }, field('Ferien-Übertrag', ferien, 'Tage'), field('Gleitzeit am 1.1.', gleit, 'Stunden:Minuten')),
    err), [
    { label: 'Abbrechen', value: null },
    {
      label: isNew ? 'Hinzufügen' : 'Speichern', primary: true, onClick: async () => {
        const g = gleit.value.trim() === '' ? null : parseDuration(gleit.value);
        if (gleit.value.trim() !== '' && g === null) { err.textContent = 'Gleitzeit bitte als Stunden:Minuten'; err.hidden = false; return false; }
        const r = await act('PUT', `/api/years/${y}`, { anspruch: numVal(anspruch) ?? 0, startFerien: numVal(ferien), startGleitMin: g }, { done: 'Gespeichert' });
        return r ? true : false;
      },
    },
  ]);
}

async function deleteYear(y) {
  if (!(await confirmDialog(`Jahr ${y} löschen`, `Das Jahr ${y} mit seinen Abwesenheiten und Ständen löschen? Vorher wird automatisch gesichert (tägliche Sicherung).`, 'Löschen', true))) return;
  act('DELETE', `/api/years/${y}`, undefined, { done: 'Gelöscht' });
}

// ---------- Feiertage ----------
function holidayBlock(d) {
  const y = state.year;
  const offSelect = (cur, onChange) => {
    const sel = h('select', { 'aria-label': 'Wie viel frei' },
      h('option', { value: 'full', selected: cur === 'full' }, 'ganzer Tag'),
      h('option', { value: 'half', selected: cur === 'half' }, 'halber Tag'),
      h('option', { value: 'min', selected: typeof cur === 'number' }, 'Stunden …'));
    const hours = durationInput({ class: 'small-input', 'aria-label': 'Stunden frei', hidden: typeof cur !== 'number' }, typeof cur === 'number' ? cur : 240, false);
    sel.addEventListener('change', () => {
      hours.hidden = sel.value !== 'min';
      if (sel.value !== 'min') onChange(sel.value); else onChange(parseDuration(hours.value) || 240);
    });
    hours.addEventListener('change', () => { const m = parseDuration(hours.value); if (m > 0) onChange(m); });
    return h('div', { class: 'off' }, sel, hours);
  };
  const eveInput = (cur, onChange) => {
    const inp = durationInput({ class: 'small-input', placeholder: '–', 'aria-label': 'Vorfeiertag: weniger Sollzeit' }, cur || null, false);
    inp.addEventListener('change', () => { const m = inp.value.trim() === '' ? 0 : parseDuration(inp.value); if (m !== null && m >= 0) onChange(m); else toast('Bitte Stunden:Minuten, z.B. 2:00', { error: true }); });
    return inp;
  };
  const saveHol = (id, patch) => act('PUT', '/api/holidays', { [id]: patch });
  const controls = (off, eve, onOff, onEve, extra = null) => h('div', { class: 'hol-controls' },
    h('label', null, h('span', null, 'Frei'), offSelect(off, onOff)),
    h('label', null, h('span', null, 'Vortag weniger'), eveInput(eve, onEve)),
    extra);
  const rows = HOLIDAYS.map((x) => {
    const cfg = d.holidays[x.id];
    return h('li', { class: 'hol' + (cfg.on ? ' on' : '') },
      h('label', { class: 'hol-head' },
        h('input', { type: 'checkbox', checked: cfg.on, onchange: (e) => saveHol(x.id, { on: e.target.checked }) }),
        h('span', { class: 'hol-name' }, x.name, x.hint ? h('span', { class: 'hint block-hint' }, x.hint) : null),
        h('span', { class: 'hol-date' }, fmtDate(ruleDate(x.rule, y)))),
      cfg.on ? controls(cfg.off, cfg.eveMin, (v) => saveHol(x.id, { off: v }), (v) => saveHol(x.id, { eveMin: v })) : null);
  });
  const custom = d.customHolidays.map((x) => {
    const date = customDate(x.date, y);
    return h('li', { class: 'hol on custom' },
      h('div', { class: 'hol-head' },
        h('span', { class: 'hol-mark', 'aria-hidden': 'true' }, '★'),
        h('span', { class: 'hol-name' }, x.name, h('span', { class: 'hint block-hint' }, /^\d{2}-\d{2}$/.test(x.date) ? 'eigener Feiertag, jedes Jahr' : 'eigener Feiertag, einmalig')),
        h('span', { class: 'hol-date' }, date ? fmtDate(date) : fmtDate(x.date, { year: true }))),
      controls(x.off, x.eveMin, (v) => act('PUT', `/api/custom-holidays/${x.id}`, { off: v }), (v) => act('PUT', `/api/custom-holidays/${x.id}`, { eveMin: v }),
        h('button', { class: 'btn small ghost danger', onclick: () => remove(`/api/custom-holidays/${x.id}`, `«${x.name}»`) }, 'Löschen')));
  });
  return block('feiertage', 'Feiertage',
    h('p', { class: 'hint' }, `Hak an, was bei deinem Arbeitgeber frei ist. Fällt ein Feiertag aufs Wochenende, zählt er nicht. «Vortag weniger» = so viel weniger Sollzeit am Tag davor, z.B. 2:00. Daten für ${y}.`),
    h('ul', { class: 'hol-cfg' }, rows, custom),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.settings.eveOnWeekend, onchange: (e) => act('PUT', '/api/settings', { eveOnWeekend: e.target.checked }) }),
      h('span', null, 'Vorfeiertag gilt auch, wenn der Feiertag auf einen Samstag oder Sonntag fällt')),
    h('button', { class: 'btn', onclick: customDialog }, '+ Eigener Feiertag'));
}

async function customDialog() {
  const name = h('input', { name: 'name', maxlength: 40, placeholder: 'z.B. Firmenjubiläum' });
  const date = h('input', { type: 'date', name: 'date', value: today() });
  const yearly = h('input', { type: 'checkbox', name: 'yearly' });
  const off = h('select', null, h('option', { value: 'full' }, 'ganzer Tag'), h('option', { value: 'half' }, 'halber Tag'));
  await modal('Eigener Feiertag', h('div', null,
    field('Name', name), field('Datum', date),
    h('label', { class: 'check' }, yearly, h('span', null, 'Jedes Jahr am selben Datum')),
    field('Frei', off)), [
    { label: 'Abbrechen', value: null },
    {
      label: 'Hinzufügen', primary: true, onClick: async () => {
        const r = await act('POST', '/api/custom-holidays', { name: name.value, date: yearly.checked ? date.value.slice(5) : date.value, off: off.value }, { done: 'Hinzugefügt' });
        return r ? true : false;
      },
    },
  ]);
}

// ---------- Sicherung ----------
function backupBlock() {
  const list = h('ul', { class: 'backups' });
  const loadList = async () => {
    try {
      const { backups } = await api('GET', '/api/backups');
      list.replaceChildren(...backups.slice(0, 15).map((b) => h('li', null,
        h('span', { class: 'grow' }, b.name),
        h('a', { class: 'btn small ghost', href: `/api/backups/${b.name}`, download: b.name }, 'Laden'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmDialog('Wiederherstellen', `Stand «${b.name}» wiederherstellen? Der aktuelle Stand wird vorher gesichert.`, 'Wiederherstellen', true)) act('POST', `/api/backups/${b.name}/restore`, {}, { done: 'Wiederhergestellt' }); } }, 'Wiederherstellen'))));
      if (!backups.length) list.replaceChildren(h('li', { class: 'muted' }, 'Noch keine Sicherungen.'));
    } catch (e) { list.replaceChildren(h('li', { class: 'form-error' }, e.message)); }
  };
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (await confirmDialog('Sicherung einspielen', 'Alles durch diese Sicherung ersetzen? Der aktuelle Stand wird vorher auf dem Server gesichert.', 'Einspielen', true)) await act('POST', '/api/restore', json, { done: 'Sicherung eingespielt' });
    } catch { toast('Das ist keine Flux-Sicherung', { error: true }); }
  } });
  return block('sicherung', 'Sicherung',
    h('p', { class: 'hint' }, 'Flux sichert jeden Tag automatisch (30 Tage) und vor jedem Update.'),
    h('div', { class: 'row gap wrap' },
      h('a', { class: 'btn', href: '/api/backup', download: '' }, 'Sicherung herunterladen'),
      h('button', { class: 'btn', onclick: () => file.click() }, 'Sicherung einspielen'), file,
      h('button', { class: 'btn ghost', onclick: async () => { await api('POST', '/api/backups'); loadList(); toast('Gesichert'); } }, 'Jetzt sichern')),
    h('details', { class: 'help', ontoggle: (e) => { if (e.target.open) loadList(); } }, h('summary', null, 'Sicherungen auf dem Server'), list));
}

// ---------- Über Flux / Aktualisieren ----------
function about(d) {
  const box = h('div', { class: 'update-box' });
  const btn = h('button', { class: 'btn small', onclick: () => checkUpdates(box, btn) }, 'Nach Updates suchen');
  return block('about', 'Über Flux',
    h('p', null, h('strong', null, `Version ${d.version}`), d.versionDate ? h('span', { class: 'muted' }, ` vom ${fmtDate(d.versionDate, { year: true })}`) : null),
    h('div', { class: 'row gap wrap' }, btn),
    box);
}

async function checkUpdates(box, btn) {
  btn.disabled = true;
  box.replaceChildren(h('p', { class: 'muted small' }, 'Frage GitHub nach neuen Versionen …'));
  let r;
  try { r = await api('GET', '/api/update'); } catch (ex) { btn.disabled = false; return box.replaceChildren(h('p', { class: 'form-error' }, ex.message)); }
  btn.disabled = false;
  if (!r.enabled) return box.replaceChildren(h('p', { class: 'muted small' }, r.reason));
  const parts = [];
  if (r.dirty?.length) parts.push(h('p', { class: 'warn small' }, `Achtung: ${r.dirty.length} Programmdatei(en) wurden auf der NAS von Hand geändert – eine Aktualisierung überschreibt sie.`));
  if (r.newer.length) {
    const target = r.newer[0];
    parts.push(
      h('p', null, h('strong', null, `Version ${target} verfügbar`)),
      r.changelog.length ? h('div', { class: 'changelog' }, r.changelog.map((x) => h('div', null, h('strong', null, x.version), h('span', { class: 'muted small' }, ' vom ' + fmtDate(x.date, { year: true })), h('ul', null, x.changes.map((y) => h('li', null, y)))))) : null,
      h('button', { class: 'btn primary', onclick: () => applyUpdate(box, target, false) }, `Jetzt auf ${target} aktualisieren`));
  } else parts.push(h('p', { class: 'pos small' }, `Flux ist aktuell (${r.current}).`));
  const others = r.versions.filter((x) => x !== r.current && !r.newer.includes(x));
  if (others.length) {
    const sel = h('select', null, others.map((x) => h('option', { value: x }, x)));
    parts.push(h('details', { class: 'help' }, h('summary', null, 'Zu einer früheren Version zurück'),
      h('div', { class: 'row gap' }, sel, h('button', { class: 'btn small', onclick: () => applyUpdate(box, sel.value, true) }, 'Wechseln'))));
  }
  box.replaceChildren(...parts.filter(Boolean));
}

async function applyUpdate(box, target, back) {
  if (!(await confirmDialog(back ? 'Frühere Version' : 'Aktualisieren', `Flux auf Version ${target} umstellen? Vorher wird gesichert. Flux startet danach neu (ein paar Sekunden).`, back ? 'Wechseln' : 'Aktualisieren', back))) return;
  box.replaceChildren(h('p', null, `Stelle auf ${target} um …`));
  let r;
  try { r = await api('POST', '/api/update', { version: target }); } catch (ex) { return box.replaceChildren(h('p', { class: 'form-error' }, ex.message)); }
  if (!r?.restart) return box.replaceChildren(h('p', { class: 'warn' }, `Version ${target} ist eingespielt. Bitte Flux jetzt neu starten.`));
  box.replaceChildren(h('p', null, 'Flux startet neu …'));
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    try {
      const st = await (await fetch('/api/status', { cache: 'no-store' })).json();
      if (st.version === target) { location.reload(); return; }
    } catch { /* startet noch */ }
  }
  box.replaceChildren(h('p', { class: 'warn' }, 'Flux antwortet noch nicht mit der neuen Version. Seite in einer Minute neu laden.'));
}

// ---------- Erster Start ----------
export function renderFirstRun(main) {
  const y = new Date().getFullYear();
  const anspruch = h('input', { name: 'anspruch', inputmode: 'decimal', value: '25', required: true });
  const gleit = durationInput({ name: 'gleit', placeholder: '+12:30' }, null);
  const ferien = h('input', { name: 'ferien', inputmode: 'decimal', placeholder: 'z.B. 14.5' });
  const soll = durationInput({ name: 'soll' }, 504, false);
  const plus = h('input', { name: 'plus', inputmode: 'numeric', value: '15' });
  const err = h('p', { class: 'form-error', hidden: true });
  const fail = (t) => { err.textContent = t; err.hidden = false; };
  main.replaceChildren(h('form', {
    class: 'first-run',
    onsubmit: async (e) => {
      e.preventDefault();
      const g = parseDuration(gleit.value || '0');
      const s = parseDuration(soll.value);
      const f = numVal(ferien);
      if (g === null) return fail('Gleitzeit bitte als Stunden:Minuten, z.B. 12:30');
      if (!s) return fail('Sollzeit bitte als Stunden:Minuten, z.B. 8:24');
      try {
        await api('POST', '/api/setup', { anspruch: numVal(anspruch) ?? 0, saldo: { date: today(), gleitMin: g, ferien: f }, settings: { sollMin: s, plusMin: numVal(plus) ?? 0 } });
        await refresh(true);
        toast('Eingerichtet – jetzt Feiertage anhaken und Ferien erfassen');
        location.hash = '#einstellungen/feiertage';
      } catch (ex) { fail(ex.message); }
    },
  },
  h('img', { src: '/icons/icon.svg', alt: '', class: 'first-logo' }),
  h('h1', null, 'Flux einrichten'),
  h('p', null, 'Trag ein, was deine Zeiterfassung heute zeigt. Ab da rechnet Flux dein Jahr durch: Gleitzeit, Ferien, Feiertage.'),
  h('div', { class: 'form-grid two' },
    field('Gleitzeit-Saldo heute', gleit, 'Stunden:Minuten'),
    field(`Ferientage übrig ${y}`, ferien, 'leer = Anspruch')),
  h('div', { class: 'form-grid two' },
    field(`Ferienanspruch ${y}`, anspruch, 'Tage pro Jahr'),
    field('Sollzeit pro Tag', soll)),
  field('Gleitzeit-Aufbau pro Tag', h('div', { class: 'unit' }, plus, h('span', null, 'Minuten')), 'So viel arbeitest du im Schnitt länger als die Sollzeit.'),
  err,
  h('button', { class: 'btn primary wide', type: 'submit' }, 'Los geht’s')));
}
