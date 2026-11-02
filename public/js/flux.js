// Flux – Rechenkern: Feiertage, Sollzeit pro Tag, Vorfeiertage, Abwesenheiten, Saldo-Stichtage, Jahreswechsel,
// Stempelrechner. Ohne Abhängigkeiten; wird von Browser, Server und Tests gemeinsam genutzt.
// Datumswerte immer als Text 'JJJJ-MM-TT', Zeiten in Minuten.

// ---------- Datum ----------
const DAY = 864e5;
export const toDate = (s) => new Date(s + 'T00:00:00Z');
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (s, n) => iso(toDate(s).getTime() + n * DAY);
export const weekday = (s) => toDate(s).getUTCDay(); // 0 = Sonntag … 6 = Samstag
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(toDate(s).getTime()) && iso(toDate(s)) === s;
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
export const yearOf = (s) => Number(String(s).slice(0, 4));

/** Ostersonntag (gregorianisch, Algorithmus nach Gauss/Meeus) */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31);
  const day = ((hh + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(y, month - 1, day));
}

/** n-ter Wochentag eines Monats (wd: 0 = So … 6 = Sa) */
export function nthWeekday(y, month, wd, n) {
  const first = iso(Date.UTC(y, month - 1, 1));
  return addDays(first, ((wd - weekday(first) + 7) % 7) + (n - 1) * 7);
}

// ---------- Feiertage ----------
// rule: 'MM-TT' (fest), { easter: Tage } (relativ zu Ostern) oder { nth: [Monat, Wochentag, n], plus: Tage }
export const HOLIDAYS = [
  { id: 'neujahr', name: 'Neujahr', rule: '01-01' },
  { id: 'berchtold', name: 'Berchtoldstag', rule: '01-02' },
  { id: 'dreikoenig', name: 'Heilige Drei Könige', rule: '01-06' },
  { id: 'josef', name: 'Josefstag', rule: '03-19' },
  { id: 'karfreitag', name: 'Karfreitag', rule: { easter: -2 } },
  { id: 'ostermontag', name: 'Ostermontag', rule: { easter: 1 } },
  { id: 'naefels', name: 'Näfelser Fahrt', rule: { nth: [4, 4, 1] }, hint: '1. Donnerstag im April' },
  { id: 'sechselaeuten', name: 'Sechseläuten', rule: { nth: [4, 1, 3] }, hint: '3. Montag im April (Ausnahmen als eigenen Feiertag erfassen)' },
  { id: 'tagderarbeit', name: 'Tag der Arbeit', rule: '05-01' },
  { id: 'auffahrt', name: 'Auffahrt', rule: { easter: 39 } },
  { id: 'pfingstmontag', name: 'Pfingstmontag', rule: { easter: 50 } },
  { id: 'fronleichnam', name: 'Fronleichnam', rule: { easter: 60 } },
  { id: 'peterpaul', name: 'Peter und Paul', rule: '06-29' },
  { id: 'bundesfeier', name: 'Bundesfeier', rule: '08-01' },
  { id: 'mariahimmelfahrt', name: 'Mariä Himmelfahrt', rule: '08-15' },
  { id: 'genferbettag', name: 'Jeûne genevois', rule: { nth: [9, 0, 1], plus: 4 }, hint: 'Donnerstag nach dem 1. Sonntag im September' },
  { id: 'knabenschiessen', name: 'Knabenschiessen', rule: { nth: [9, 0, 2], plus: 1 }, hint: 'Montag nach dem 2. Sonntag im September' },
  { id: 'bettagsmontag', name: 'Bettagsmontag', rule: { nth: [9, 0, 3], plus: 1 } },
  { id: 'allerheiligen', name: 'Allerheiligen', rule: '11-01' },
  { id: 'mariaempfaengnis', name: 'Mariä Empfängnis', rule: '12-08' },
  { id: 'heiligabend', name: 'Heiligabend', rule: '12-24' },
  { id: 'weihnachten', name: 'Weihnachten', rule: '12-25' },
  { id: 'stephanstag', name: 'Stephanstag', rule: '12-26' },
  { id: 'silvester', name: 'Silvester', rule: '12-31' },
];

const DEFAULT_ON = ['neujahr', 'berchtold', 'karfreitag', 'ostermontag', 'auffahrt', 'pfingstmontag', 'bundesfeier', 'weihnachten', 'stephanstag'];

