// Stempelrechner: Kommen/Gehen über einen grossen Ziffernblock eintragen (Doppelpunkt kommt von selbst),
// Differenz zur Sollzeit in Minuten (grün/rot), «Sollzeit erreicht um …» und «Vorholzeit erreicht um …».
// Die Zeiten bleiben nur auf diesem Gerät gespeichert (pro Tag).
import { h } from '../ui.js';
import { stamp, clock, hm, parseDuration, calendar, timeDigits } from '../flux.js';
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
let keyHandler = null; // Tastatur am PC: Ziffern, Rücktaste, Enter

export function renderStamp(main, c) {
  const date = c.today;
  const d = state.data;
  const cal = calendar(d.settings, d.holidays, d.customHolidays);
  const day = cal.day(date);
  const v = load(date);
  const sollFor = () => (v.soll ?? (day.soll || d.settings.sollMin));
  // Vorholzeit heute: durchschnittlicher Aufbau, an verkürzten Tagen anteilig
  const plusFor = () => Math.round(d.settings.plusMin * (sollFor() / d.settings.sollMin));

  // Aktives Feld: das erste leere (oder keins, wenn alle voll)
  let active = v.times.findIndex((t) => !t);
  let buf = ''; // Ziffern, die gerade getippt werden (ohne Doppelpunkt)

  const slotsBox = h('div', { class: 'stamp-grid' });
  const keypad = h('div', { class: 'keypad', role: 'group', 'aria-label': 'Ziffernblock' });
  const result = h('div', { class: 'stamp-result', 'aria-live': 'polite' });
  const sollInput = h('input', { class: 'soll-input', inputmode: 'text', value: hm(sollFor()), 'aria-label': 'Sollzeit heute' });

  const label = (i) => (i % 2 === 0 ? 'Kommen' : 'Gehen');
  const block = (i) => (i === 0 ? 'Vormittag' : i === 2 ? 'Nachmittag' : `Block ${i / 2 + 1}`);

  const drawSlots = () => {
    const pairs = [];
    for (let i = 0; i < v.times.length; i += 2) {
      const pair = h('div', { class: 'stamp-pair' }, h('span', { class: 'pair-no' }, block(i)));
      for (const k of [i, i + 1]) {
        const typing = k === active && buf;
        const text = typing ? timeDigits(buf).text : v.times[k];
        pair.append(h('button', {
          type: 'button',
          class: 'stamp-slot' + (k === active ? ' on' : '') + (typing ? ' typing' : '') + (text ? '' : ' empty'),
          dataset: { i: String(k) },
          'aria-label': `${label(k)} ${i / 2 + 1}: ${v.times[k] || 'leer'}`,
          'aria-pressed': String(k === active),
          onclick: () => { active = k; buf = ''; drawAll(); },
        }, h('span', { class: 'slot-label' }, label(k)), h('span', { class: 'slot-time' }, text || '––:––')));
      }
      pairs.push(pair);
    }
    slotsBox.replaceChildren(...pairs);
  };

  const press = (digit) => {
    if (active < 0) return;
    const next = timeDigits(buf + digit);
    if (next.digits === buf || next.digits.length <= timeDigits(buf).digits.length) return; // ungültige Ziffer
    buf = next.digits;
    if (next.complete) {
      v.times[active] = next.text;
      save(v);
      buf = '';
      // Weiter zum nächsten leeren Feld
      const after = v.times.findIndex((t, j) => j > active && !t);
      active = after;
    }
    drawAll();
  };
  const back = () => {
    if (active < 0) return;
    if (buf) buf = timeDigits(buf).digits.slice(0, -1).replace(/^0$/, '');
    else if (v.times[active]) { v.times[active] = ''; save(v); }
    else if (active > 0) { active -= 1; }
    drawAll();
  };

  const drawKeypad = () => {
    const allowed = active < 0 ? [] : timeDigits(buf).allowed;
    const key = (n) => h('button', { type: 'button', class: 'key', dataset: { key: String(n) }, disabled: !allowed.includes(n), onclick: () => press(String(n)) }, String(n));
    keypad.replaceChildren(
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key),
      h('button', { type: 'button', class: 'key key-fn', 'aria-label': 'Löschen', disabled: active < 0, onclick: back }, '⌫'),
      key(0),
      h('button', { type: 'button', class: 'key key-fn', 'aria-label': 'Jetzt', disabled: active < 0, onclick: () => stampNow() }, 'Jetzt'));
  };

  const calc = () => {
    const r = stamp(v.times, sollFor(), nowMin(), plusFor());
    if (r.error) return result.replaceChildren(h('p', { class: 'form-error' }, r.error));
    if (r.empty) return result.replaceChildren(h('p', { class: 'muted' }, 'Tipp die Zeit ein, wann du gekommen bist – z.B. 0 7 3 0. Der Doppelpunkt kommt von selbst.'));
    const big = (diff, text) => h('div', { class: 'diff ' + (diff >= 0 ? 'pos' : 'neg') },
      h('span', { class: 'diff-num' }, `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${Math.abs(diff)}`, h('small', null, ' Min.')),
      h('span', { class: 'diff-label' }, text, h('span', { class: 'muted' }, ` (${hm(diff, true)} h)`)));
    const rows = [];
    const plus = plusFor();
    if (r.open) {
      rows.push(h('div', { class: 'reach-row' },
        h('p', { class: 'reach' }, h('span', null, 'Sollzeit erreicht'), h('strong', null, clock(r.reachAt))),
        plus > 0 ? h('p', { class: 'reach plus' }, h('span', null, `Vorholzeit (+${plus} Min.)`), h('strong', null, clock(r.reachPlusAt))) : null));
      if (r.noPauseYet) rows.push(h('p', { class: 'muted small' }, 'Ohne Mittagspause gerechnet – die kommt noch dazu.'));
      if (r.diffNow !== undefined) rows.push(big(r.diffNow, 'wenn du jetzt gehst'));
    } else {
      rows.push(big(r.diff, r.diff >= 0 ? 'über der Sollzeit' : 'unter der Sollzeit'));
      if (plus > 0) rows.push(h('p', { class: 'plus-check ' + (r.diffPlus >= 0 ? 'pos' : 'neg') },
        r.diffPlus >= 0 ? `Vorholzeit (+${plus} Min.) erreicht${r.diffPlus > 0 ? ` – ${r.diffPlus} Min. darüber` : ''}` : `Bis zur Vorholzeit (+${plus} Min.) fehlen ${-r.diffPlus} Min.`));
    }
    rows.push(h('p', { class: 'muted small' }, `Gearbeitet ${hm(r.worked + (r.running || 0))} von ${hm(r.soll)}`, r.pause ? `, Pause ${hm(r.pause)}` : ''));
    result.replaceChildren(...rows);
  };

  const drawAll = () => { drawSlots(); drawKeypad(); calc(); };

  const stampNow = () => {
    let i = active >= 0 ? active : v.times.findIndex((t) => !t);
    if (i < 0) { v.times.push('', ''); i = v.times.length - 2; }
    v.times[i] = clock(nowMin());
    save(v);
    buf = '';
    active = v.times.findIndex((t, j) => j > i && !t);
    drawAll();
  };
  sollInput.addEventListener('change', () => {
    const m = parseDuration(sollInput.value);
    v.soll = m && m > 0 ? m : null;
    sollInput.value = hm(sollFor());
    save(v); calc();
  });

  const why = day.holidays.length && day.base ? `${day.holidays.join(', ')}` : day.eve.length && day.soll ? `Vortag ${day.eve.join(', ')}` : !day.base ? 'kein Arbeitstag' : '';
  drawAll();
  main.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'Stempelrechner'), h('span', { class: 'muted' }, fmtDate(date))),
    h('section', { class: 'stamp' },
      result,
      slotsBox,
      keypad,
      h('div', { class: 'row gap wrap stamp-tools' },
        h('label', { class: 'soll-field' }, h('span', null, 'Sollzeit heute'), sollInput),
        why ? h('span', { class: 'muted small' }, why) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small ghost', onclick: () => { v.times.push('', ''); active = v.times.length - 2; buf = ''; save(v); drawAll(); } }, '+ Zeitpaar'),
        h('button', { class: 'btn small ghost', onclick: () => { v.times = ['', '', '', '']; v.soll = null; active = 0; buf = ''; sollInput.value = hm(sollFor()); save(v); drawAll(); } }, 'Leeren'))),
    h('p', { class: 'hint' }, 'Feld antippen, dann die Zeit eintippen. Die Zeiten bleiben nur auf diesem Gerät und nur für heute – am Saldo ändern sie nichts.'));

  // Tastatur (PC): Ziffern, Rücktaste; nicht, wenn gerade in ein Eingabefeld getippt wird
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (document.body.dataset.route !== 'stempel' || document.querySelector('dialog[open]')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
  };
  document.addEventListener('keydown', keyHandler);

  clearInterval(ticker);
  ticker = setInterval(() => { if (document.body.dataset.route === 'stempel' && !document.hidden) calc(); else if (document.body.dataset.route !== 'stempel') clearInterval(ticker); }, 20000);
}
