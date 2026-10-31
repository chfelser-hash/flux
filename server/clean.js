// Eingaben prüfen und bereinigen, bevor sie gespeichert werden.
import { HOLIDAYS, isIsoDate, daysBetween } from '../public/js/flux.js';

export function httpError(status, message, extra) {
  const e = new Error(message);
  e.status = status;
  if (extra) e.extra = extra;
  return e;
}

export const str = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function num(v, min, max, what, { step = 0.01, allowNull = false } = {}) {
  if (allowNull && (v === null || v === undefined || v === '')) return null;
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw httpError(400, `${what}: bitte eine Zahl`);
  if (n < min || n > max) throw httpError(400, `${what}: zwischen ${min} und ${max}`);
  return Number((Math.round(n / step) * step).toFixed(2)) || 0; // || 0: kein «-0»
}

const int = (v, min, max, what, opts) => num(v, min, max, what, { ...opts, step: 1 });

function date(v, what) {
  const s = str(v, 10);
  if (!isIsoDate(s)) throw httpError(400, `${what}: Datum ungültig`);
  return s;
}

/** Abzug eines Feiertags: 'full', 'half' oder Minuten */
function off(v) {
  if (v === undefined || v === 'full') return 'full';
  if (v === 'half') return 'half';
  return int(v, 1, 720, 'Abzug in Minuten');
}

export function cleanSettings(b, cur) {
  const out = { ...cur };
  if (b.sollMin !== undefined) out.sollMin = int(b.sollMin, 60, 720, 'Sollzeit pro Tag');
  if (b.plusMin !== undefined) out.plusMin = int(b.plusMin, -240, 240, 'Gleitzeit pro Tag');
  if (b.eveOnWeekend !== undefined) out.eveOnWeekend = !!b.eveOnWeekend;
  if (b.weekdays !== undefined) {
    const w = [...new Set((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6).sort();
    if (!w.length) throw httpError(400, 'Mindestens ein Arbeitstag pro Woche');
    out.weekdays = w;
  }
  return out;
}

export function cleanHoliday(b, cur = { on: false, off: 'full', eveMin: 0 }) {
  const out = { ...cur };
  if (b.on !== undefined) out.on = !!b.on;
  if (b.off !== undefined) out.off = off(b.off);
  if (b.eveMin !== undefined) out.eveMin = int(b.eveMin || 0, 0, 720, 'Vorfeiertag in Minuten');
  return out;
}

/** Ganze Feiertags-Liste: { id: {on, off, eveMin} } – unbekannte Feiertage werden ignoriert */
export function cleanHolidays(b, cur) {
  const out = { ...cur };
  for (const x of HOLIDAYS) if (b && b[x.id]) out[x.id] = cleanHoliday(b[x.id], cur[x.id]);
  return out;
}

export function cleanCustomHoliday(b, cur = {}) {
  const name = str(b.name ?? cur.name, 40);
  if (!name) throw httpError(400, 'Name des Feiertags fehlt');
  const d = str(b.date ?? cur.date, 10);
  const ok = /^\d{2}-\d{2}$/.test(d) ? isIsoDate('2028-' + d) : isIsoDate(d);
  if (!ok) throw httpError(400, 'Datum: TT.MM. (jedes Jahr) oder ein bestimmtes Datum');
  return { name, date: d, off: off(b.off ?? cur.off), eveMin: int((b.eveMin ?? cur.eveMin) || 0, 0, 720, 'Vorfeiertag in Minuten') };
}

export function cleanYear(b, cur = {}) {
  const out = { anspruch: cur.anspruch ?? 25, startGleitMin: cur.startGleitMin ?? null, startFerien: cur.startFerien ?? null };
  if (b.anspruch !== undefined) out.anspruch = num(b.anspruch, 0, 100, 'Ferienanspruch');
  if (b.startGleitMin !== undefined) out.startGleitMin = int(b.startGleitMin, -60000, 60000, 'Gleitzeit-Übertrag', { allowNull: true });
  if (b.startFerien !== undefined) out.startFerien = num(b.startFerien, -100, 200, 'Ferien-Übertrag', { allowNull: true });
  return out;
}

export function cleanSaldo(b, cur = {}) {
  return {
    date: date(b.date ?? cur.date, 'Stichtag'),
    gleitMin: int(b.gleitMin ?? cur.gleitMin, -60000, 60000, 'Gleitzeit-Saldo'),
    ferien: num(b.ferien !== undefined ? b.ferien : cur.ferien, -100, 200, 'Ferien-Saldo', { allowNull: true }),
    note: str(b.note ?? cur.note, 80),
  };
}

export function cleanAbsence(b, cur = {}) {
  const from = date(b.from ?? cur.from, 'Von');
  const to = date(b.to ?? cur.to, 'Bis');
  if (to < from) throw httpError(400, '«Bis» liegt vor «Von»');
  if (daysBetween(from, to) > 400) throw httpError(400, 'Zeitraum zu lang (höchstens ein Jahr)');
  return {
    from,
    to,
    label: str(b.label ?? cur.label, 60),
    ferien: num(b.ferien ?? cur.ferien ?? 0, 0, 400, 'Ferientage'),
    gleit: num(b.gleit ?? cur.gleit ?? 0, 0, 400, 'Gleitzeittage'),
  };
}