/** Voreinstellung pro Feiertag: on, off ('full' | 'half' | Minuten), eveMin (Vorfeiertag: so viel weniger Sollzeit am Vortag) */
export function defaultHolidays() {
  return Object.fromEntries(HOLIDAYS.map((x) => [x.id, { on: DEFAULT_ON.includes(x.id), off: 'full', eveMin: 0 }]));
}

export const DEFAULT_SETTINGS = {
  sollMin: 504, // 8 Std. 24 Min.
  weekdays: [1, 2, 3, 4, 5],
  plusMin: 15, // durchschnittlicher Gleitzeit-Aufbau pro vollem Arbeitstag
  eveOnWeekend: true, // Vorfeiertag auch, wenn der Feiertag selbst aufs Wochenende fällt
};

export function ruleDate(rule, y) {
  if (typeof rule === 'string') return `${y}-${rule}`;
  if (rule.easter !== undefined) return addDays(easter(y), rule.easter);
  const [m, wd, n] = rule.nth;
  return addDays(nthWeekday(y, m, wd, n), rule.plus || 0);
}

/** Datum eines eigenen Feiertags in einem Jahr: 'MM-TT' jedes Jahr, 'JJJJ-MM-TT' nur in diesem Jahr */
export function customDate(date, y) {
  if (/^\d{2}-\d{2}$/.test(date)) {
    const d = `${y}-${date}`;
    return isIsoDate(d) ? d : null; // 29.2. nur in Schaltjahren
  }
  return yearOf(date) === y ? date : null;
}

/** Alle aktiven Feiertage eines Jahres: Map Datum → [{id, name, off, eveMin}] */
export function holidaysOf(y, holidays = defaultHolidays(), custom = []) {
  const out = new Map();
  const add = (date, hd) => { if (date) out.set(date, [...(out.get(date) || []), hd]); };
  for (const x of HOLIDAYS) {
    const cfg = holidays[x.id];
    if (!cfg?.on) continue;
    add(ruleDate(x.rule, y), { id: x.id, name: x.name, off: cfg.off ?? 'full', eveMin: cfg.eveMin || 0 });
  }
  for (const c of custom) add(customDate(c.date, y), { id: c.id, name: c.name, off: c.off ?? 'full', eveMin: c.eveMin || 0, custom: true });
  return out;
}

/** Ganzer, halber oder Minuten-Abzug eines Feiertags bei einer Tages-Sollzeit */
export const offMinutes = (off, base) => (off === 'full' ? base : off === 'half' ? base / 2 : Math.min(base, Number(off) || 0));

/** Zählt die Sollzeit eines Tages in Arbeitstagen (auf halbe Tage gerundet) */
export const dayUnits = (soll, full) => (soll <= 0 ? 0 : Math.max(0.5, Math.round((soll / full) * 2) / 2));

/** Kalender mit Zwischenspeicher: Sollzeit pro Tag inkl. Feiertage und Vorfeiertage */
export function calendar(settings = DEFAULT_SETTINGS, holidays = defaultHolidays(), custom = []) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const years = new Map();
  const hol = (date) => {
    const y = yearOf(date);
    if (!years.has(y)) years.set(y, holidaysOf(y, holidays, custom));
    return years.get(y).get(date) || [];
  };
  const isWorkday = (date) => s.weekdays.includes(weekday(date));

  /** {soll, base, holidays: [Namen], eve: [Namen], units} */
  function day(date) {
    const base = isWorkday(date) ? s.sollMin : 0;
    const today = hol(date);
    const next = addDays(date, 1);
    const eves = hol(next).filter((x) => x.eveMin > 0 && (s.eveOnWeekend || isWorkday(next)));
    if (!base) return { soll: 0, base: 0, holidays: today.map((x) => x.name), eve: [], units: 0 };
    let red = 0;
    for (const x of today) red = Math.max(red, offMinutes(x.off, base));
    for (const x of eves) red = Math.max(red, Math.min(base, x.eveMin));
    const soll = Math.max(0, Math.round(base - red));
    return { soll, base, holidays: today.map((x) => x.name), eve: eves.map((x) => x.name), units: dayUnits(soll, s.sollMin) };
  }

  /** Arbeitstage (Einheiten) und Sollzeit in einem Zeitraum (beide Daten inklusive) */
  function range(from, to) {
    let units = 0, soll = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { const x = day(d); units += x.units; soll += x.soll; }
    return { units, soll };
  }

  return { day, range, settings: s, holidays: (y) => { hol(`${y}-01-01`); return years.get(y); } };
}

