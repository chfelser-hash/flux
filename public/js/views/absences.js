// Abwesenheiten: mit Datum erfassen, Arbeitstage zählt Flux, du teilst sie auf Ferien und Gleitzeit auf.
import { h, modal } from '../ui.js';
import { fmtDays, absencePreview, hm, yearOf } from '../flux.js';
import { state, act, remove } from '../app.js';
import { fmtRange, field, empty, days } from './shared.js';

export function renderAbsences(main, c) {
  const y = state.year;
  const list = c.tl.absences.filter((a) => yearOf(a.from) === y || yearOf(a.to) === y).sort((a, b) => a.from.localeCompare(b.from));
  const upcoming = list.filter((a) => a.to >= c.today);
  const done = list.filter((a) => a.to < c.today).reverse();
  const item = (a) => {
    const rest = a.units - a.ferien - a.gleit;
    return h('li', { class: 'absence' + (a.to < c.today ? ' past' : '') + (a.from <= c.today && c.today <= a.to ? ' now' : '') },
      h('button', { class: 'abs-main', onclick: () => absenceDialog(c, a) },
        h('span', { class: 'abs-when' }, fmtRange(a.from, a.to)),
        h('span', { class: 'abs-label' }, a.label || 'Abwesenheit'),
        h('span', { class: 'abs-split' },
          a.ferien ? h('span', { class: 'chip-f' }, `${fmtDays(a.ferien)} Ferien`) : null,
          a.gleit ? h('span', { class: 'chip-g' }, `${fmtDays(a.gleit)} Gleitzeit`) : null,
          rest > 0.001 ? h('span', { class: 'muted small' }, `${fmtDays(rest)} gearbeitet`) : null,
          a.over ? h('span', { class: 'neg small' }, `Mehr als die ${fmtDays(a.units)} Arbeitstage`) : null)),
      h('button', { class: 'icon-btn', 'aria-label': 'Löschen', onclick: () => remove(`/api/absences/${a.id}`, a.label ? `«${a.label}»` : 'Diese Abwesenheit') }, '✕'));
  };
  main.replaceChildren(...[
    h('div', { class: 'page-head' }, h('h1', { class: 'page-title' }, `Abwesenheiten ${y}`), h('button', { class: 'btn primary', onclick: () => absenceDialog(c) }, '+ Abwesenheit')),
    list.length ? null : empty('Noch nichts erfasst. Trag deine Ferien mit Datum ein – Flux zählt die Arbeitstage und rechnet Ferien und Gleitzeit fürs ganze Jahr.'),
    upcoming.length ? h('section', { class: 'block' }, h('h2', null, 'Kommend'), h('ul', { class: 'absences' }, upcoming.map(item))) : null,
    done.length ? h('section', { class: 'block' }, h('h2', null, 'Vorbei'), h('ul', { class: 'absences' }, done.map(item))) : null].filter(Boolean));
}

/** Dialog zum Erfassen/Bearbeiten. Gleitzeit ändern → Ferien = Rest; Ferien ändern lässt den Rest als «gearbeitet» */
export async function absenceDialog(c, a = null) {
  const y = state.year;
  const defFrom = a?.from || (Number(c.today.slice(0, 4)) === y ? c.today : `${y}-01-01`);
  const from = h('input', { type: 'date', name: 'from', value: defFrom, required: true });
  const to = h('input', { type: 'date', name: 'to', value: a?.to || defFrom, required: true });
  const label = h('input', { name: 'label', maxlength: 60, value: a?.label || '', placeholder: 'z.B. Sommerferien' });
  const ferien = h('input', { name: 'ferien', inputmode: 'decimal', value: a ? a.ferien : '' });
  const gleit = h('input', { name: 'gleit', inputmode: 'decimal', value: a ? a.gleit : '0' });
  const info = h('div', { class: 'preview' });
  const err = h('p', { class: 'form-error', hidden: true });
  const n = (inp) => { const v = Number(String(inp.value).replace(',', '.')); return inp.value.trim() === '' || !Number.isFinite(v) ? null : v; };
  let units = 0;
  let touchedFerien = !!a;
  const update = (autofill) => {
    if (to.value < from.value && from.value) to.value = from.value;
    const p = absencePreview(c.tl.cal, from.value, to.value);
    units = p ? p.units : 0;
    if (autofill === 'gleit' || (autofill && !touchedFerien)) {
      const g = n(gleit) || 0;
      ferien.value = String(Math.max(0, units - g));
    }
    const f = n(ferien) || 0, g = n(gleit) || 0;
    const rest = units - f - g;
    info.replaceChildren(!p ? h('p', null, 'Bitte Von und Bis wählen.') : h('div', null,
      h('p', null, h('strong', null, `${fmtDays(units)} Arbeitstage`), h('span', { class: 'muted' }, ` in ${p.days} Kalendertagen`)),
      p.holidays.length ? h('p', { class: 'muted small' }, `Feiertage zählen nicht: ${p.holidays.join(', ')}`) : null,
      h('p', { class: rest < -0.001 ? 'neg' : 'muted' }, rest < -0.001 ? `${fmtDays(-rest)} Tage zu viel` : rest > 0.001 ? `${fmtDays(rest)} Tage arbeitest du` : `Ferien ${fmtDays(f)} + Gleitzeit ${fmtDays(g)} = alle Arbeitstage`),
      g ? h('p', { class: 'muted small' }, `Gleitzeit-Saldo sinkt um ${hm(g * c.tl.settings.sollMin)} h`) : null));
  };
  from.addEventListener('change', () => update(true));
  to.addEventListener('change', () => update(true));
  gleit.addEventListener('input', () => update('gleit'));
  ferien.addEventListener('input', () => { touchedFerien = true; update(false); });
  const quick = (fv, gv) => { ferien.value = String(fv); gleit.value = String(gv); touchedFerien = true; update(false); };
  update(!a);
  const r = await modal(a ? 'Abwesenheit bearbeiten' : 'Abwesenheit erfassen', h('div', null,
    h('div', { class: 'form-grid two' }, field('Von', from), field('Bis', to)),
    field('Bezeichnung', label),
    info,
    h('div', { class: 'form-grid two' }, field('Ferientage', ferien), field('Gleitzeittage', gleit)),
    h('div', { class: 'row gap wrap quick' },
      h('button', { type: 'button', class: 'btn small', onclick: () => quick(units, 0) }, 'Alles Ferien'),
      h('button', { type: 'button', class: 'btn small', onclick: () => quick(0, units) }, 'Alles Gleitzeit'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { to.value = from.value; update(false); quick(0.5, 0); } }, 'Halber Ferientag')),
    err), [
    a ? { label: 'Löschen', danger: true, value: 'delete' } : null,
    { label: 'Abbrechen', value: null },
    {
      label: a ? 'Speichern' : 'Erfassen', primary: true, onClick: async () => {
        const f = n(ferien) ?? 0, g = n(gleit) ?? 0;
        if (f < 0 || g < 0) { err.textContent = 'Keine negativen Tage'; err.hidden = false; return false; }
        const body = { from: from.value, to: to.value, label: label.value, ferien: f, gleit: g };
        const res = await act(a ? 'PUT' : 'POST', a ? `/api/absences/${a.id}` : '/api/absences', body, { done: a ? 'Gespeichert' : `Erfasst: ${days(f + g)}` });
        return res ? true : false;
      },
    },
  ].filter(Boolean));
  if (r === 'delete') await remove(`/api/absences/${a.id}`, a.label ? `«${a.label}»` : 'Diese Abwesenheit');
}
