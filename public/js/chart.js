// Verlauf des Gleitzeit-Saldos über ein Jahr: wie ein Pegel. Über null türkis, darunter rot, Abwesenheiten sandfarben,
// Vergangenes durchgezogen, Prognose gestrichelt. Antippen/Darüberfahren zeigt den Stand an diesem Tag.
import { s } from './ui.js';

const MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function gleitChart(days, { width, today, anchors = new Set(), onPick }) {
  const W = Math.max(280, Math.round(width));
  const H = Math.round(Math.min(260, Math.max(170, W * 0.42)));
  const pad = { l: 44, r: 10, t: 14, b: 24 };
  const n = days.length;
  const vals = days.map((d) => d.gleit);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 120) hi = lo + 120;
  const span = hi - lo;
  lo -= span * 0.08; hi += span * 0.08;
  const x = (i) => pad.l + (i + 0.5) * ((W - pad.l - pad.r) / n);
  const y = (v) => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
  const y0 = y(0);
  const ti = days.findIndex((d) => d.date >= today);
  const split = ti < 0 ? (days.length && days[0].date > today ? 0 : n) : ti;

  const pts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.gleit).toFixed(1)}`);
  const line = (a, b) => (b - a >= 1 ? 'M' + pts.slice(a, b + 1).join('L') : '');
  const area = `M${x(0).toFixed(1)},${y0.toFixed(1)}L${pts.join('L')}L${x(n - 1).toFixed(1)},${y0.toFixed(1)}Z`;
  const uid = 'c' + Math.random().toString(36).slice(2, 7);

  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Verlauf des Gleitzeit-Saldos über das Jahr' });
  svg.append(s('defs', {},
    s('clipPath', { id: uid + 'p' }, s('rect', { x: 0, y: 0, width: W, height: Math.max(0, y0) })),
    s('clipPath', { id: uid + 'n' }, s('rect', { x: 0, y: y0, width: W, height: Math.max(0, H - y0) }))));

  // Abwesenheiten als Bänder
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && days[i].absent > 0;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      svg.append(s('rect', { class: 'band', x: x(start) - 1, y: pad.t, width: x(i - 1) - x(start) + 2, height: H - pad.t - pad.b }));
      start = -1;
    }
  }
  // Monate
  let prevM = -1;
  days.forEach((d, i) => {
    const m = Number(d.date.slice(5, 7)) - 1;
    if (m === prevM) return;
    prevM = m;
    if (i > 0) svg.append(s('line', { class: 'grid', x1: x(i), x2: x(i), y1: pad.t, y2: H - pad.b }));
    svg.append(s('text', { class: 'axis', x: x(i + 14), y: H - 7, 'text-anchor': 'middle' }, MON[m]));
  });
  // Werte-Achse in Stunden
  const step = niceStep((hi - lo) / 60 / 4);
  for (let v = Math.ceil(lo / 60 / step) * step; v <= hi / 60; v += step) {
    const yy = y(v * 60);
    svg.append(s('line', { class: v === 0 ? 'zero' : 'grid', x1: pad.l, x2: W - pad.r, y1: yy, y2: yy }));
    svg.append(s('text', { class: 'axis', x: pad.l - 6, y: yy + 4, 'text-anchor': 'end' }, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' h'));
  }
  svg.append(
    s('path', { class: 'area pos', d: area, 'clip-path': `url(#${uid}p)` }),
    s('path', { class: 'area neg', d: area, 'clip-path': `url(#${uid}n)` }),
    s('path', { class: 'line past', d: line(0, Math.min(split, n - 1)) }),
    s('path', { class: 'line future', d: line(Math.max(0, split - 1), n - 1) }));
  // Saldo-Stichtage
  days.forEach((d, i) => { if (anchors.has(d.date)) svg.append(s('circle', { class: 'anchor', cx: x(i), cy: y(d.morning.gleit), r: 4 })); });
  // Heute
  if (ti >= 0 && days[0].date <= today) {
    svg.append(s('line', { class: 'today', x1: x(ti), x2: x(ti), y1: pad.t - 6, y2: H - pad.b }));
    svg.append(s('text', { class: 'axis today-label', x: x(ti) + (ti > n * 0.85 ? -4 : 4), y: pad.t, 'text-anchor': ti > n * 0.85 ? 'end' : 'start' }, 'heute'));
  }
  // Auswahl
  const cursor = s('line', { class: 'cursor', x1: 0, x2: 0, y1: pad.t, y2: H - pad.b, visibility: 'hidden' });
  const dot = s('circle', { class: 'dot', r: 5, visibility: 'hidden' });
  const hit = s('rect', { class: 'hit', x: pad.l, y: 0, width: W - pad.l - pad.r, height: H });
  svg.append(cursor, dot, hit);
  const pick = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - pad.l) / ((W - pad.l - pad.r) / n))));
    for (const el of [cursor, dot]) el.setAttribute('visibility', 'visible');
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(days[i].gleit));
    onPick?.(days[i]);
  };
  hit.addEventListener('pointermove', pick);
  hit.addEventListener('pointerdown', pick);
  hit.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'touch') return; // auf dem Handy bleibt der angetippte Tag stehen
    for (const el of [cursor, dot]) el.setAttribute('visibility', 'hidden');
    onPick?.(null);
  });
  return svg;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1)));
  for (const k of [1, 2, 5, 10]) if (raw <= k * p) return k * p;
  return 10 * p;
}