// ---------- Zeitachse ----------
/**
 * Rechnet Tag für Tag durch alle erfassten Jahre:
 * - 1. Januar: Ferienanspruch des Jahres kommt dazu, Rest und Gleitzeit werden übernommen (oder von Hand gesetzt)
 * - Saldo-Stichtag: Gleitzeit (und auf Wunsch Ferien) gilt ab diesem Tag (Stand am Morgen)
 * - Arbeitstag: + durchschnittlicher Aufbau (anteilig, nur wenn anwesend)
 * - Abwesenheit: die erfassten Ferien- und Gleitzeittage werden gleichmässig auf ihre Arbeitstage verteilt
 * Liefert pro Tag den Stand am Abend.
 * Hat das erste Jahr keine Startwerte, rechnet Flux vom ersten eingetragenen Stand zurück – der Verlauf davor
 * passt dann zu diesem Stand, statt bei null zu beginnen.
 */
export function timeline(data) {
  const tl = run(data, { gleit: 0, ferien: 0 });
  const yc = tl.years.length ? data.years[tl.years[0]] : null;
  const firstAnchor = tl.days.find((x) => x.anchor && yearOf(x.date) === tl.years[0]);
  if (!yc || !firstAnchor) return tl;
  const shift = { gleit: 0, ferien: 0 };
  if (yc.startGleitMin === undefined || yc.startGleitMin === null) shift.gleit = firstAnchor.anchor.gleitMin - firstAnchor.pre.gleit;
  if ((yc.startFerien === undefined || yc.startFerien === null) && firstAnchor.anchor.ferien !== undefined && firstAnchor.anchor.ferien !== null) shift.ferien = firstAnchor.anchor.ferien - firstAnchor.pre.ferien;
  return shift.gleit || shift.ferien ? run(data, shift) : tl;
}

function run(data, shift) {
  const s = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  const cal = calendar(s, data.holidays || defaultHolidays(), data.customHolidays || []);
  const yearKeys = Object.keys(data.years || {}).map(Number).sort((a, b) => a - b);
  if (!yearKeys.length) return { days: [], byDate: new Map(), cal, years: [], absences: [] };
  const first = yearKeys[0], last = yearKeys[yearKeys.length - 1];
  const full = s.sollMin;

  // Abwesenheiten vorbereiten: Arbeitstage im Zeitraum, Anteil pro Einheit
  const absences = (data.absences || []).map((a) => {
    const r = cal.range(a.from, a.to);
    const ferien = Number(a.ferien) || 0, gleit = Number(a.gleit) || 0;
    return { ...a, ferien, gleit, units: r.units, soll: r.soll, over: ferien + gleit > r.units + 1e-9 };
  });
  const absOn = (date) => absences.filter((a) => a.from <= date && date <= a.to);
  const saldos = new Map();
  for (const x of [...(data.saldos || [])].sort((a, b) => a.date.localeCompare(b.date))) saldos.set(x.date, x);

  const days = [];
  const byDate = new Map();
  let gleit = 0, ferien = 0;
  for (let d = `${first}-01-01`; d <= `${last}-12-31`; d = addDays(d, 1)) {
    const y = yearOf(d);
    const yc = data.years[y] || {};
    let startOfYear = null;
    if (d.endsWith('-01-01')) {
      const uebertrag = yc.startFerien ?? (y === first ? shift.ferien : ferien);
      if (yc.startGleitMin !== undefined && yc.startGleitMin !== null) gleit = yc.startGleitMin;
      else if (y === first) gleit = shift.gleit;
      ferien = uebertrag + (Number(yc.anspruch) || 0);
      startOfYear = { gleit, uebertrag, anspruch: Number(yc.anspruch) || 0 };
    }
    const anchor = saldos.get(d) || null;
    const pre = { gleit, ferien };
    if (anchor) {
      gleit = anchor.gleitMin;
      if (anchor.ferien !== undefined && anchor.ferien !== null) ferien = anchor.ferien;
    }
    const morning = { gleit, ferien };
    const c = cal.day(d);
    let plus = 0, gleitCost = 0, ferienCost = 0, gleitUnits = 0, absent = 0;
    const here = c.units ? absOn(d) : [];
    for (const a of here) {
      if (!a.units) continue;
      const share = c.units / a.units;
      ferienCost += a.ferien * share;
      gleitUnits += a.gleit * share;
      absent += Math.min(1, (a.ferien + a.gleit) / a.units);
    }
    if (c.soll) {
      const present = Math.max(0, 1 - absent);
      plus = s.plusMin * (c.soll / full) * present;
      gleitCost = gleitUnits * full;
    }
    gleit += plus - gleitCost;
    ferien -= ferienCost;
    const rec = { date: d, ...c, plus, gleitCost, gleitUnits, ferienCost, absent: Math.min(1, absent), absences: here.map((a) => a.id), anchor, pre, startOfYear, morning, gleit, ferien };
    days.push(rec);
    byDate.set(d, rec);
  }
  return { days, byDate, cal, years: yearKeys, absences, settings: s };
}

