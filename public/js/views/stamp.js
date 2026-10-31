// Stempelrechner: Kommen/Gehen eintragen, Differenz zur Sollzeit in Minuten (grün/rot), «Sollzeit erreicht um …».
// Die Zeiten bleiben nur auf diesem Gerät gespeichert (pro Tag).
import { h } from '../ui.js';
import { stamp, clock, hm, parseDuration, calendar } from '../flux.js';
import { state, store } from '../app.js';
import { fmtDate } from './shared.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function load(date) {
  try {
    const v = JSON.parse(store('flux-stamp') || 'null');
    if (v && v.date === date && Array.isArray(v.times)) return v;
  } catch { /* neu */ }
  return { date, times: ['', '', '', ''], soll: null };
}
const save = (v) => store('flux-stamp', JSON.stringify(v));

let ticker = null;

export function renderStamp(main, c) {
  const date = c.today;
  const d = state.data;
  const cal = calendar(d.settings, d.holidays, d.customHolidays);
  const day = cal.day(date);
  const v = load(date);
  const sollFor = () => (v.soll ?? (day.soll || d.settings.sollMin));

  const inputs = [];
  const grid = h('div', { class: 'stamp-grid' });
  const result = h('div', { class: 'stamp-result', 'aria-live': 'polite' });
  const sollInput = h('input', { class: 'soll-input', inputmode: 'text', value: hm(sollFor()), 'aria-label': 'Sollzeit heute' });

  const labels = (i) => (i % 2 === 0 ? 'Kommen' : 'Gehen');
  const drawInputs = () => {
    inputs.length = 0;
    const pairs = [];
    for (let i = 0; i < v.times.length; i += 2) {
      const pair = h('div', { class: 'stamp-pair' }, h('span', { class: 'pair-no' }, i === 0 ? 'Vormittag' : i === 2 ? 'Nachmittag' : `Block ${i / 2 + 1}`));
      for (const k of [i, i + 1]) {
        const inp = h('input', { type: 'time', name: 't' + k, value: v.times[k] || '', 'aria-label': `${labels(k)} ${i / 2 + 1}` });
        inp.addEventListener('input', () => { v.times[k] = inp.value; save(v); calc(); });
        inputs.push(inp);
        pair.append(h('label', { class: 'stamp-field' }, h('span', null, labels(k)), inp));
      }
      pairs.push(pair);
    }
    grid.replaceChildren(...pairs);
  };

  const calc = () => {
    const r = stamp(v.times, sollFor(), nowMin());
    if (r.error) return result.replaceChildren(h('p', { class: 'form-error' }, r.error));
    if (r.empty) return result.replaceChildren(h('p', { class: 'muted' }, 'Trag ein, wann du gekommen bist – oder tipp auf «Jetzt stempeln».'));
    const big = (diff, label) => h('div', { class: 'diff ' + (diff >= 0 ? 'pos' : 'neg') },
      h('span', { class: 'diff-num' }, `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)}`, h('small', null, ' Min.')),
      h('span', { class: 'diff-label' }, label, h('span', { class: 'muted' }, ` (${hm(diff, true)} h)`)));
    const rows = [];
    if (r.open) {
      rows.push(h('p', { class: 'reach' }, 'Sollzeit erreicht um ', h('strong', null, clock(r.reachAt)), r.noPauseYet ? h('span', { class: 'muted small' }, ' – plus deine Mittagspause') : null));
      if (r.diffNow !== undefined) rows.push(big(r.diffNow, 'wenn du jetzt gehst'));
    } else {
      rows.push(big(r.diff, r.diff >= 0 ? 'über der Sollzeit' : 'unter der Sollzeit'));
    }
    rows.push(h('p', { class: 'muted small' }, `Gearbeitet ${hm(r.worked + (r.running || 0))} von ${hm(r.soll)}`, r.pause ? `, Pause ${hm(r.pause)}` : ''));
    result.replaceChildren(...rows);
  };

  const stampNow = () => {
    let i = v.times.findIndex((t) => !t);
    if (i < 0) { v.times.push('', ''); i = v.times.length - 2; }
    v.times[i] = clock(nowMin());
    save(v); drawInputs(); calc();
  };
  sollInput.addEventListener('change', () => {
    const m = parseDuration(sollInput.value);
    v.soll = m && m > 0 ? m : null;
    sollInput.value = hm(sollFor());
    save(v); calc();
  });

  const why = day.holidays.length && day.base ? `${day.holidays.join(', ')}` : day.eve.length && day.soll ? `Vortag ${day.eve.join(', ')}` : !day.base ? 'kein Arbeitstag' : '';
  drawInputs();
  calc();
  main.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'Stempelrechner'), h('span', { class: 'muted' }, fmtDate(date))),
    h('section', { class: 'stamp' },
      result,
      h('button', { class: 'btn primary stamp-now', onclick: stampNow }, 'Jetzt stempeln'),
      grid,
      h('div', { class: 'row gap wrap stamp-tools' },
        h('label', { class: 'soll-field' }, h('span', null, 'Sollzeit heute'), sollInput),
        why ? h('span', { class: 'muted small' }, why) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small ghost', onclick: () => { v.times.push('', ''); save(v); drawInputs(); calc(); } }, '+ Zeitpaar'),
        h('button', { class: 'btn small ghost', onclick: () => { v.times = ['', '', '', '']; v.soll = null; sollInput.value = hm(sollFor()); save(v); drawInputs(); calc(); } }, 'Leeren'))),
    h('p', { class: 'hint' }, 'Die Zeiten bleiben nur auf diesem Gerät und nur für heute. Am Saldo ändern sie nichts – den trägst du unter «Übersicht» ein.'));
  clearInterval(ticker);
  ticker = setInterval(() => { if (document.body.dataset.route === 'stempel' && !document.hidden) calc(); else if (document.body.dataset.route !== 'stempel') clearInterval(ticker); }, 20000);
}
