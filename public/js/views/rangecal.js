// Kalender für Von–Bis direkt im Dialog: ersten Tag antippen, letzten Tag antippen – ohne «OK».
// Wochenenden und Feiertage sind blass, der gewählte Zeitraum ist hinterlegt.
import { h } from '../ui.js';
import { addDays, weekday } from '../flux.js';
import { MONTHS, fmtDate } from './shared.js';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** range: {from, to} (wird verändert); onChange() nach jeder Auswahl */
export function rangeCalendar({ range, cal, today, onChange }) {
  let picking = 'from';
  let view = range.from.slice(0, 7);
  const root = h('div', { class: 'rcal' });

  const pick = (d) => {
    if (picking === 'from' || d < range.from) {
      range.from = d;
      range.to = d;
      picking = 'to';
    } else {
      range.to = d;
      picking = 'from';
    }
    draw();
    onChange();
  };

  function draw() {
    root.dataset.month = view;
    root.dataset.picking = picking;
    const first = `${view}-01`;
    const lead = (weekday(first) + 6) % 7; // Montag zuerst
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'rcal-blank' }));
    for (let d = first; d.startsWith(view); d = addDays(d, 1)) {
      const day = cal.day(d);
      const hol = day.holidays.length > 0;
      const cls = ['rcal-day'];
      if (!day.soll) cls.push('rcal-off');
      if (hol) cls.push('rcal-hol');
      if (d === today) cls.push('today');
      if (d >= range.from && d <= range.to) cls.push('in');
      if (d === range.from) cls.push('start');
      if (d === range.to) cls.push('end');
      cells.push(h('button', {
        type: 'button', class: cls.join(' '), dataset: { date: d },
        title: hol ? day.holidays.join(', ') : null,
        'aria-label': fmtDate(d) + (hol ? ` (${day.holidays.join(', ')})` : ''),
        'aria-pressed': String(d >= range.from && d <= range.to),
        onclick: () => pick(d),
      }, String(Number(d.slice(8)))));
    }
    const [yy, mm] = view.split('-').map(Number);
    root.replaceChildren(
      h('div', { class: 'rcal-sel' },
        h('button', { type: 'button', class: 'rcal-chip' + (picking === 'from' ? ' on' : ''), onclick: () => { picking = 'from'; view = range.from.slice(0, 7); draw(); } },
          h('span', null, 'Von'), h('strong', null, fmtDate(range.from))),
        h('button', { type: 'button', class: 'rcal-chip' + (picking === 'to' ? ' on' : ''), onclick: () => { picking = 'to'; draw(); } },
          h('span', null, 'Bis'), h('strong', null, fmtDate(range.to)))),
      h('p', { class: 'rcal-hint' }, picking === 'from' ? 'Tippe auf den ersten Tag.' : 'Jetzt den letzten Tag antippen – für einen einzelnen Tag einfach so lassen.'),
      h('div', { class: 'rcal-nav' },
        h('button', { type: 'button', class: 'icon-btn rcal-prev', 'aria-label': 'Vorheriger Monat', onclick: () => { view = shiftMonth(view, -1); draw(); } }, '‹'),
        h('strong', null, `${MONTHS[mm - 1]} ${yy}`),
        h('button', { type: 'button', class: 'icon-btn rcal-next', 'aria-label': 'Nächster Monat', onclick: () => { view = shiftMonth(view, 1); draw(); } }, '›')),
      h('div', { class: 'rcal-grid' }, WD.map((w) => h('span', { class: 'rcal-wd' }, w)), cells));
  }

  root.redraw = draw;
  draw();
  return root;
}