const r2 = (x) => Math.round(x * 100) / 100;

/** Zusammenfassung eines Jahres; «heute» trennt Genommenes von Geplantem */
export function yearSummary(tl, y, today) {
  const days = tl.days.filter((x) => yearOf(x.date) === y);
  if (!days.length) return null;
  const sum = (list, k) => list.reduce((acc, x) => acc + x[k], 0);
  const past = days.filter((x) => x.date < today), future = days.filter((x) => x.date >= today);
  const start = days[0].startOfYear;
  const lastDay = days[days.length - 1];
  const todayRec = yearOf(today) === y ? tl.byDate.get(today) : null;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const md = days.filter((x) => Number(x.date.slice(5, 7)) === m);
    const end = md[md.length - 1];
    let low = md[0];
    for (const x of md) if (x.gleit < low.gleit) low = x;
    months.push({
      month: m,
      units: sum(md, 'units'),
      soll: sum(md, 'soll'),
      ferien: r2(sum(md, 'ferienCost')),
      gleit: r2(sum(md, 'gleitUnits')),
      plus: sum(md, 'plus'),
      gleitEnd: end.gleit,
      ferienEnd: r2(end.ferien),
      low: low.gleit,
      past: end.date < today,
    });
  }
  // Tiefster Gleitzeit-Stand ab heute (zeigt, ob ein geplanter Abbau aufgeht)
  let low = null;
  for (const x of future) if (!low || x.gleit < low.gleit) low = x;
  const holidays = [...tl.cal.holidays(y).entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    year: y,
    anspruch: start.anspruch,
    uebertrag: r2(start.uebertrag),
    gleitStart: start.gleit,
    units: sum(days, 'units'),
    soll: sum(days, 'soll'),
    ferienTaken: r2(sum(past, 'ferienCost')),
    ferienPlanned: r2(sum(future, 'ferienCost')),
    gleitTaken: r2(sum(past, 'gleitUnits')),
    gleitPlanned: r2(sum(future, 'gleitUnits')),
    gleitTakenMin: sum(past, 'gleitCost'),
    gleitPlannedMin: sum(future, 'gleitCost'),
    plusPast: sum(past, 'plus'),
    plusFuture: sum(future, 'plus'),
    gleitNow: todayRec ? todayRec.morning.gleit : (today < days[0].date ? start.gleit : lastDay.gleit),
    ferienNow: r2(todayRec ? todayRec.morning.ferien : (today < days[0].date ? start.uebertrag + start.anspruch : lastDay.ferien)),
    gleitEnd: lastDay.gleit,
    ferienEnd: r2(lastDay.ferien),
    low: low ? { date: low.date, gleit: low.gleit } : null,
    months,
    holidays: holidays.map(([date, list]) => ({ date, names: list.map((x) => x.name), soll: tl.byDate.get(date)?.soll ?? null, base: tl.byDate.get(date)?.base ?? 0 })),
  };
}

/** Vorschau für eine Abwesenheit, bevor sie gespeichert ist */
export function absencePreview(cal, from, to) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return null;
  const r = cal.range(from, to);
  const hol = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const x = cal.day(d); if (x.holidays.length && x.base) hol.push(...x.holidays); }
  return { ...r, days: daysBetween(from, to) + 1, holidays: hol };
}

