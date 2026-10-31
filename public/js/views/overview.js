// Übersicht: Stand heute und Ende Jahr, Verlauf, Kompensation über Ferien/Gleitzeit, Monate, Stichtage.
import { h } from '../ui.js';
import { hm, fmtDays } from '../flux.js';
import { gleitChart } from '../chart.js';
import { state, remove } from '../app.js';
import { MONTHS_SHORT, fmtDate, saldo, days, saldoDays, saldoBoth, saldoDialog, empty } from './shared.js';

export function renderOverview(main, c) {
  const s = c.summary;
  const y = state.year;
  const curYear = Number(c.today.slice(0, 4));
  const past = y < curYear, future = y > curYear;
  const full = c.tl.settings.sollMin;
  if (!s) return main.replaceChildren(empty('Für dieses Jahr gibt es noch keine Daten.'));

  // ---------- Stand ----------
  const nowLabel = past ? 'Ende ' + y : future ? 'Anfang ' + y : 'heute';
  const gNow = past ? s.gleitEnd : s.gleitNow;
  const fNow = past ? s.ferienEnd : s.ferienNow;
  const readouts = h('section', { class: 'readouts' },
    h('div', { class: 'readout gleit' },
      h('span', { class: 'r-label' }, `Gleitzeit ${nowLabel}`),
      h('strong', { class: 'r-value' }, saldo(gNow)),
      h('span', { class: 'r-sub' }, `≈ ${saldoDays(gNow, full)}`),
      past ? null : h('span', { class: 'r-end' }, 'Ende Jahr ', h('strong', null, saldo(s.gleitEnd), ' h'), h('span', { class: 'r-end-days' }, `≈ ${saldoDays(s.gleitEnd, full)}`))),
    h('div', { class: 'readout ferien' },
      h('span', { class: 'r-label' }, `Ferien übrig ${nowLabel}`),
      h('strong', { class: 'r-value' }, fmtDays(fNow), h('small', null, Math.abs(fNow) === 1 ? ' Tag' : ' Tage')),
      h('span', { class: 'r-sub' }, `Anspruch ${fmtDays(s.anspruch)} + Übertrag ${fmtDays(s.uebertrag)}`),
      past ? null : h('span', { class: 'r-end' }, 'Ende Jahr ', h('strong', { class: s.ferienEnd < 0 ? 'neg' : '' }, days(s.ferienEnd)))));

  // ---------- Verlauf ----------
  const yearDays = c.tl.days.filter((d) => d.date.startsWith(y + '-'));
  const pickOut = h('p', { class: 'pick', 'aria-live': 'polite' });
  const showPick = (d) => {
    if (!d) {
      pickOut.replaceChildren(h('span', { class: 'muted' }, 'Antippen oder darüberfahren für den Stand an einem Tag. Gestrichelt = Prognose.'));
      return;
    }
    const bits = [h('strong', null, fmtDate(d.date)), ' ', saldoBoth(d.gleit, full), h('span', { class: 'muted' }, `, Ferien ${fmtDays(d.ferien)}`)];
    if (d.holidays.length && d.base) bits.push(h('span', { class: 'tag' }, d.holidays.join(', ')));
    if (d.eve.length && d.soll) bits.push(h('span', { class: 'tag' }, `Vortag ${d.eve.join(', ')}: Soll ${hm(d.soll)}`));
    if (d.absences.length) {
      const a = c.tl.absences.find((x) => x.id === d.absences[0]);
      if (a) bits.push(h('span', { class: 'tag sand' }, a.label || 'Abwesend'));
    }
    pickOut.replaceChildren(...bits);
  };
  showPick(null);
  const chartBox = h('div', { class: 'chart-box' });
  const width = Math.min(main.clientWidth || 360, 1000) - 2;
  chartBox.append(gleitChart(yearDays, { width, today: c.today, anchors: new Set(state.data.saldos.map((x) => x.date)), onPick: showPick }));

  const warn = !past && s.low && s.low.gleit < -0.5
    ? h('p', { class: 'note neg' }, `Achtung: Am ${fmtDate(s.low.date)} wäre die Gleitzeit bei `, saldoBoth(s.low.gleit, full), ' – im Minus.')
    : (!past && s.low ? h('p', { class: 'note' }, 'Tiefster Stand ab heute: ', saldoBoth(s.low.gleit, full), ` am ${fmtDate(s.low.date)}`) : null);

  // ---------- Kompensation ----------
  const fTot = s.ferienTaken + s.ferienPlanned, gTot = s.gleitTaken + s.gleitPlanned;
  const comp = h('section', { class: 'block' },
    h('h2', null, 'Abwesenheiten ', y),
    h('table', { class: 'comp' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'genommen'), h('th', null, 'geplant'), h('th', null, 'total'))),
      h('tbody', null,
        h('tr', { class: 'ferien' }, h('th', null, 'Über Ferien'), h('td', null, fmtDays(s.ferienTaken)), h('td', null, fmtDays(s.ferienPlanned)), h('td', null, fmtDays(fTot))),
        h('tr', { class: 'gleit' }, h('th', null, 'Über Gleitzeit'), h('td', null, fmtDays(s.gleitTaken)), h('td', null, fmtDays(s.gleitPlanned)), h('td', null, fmtDays(gTot))),
        h('tr', { class: 'gleit-h' }, h('th', null, h('span', { class: 'muted' }, 'in Stunden')), h('td', null, hm(s.gleitTakenMin)), h('td', null, hm(s.gleitPlannedMin)), h('td', null, hm(s.gleitTakenMin + s.gleitPlannedMin)))),
      h('tfoot', null, h('tr', null, h('th', null, 'Zusammen'), h('td', null, fmtDays(s.ferienTaken + s.gleitTaken)), h('td', null, fmtDays(s.ferienPlanned + s.gleitPlanned)), h('td', null, h('strong', null, days(fTot + gTot)))))),
    fTot + gTot > 0 ? h('div', { class: 'split', role: 'img', 'aria-label': `${fmtDays(fTot)} über Ferien, ${fmtDays(gTot)} über Gleitzeit` },
      h('span', { class: 'ferien', style: { flexGrow: fTot } }), h('span', { class: 'gleit', style: { flexGrow: gTot } })) : null,
    h('p', { class: 'hint' }, `${fmtDays(s.units)} Arbeitstage im Jahr. Aufgebaut bis heute ${hm(s.plusPast)}, noch erwartet ${hm(s.plusFuture)} (${hm(c.tl.settings.plusMin)} pro Arbeitstag).`));

  // ---------- Monate ----------
  const months = h('section', { class: 'block' },
    h('h2', null, 'Monate'),
    h('p', { class: 'hint' }, 'Ferien und Gleitz. = kompensierte Tage im Monat; Saldo und Rest = Stand Ende Monat.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'months' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', { title: 'Arbeitstage' }, 'Tage'), h('th', { title: 'Über Ferien kompensiert' }, 'Ferien'), h('th', { title: 'Über Gleitzeit kompensiert' }, 'Gleitz.'), h('th', { title: 'Gleitzeit-Saldo am Monatsende' }, 'Saldo'), h('th', { title: 'Ferientage übrig am Monatsende' }, 'Rest'))),
      h('tbody', null, s.months.map((m) => h('tr', { class: m.past ? 'past' : '' },
        h('th', null, MONTHS_SHORT[m.month - 1]),
        h('td', null, fmtDays(m.units)),
        h('td', { class: m.ferien ? 'sand' : 'muted' }, m.ferien ? fmtDays(m.ferien) : '–'),
        h('td', { class: m.gleit ? 'lake' : 'muted' }, m.gleit ? fmtDays(m.gleit) : '–'),
        h('td', null, saldo(m.gleitEnd), h('span', { class: 'cell-days' }, saldoDays(m.gleitEnd, full))),
        h('td', { class: m.ferienEnd < 0 ? 'neg' : '' }, fmtDays(m.ferienEnd))))))));

  // ---------- Feiertage ----------
  const hol = h('details', { class: 'help block' },
    h('summary', null, `Feiertage ${y} (${s.holidays.filter((x) => x.base).length} an Arbeitstagen)`),
    h('ul', { class: 'hol-list' }, s.holidays.map((x) => h('li', { class: x.base ? '' : 'muted' },
      h('span', { class: 'hol-date' }, fmtDate(x.date)), h('span', null, x.names.join(', ')),
      h('span', { class: 'hol-eff' }, !x.base ? 'Wochenende' : x.soll ? `Soll ${hm(x.soll)}` : 'frei')))));

  // ---------- Stichtage ----------
  const list = state.data.saldos.filter((x) => x.date.startsWith(y + '-')).sort((a, b) => b.date.localeCompare(a.date));
  const anchors = h('section', { class: 'block' },
    h('h2', null, 'Eingetragene Stände'),
    list.length ? h('ul', { class: 'anchors' }, list.map((x) => h('li', null,
      h('span', { class: 'a-date' }, fmtDate(x.date)),
      saldoBoth(x.gleitMin, full),
      x.ferien !== null && x.ferien !== undefined ? h('span', { class: 'muted small' }, `Ferien ${fmtDays(x.ferien)}`) : null,
      h('span', { class: 'muted small grow' }, x.note || ''),
      h('button', { class: 'icon-btn', 'aria-label': 'Bearbeiten', onclick: () => saldoDialog(x) }, '✎'),
      h('button', { class: 'icon-btn', 'aria-label': 'Löschen', onclick: () => remove(`/api/saldos/${x.id}`, `Stand vom ${fmtDate(x.date, { year: true })}`) }, '✕')))) : h('p', { class: 'muted' }, 'In diesem Jahr noch kein Stand eingetragen – Flux rechnet mit dem Übertrag vom Vorjahr.'));

  main.replaceChildren(
    readouts,
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => saldoDialog() }, 'Saldo eintragen'), h('a', { class: 'btn', href: '#abwesenheiten' }, 'Abwesenheit erfassen')),
    h('section', { class: 'block flow' }, h('h2', null, 'Verlauf Gleitzeit'), pickOut, chartBox, warn),
    comp, months, hol, anchors);
}
