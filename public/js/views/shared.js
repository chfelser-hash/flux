// Gemeinsame Anzeige-Bausteine und der Dialog «Saldo eintragen».
import { h, modal } from '../ui.js';
import { hm, fmtDays, parseDuration, toDate, isIsoDate } from '../flux.js';
import { act, today } from '../app.js';

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** «Mo 2. Feb.» bzw. mit Jahr «2.2.2026» */
export function fmtDate(s, { year = false, weekday = true } = {}) {
  if (!s) return '';
  const d = toDate(s);
  if (year) return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
  return `${weekday ? WEEKDAYS[d.getUTCDay()] + ' ' : ''}${d.getUTCDate()}. ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function fmtRange(a, b) {
  if (a === b) return fmtDate(a);
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

/** Gleitzeit mit Vorzeichen und Farbe */
export const saldo = (min, cls = '') => h('span', { class: `saldo ${min < -0.5 ? 'neg' : min > 0.5 ? 'pos' : ''} ${cls}` }, hm(min, true));

/** Gleitzeit in Tagen («−1.74 Tage»), umgerechnet mit der Sollzeit pro Tag */
export const saldoDays = (min, full) => (min / full >= 0.005 ? '+' : '') + days(min / full).replace('-', '−');

/** Gleitzeit in Stunden und dahinter in Tagen: «+12:30 h (1.49 Tage)» */
export const saldoBoth = (min, full) => h('span', { class: 'saldo-both' }, saldo(min), ' h ', h('span', { class: 'muted' }, `(${saldoDays(min, full)})`));

/** «12.5 Tage» / «1 Tag» */
export const days = (x) => `${fmtDays(x)} ${Math.abs(x) === 1 ? 'Tag' : 'Tage'}`;

export const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);

export const empty = (text, ...actions) => h('div', { class: 'empty-state' }, h('p', null, text), ...actions);

/** Eingabefeld für Dauern (h:mm), liefert Minuten oder null */
export function durationInput(attrs = {}, value = null, sign = true) {
  return h('input', { inputmode: 'text', autocomplete: 'off', placeholder: sign ? '+12:30' : '2:00', value: value === null || value === undefined ? '' : hm(value, sign).replace('±', ''), ...attrs });
}

/** Dialog: aktuellen Saldo (Stand am Morgen) eintragen oder einen Stichtag bearbeiten */
export async function saldoDialog(item = null) {
  const date = h('input', { type: 'date', name: 'date', value: item?.date || today(), required: true });
  const gleit = durationInput({ name: 'gleit' }, item ? item.gleitMin : null);
  const ferien = h('input', { name: 'ferien', inputmode: 'decimal', placeholder: 'leer = weiter rechnen', value: item?.ferien ?? '' });
  const note = h('input', { name: 'note', maxlength: 80, value: item?.note || '', placeholder: 'z.B. aus dem Zeiterfassungssystem' });
  const err = h('p', { class: 'form-error', hidden: true });
  const fail = (t) => { err.textContent = t; err.hidden = false; return false; };
  return modal(item ? 'Stand bearbeiten' : 'Saldo eintragen', h('div', null,
    h('p', { class: 'muted small' }, 'Trag ein, was deine Zeiterfassung zeigt – Stand am Morgen, also ohne den Tag selbst. Alles davor gilt dann als erledigt, ab hier rechnet Flux neu.'),
    field('Stichtag', date),
    field('Gleitzeit-Saldo', gleit, 'Stunden:Minuten, z.B. 12:30 oder -1:15'),
    field('Ferientage übrig (optional)', ferien, 'Nur ausfüllen, um den Ferien-Rest zu korrigieren.'),
    field('Notiz', note),
    err), [
    { label: 'Abbrechen', value: null },
    {
      label: 'Speichern', primary: true, onClick: async () => {
        const min = parseDuration(gleit.value);
        if (!isIsoDate(date.value)) return fail('Bitte ein Datum wählen');
        if (min === null) return fail('Gleitzeit bitte als Stunden:Minuten, z.B. 12:30');
        const f = ferien.value.trim() === '' ? null : Number(ferien.value.replace(',', '.'));
        if (f !== null && !Number.isFinite(f)) return fail('Ferientage bitte als Zahl, z.B. 12.5');
        const body = { date: date.value, gleitMin: min, ferien: f, note: note.value };
        const r = await act(item ? 'PUT' : 'POST', item ? `/api/saldos/${item.id}` : '/api/saldos', body, { done: 'Gespeichert' });
        return r ? true : false;
      },
    },
  ]);
}