// ---------- Stempelrechner ----------
export function parseTime(t) {
  const m = String(t ?? '').trim().match(/^(\d{1,2})[:.h]?(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : null;
}

/**
 * times: Stempelzeiten der Reihe nach (Kommen, Gehen, Kommen, Gehen …), leere sind erlaubt.
 * Liefert gearbeitete Zeit, Differenz zur Sollzeit und – wenn gerade gearbeitet wird – wann die Sollzeit erreicht ist.
 * plusMin: angestrebte Vorholzeit für heute (Sollzeit + plusMin = Ziel); liefert dazu reachPlusAt bzw. diffPlus.
 */
export function stamp(times, sollMin, nowMin = null, plusMin = 0) {
  const t = times.map(parseTime);
  let lastFilled = -1;
  t.forEach((x, i) => { if (x !== null) lastFilled = i; });
  const list = t.slice(0, lastFilled + 1);
  if (!list.length) return { empty: true, worked: 0, pause: 0, soll: sollMin };
  if (list.some((x) => x === null)) return { error: 'Bitte die Zeiten der Reihe nach ausfüllen (keine Lücken)', soll: sollMin };
  for (let i = 1; i < list.length; i++) if (list[i] <= list[i - 1]) return { error: 'Die Zeiten müssen aufsteigend sein', soll: sollMin };
  let worked = 0, pause = 0;
  for (let i = 0; i + 1 < list.length; i += 2) worked += list[i + 1] - list[i];
  for (let i = 1; i + 1 < list.length; i += 2) pause += list[i + 1] - list[i];
  const open = list.length % 2 === 1;
  const out = { worked, pause, soll: sollMin, open, plus: plusMin };
  if (open) {
    const start = list[list.length - 1];
    out.reachAt = start + Math.max(0, sollMin - worked);
    out.reachPlusAt = start + Math.max(0, sollMin + plusMin - worked);
    out.noPauseYet = list.length === 1;
    if (nowMin !== null && nowMin > start) {
      out.running = nowMin - start;
      out.diffNow = worked + out.running - sollMin;
    }
  } else {
    out.diff = worked - sollMin;
    out.diffPlus = out.diff - plusMin;
  }
  return out;
}

/**
 * Ziffernblock-Eingabe einer Uhrzeit: Ziffern ohne Doppelpunkt («0730», «730» geht nicht – die 7 wird zu «07»).
 * Liefert {digits, text, complete, allowed} – allowed: welche Ziffern als Nächstes gültig sind.
 */
export function timeDigits(digits) {
  let d = String(digits || '').replace(/\D/g, '').slice(0, 4);
  // Erste Ziffer 3–9 kann nur eine einstellige Stunde sein → «07»
  if (d.length >= 1 && Number(d[0]) >= 3) d = ('0' + d).slice(0, 4);
  const allowed = (len, first) => {
    if (len === 0) return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (len === 1) return first === '2' ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (len === 2) return [0, 1, 2, 3, 4, 5];
    if (len === 3) return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return [];
  };
  // Ungültige Ziffern verwerfen (z.B. «25»)
  let ok = '';
  for (const ch of d) if (allowed(ok.length, ok[0]).includes(Number(ch))) ok += ch;
  const text = ok.length <= 2 ? ok + (ok.length === 2 ? ':' : '') : `${ok.slice(0, 2)}:${ok.slice(2)}`;
  return { digits: ok, text, complete: ok.length === 4, allowed: allowed(ok.length, ok[0]) };
}

// ---------- Anzeige ----------
/** Minuten → «7:05» bzw. mit Vorzeichen «+1:30» / «−0:45» */
export function hm(min, sign = false) {
  const v = Math.round(min);
  const a = Math.abs(v);
  const txt = `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
  if (!sign) return (v < 0 ? '−' : '') + txt;
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + txt;
}

/** Minuten → «07:05» (Uhrzeit) */
export const clock = (min) => {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

/** Tage mit höchstens zwei Nachkommastellen, ohne unnötige Nullen («12.5», «3») */
export const fmtDays = (x) => {
  const v = Math.round(x * 100) / 100;
  return (Object.is(v, -0) ? 0 : v).toLocaleString('de-CH', { maximumFractionDigits: 2 });
};

/**
 * Eingabe einer Dauer → Minuten: «12:34», «+12:34», «-3:15», «−0:45», «12.5» (Stunden), «12» (Stunden), «90m».
 * Liefert null bei ungültiger Eingabe.
 */
export function parseDuration(v) {
  const t = String(v ?? '').trim().replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/h$/i, '');
  if (!t) return null;
  let m = t.match(/^([+-]?)(\d{1,4}):(\d{1,2})$/);
  if (m) {
    if (Number(m[3]) > 59) return null;
    const x = Number(m[2]) * 60 + Number(m[3]);
    return m[1] === '-' ? -x : x;
  }
  m = t.match(/^([+-]?)(\d{1,5})(?:min|m)$/i);
  if (m) return (m[1] === '-' ? -1 : 1) * Number(m[2]);
  m = t.match(/^([+-]?\d{1,4}(?:[.,]\d+)?)$/);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 60);
  return null;
}
