// Rechenkern: Feiertage, Sollzeit, Vorfeiertage, Abwesenheiten, Saldo, Jahreswechsel, Stempelrechner
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  easter, nthWeekday, ruleDate, holidaysOf, defaultHolidays, calendar, timeline, yearSummary, absencePreview,
  stamp, parseTime, hm, clock, fmtDays, dayUnits, offMinutes, customDate, isIsoDate, addDays, weekday, HOLIDAYS, DEFAULT_SETTINGS,
} from '../public/js/flux.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Ostern stimmt für bekannte Jahre', () => {
  assert.equal(easter(2024), '2024-03-31');
  assert.equal(easter(2025), '2025-04-20');
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(easter(2038), '2038-04-25');
  assert.equal(easter(2008), '2008-03-23');
});

test('Bewegliche Feiertage 2026', () => {
  const d = (id) => ruleDate(HOLIDAYS.find((x) => x.id === id).rule, 2026);
  assert.equal(d('karfreitag'), '2026-04-03');
  assert.equal(d('ostermontag'), '2026-04-06');
  assert.equal(d('auffahrt'), '2026-05-14');
  assert.equal(d('pfingstmontag'), '2026-05-25');
  assert.equal(d('fronleichnam'), '2026-06-04');
  assert.equal(d('bettagsmontag'), '2026-09-21');
  assert.equal(d('knabenschiessen'), '2026-09-14');
  assert.equal(d('genferbettag'), '2026-09-10');
  assert.equal(d('naefels'), '2026-04-02');
  assert.equal(d('sechselaeuten'), '2026-04-20');
  assert.equal(d('bundesfeier'), '2026-08-01');
  assert.equal(nthWeekday(2026, 9, 0, 3), '2026-09-20');
});

test('Datumshilfen', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(weekday('2026-10-31'), 6);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('26-2-1'), false);
  assert.equal(customDate('02-29', 2027), null);
  assert.equal(customDate('02-29', 2028), '2028-02-29');
  assert.equal(customDate('2026-12-24', 2026), '2026-12-24');
  assert.equal(customDate('2026-12-24', 2027), null);
});

test('Nur angehakte Feiertage zählen; eigene Feiertage kommen dazu', () => {
  const cfg = defaultHolidays();
  let h = holidaysOf(2026, cfg);
  assert.ok(h.has('2026-01-01'));
  assert.ok(!h.has('2026-05-01'), 'Tag der Arbeit ist standardmässig aus');
  cfg.tagderarbeit.on = true;
  h = holidaysOf(2026, cfg, [{ id: 'x', name: 'Firmenfest', date: '06-12', off: 'half' }, { id: 'y', name: 'Brücke', date: '2026-05-15' }]);
  assert.ok(h.has('2026-05-01'));
  assert.equal(h.get('2026-06-12')[0].name, 'Firmenfest');
  assert.equal(h.get('2026-05-15')[0].off, 'full');
});

test('Sollzeit: Wochenende 0, Feiertag 0, Feiertag am Wochenende ohne Einfluss', () => {
  const cal = calendar();
  assert.equal(cal.day('2026-11-02').soll, 504); // Montag
  assert.equal(cal.day('2026-10-31').soll, 0); // Samstag
  assert.equal(cal.day('2026-12-25').soll, 0); // Weihnachten, Freitag
  assert.deepEqual(cal.day('2026-12-25').holidays, ['Weihnachten']);
  // 1. August 2026 ist ein Samstag: Freitag davor normal
  assert.equal(cal.day('2026-07-31').soll, 504);
  assert.equal(cal.day('2026-08-01').soll, 0);
  // Ganzes Jahr 2026 Mo–Fr: 261 Tage, minus 7 Feiertage an Werktagen (1.8. und 26.12. sind Samstage)
  assert.equal(cal.range('2026-01-01', '2026-12-31').units, 261 - 7);
});

test('Halber Feiertag und Stunden-Abzug', () => {
  const cfg = defaultHolidays();
  cfg.sechselaeuten = { on: true, off: 'half', eveMin: 0 };
  cfg.knabenschiessen = { on: true, off: 120, eveMin: 0 };
  const cal = calendar(DEFAULT_SETTINGS, cfg);
  assert.equal(cal.day('2026-04-20').soll, 252);
  assert.equal(cal.day('2026-04-20').units, 0.5);
  assert.equal(cal.day('2026-09-14').soll, 384);
  assert.equal(cal.day('2026-09-14').units, 1);
  assert.equal(offMinutes(9999, 504), 504);
  assert.equal(offMinutes('x', 504), 0);
});

test('Vorfeiertag: weniger Sollzeit am Vortag; auf Wunsch auch vor Wochenend-Feiertagen', () => {
  const cfg = defaultHolidays();
  cfg.weihnachten.eveMin = 240; // 24.12.2026 ist Donnerstag
  cfg.bundesfeier.eveMin = 120; // 1.8.2026 Samstag → Freitag 31.7.
  cfg.auffahrt.eveMin = 60;
  let cal = calendar(DEFAULT_SETTINGS, cfg);
  assert.equal(cal.day('2026-12-24').soll, 264);
  assert.deepEqual(cal.day('2026-12-24').eve, ['Weihnachten']);
  assert.equal(cal.day('2026-05-13').soll, 444);
  assert.equal(cal.day('2026-07-31').soll, 384);
  cal = calendar({ ...DEFAULT_SETTINGS, eveOnWeekend: false }, cfg);
  assert.equal(cal.day('2026-07-31').soll, 504);
  // Vorfeiertag und halber Feiertag am selben Tag: der grössere Abzug gilt
  cfg.heiligabend = { on: true, off: 'half', eveMin: 0 };
  cal = calendar(DEFAULT_SETTINGS, cfg);
  assert.equal(cal.day('2026-12-24').soll, 252);
  // Vorfeiertag an einem Feiertag (Weihnachten ist Vortag vom Stephanstag) bleibt 0
  cfg.stephanstag.eveMin = 60;
  assert.equal(calendar(DEFAULT_SETTINGS, cfg).day('2026-12-25').soll, 0);
  // Silvester als Vortag von Neujahr im nächsten Jahr
  cfg.neujahr.eveMin = 120;
  assert.equal(calendar(DEFAULT_SETTINGS, cfg).day('2026-12-31').soll, 384);
});

test('Arbeitstage zählen auf halbe Tage gerundet', () => {
  assert.equal(dayUnits(0, 504), 0);
  assert.equal(dayUnits(504, 504), 1);
  assert.equal(dayUnits(384, 504), 1);
  assert.equal(dayUnits(252, 504), 0.5);
  assert.equal(dayUnits(30, 504), 0.5);
});

const base = () => ({
  settings: { ...DEFAULT_SETTINGS, plusMin: 20 },
  holidays: defaultHolidays(),
  customHolidays: [],
  years: { 2026: { anspruch: 25, startGleitMin: 600, startFerien: 3 } },
  saldos: [],
  absences: [],
});

test('Zeitachse: Aufbau pro Arbeitstag, Ferienanspruch und Übertrag', () => {
  const d = base();
  const tl = timeline(d);
  assert.equal(tl.days.length, 365);
  const jan1 = tl.byDate.get('2026-01-01');
  assert.equal(jan1.morning.gleit, 600);
  assert.equal(jan1.morning.ferien, 28);
  const units = tl.cal.range('2026-01-01', '2026-12-31').units;
  near(tl.byDate.get('2026-12-31').gleit, 600 + units * 20);
  assert.equal(tl.byDate.get('2026-12-31').ferien, 28);
});

test('Ferien und Gleitzeit aus einer Abwesenheit', () => {
  const d = base();
  // 2.–20.2.2026: 15 Arbeitstage, 10 Ferien, 5 Gleitzeit
  d.absences = [{ id: 'a', from: '2026-02-02', to: '2026-02-20', label: 'Skiferien', ferien: 10, gleit: 5 }];
  const tl = timeline(d);
  const a = tl.absences[0];
  assert.equal(a.units, 15);
  assert.equal(a.over, false);
  const end = tl.byDate.get('2026-02-20');
  const before = tl.byDate.get('2026-01-30');
  near(end.ferien, 28 - 10);
  // In den Ferien kein Aufbau, dafür 5 × 8:24 weniger
  near(end.gleit, before.gleit - 5 * 504);
  const s = yearSummary(tl, 2026, '2026-03-01');
  near(s.ferienTaken, 10);
  near(s.gleitTaken, 5);
  near(s.gleitTakenMin, 5 * 504);
  assert.equal(s.ferienPlanned, 0);
  near(s.ferienEnd, 18);
  assert.equal(s.months[1].ferien, 10);
  assert.equal(s.months[1].gleit, 5);
});

test('Halber Ferientag und Teil-Abwesenheit: Aufbau nur für die anwesende Zeit', () => {
  const d = base();
  d.absences = [{ id: 'h', from: '2026-03-04', to: '2026-03-04', ferien: 0.5, gleit: 0 }];
  const tl = timeline(d);
  const day = tl.byDate.get('2026-03-04');
  near(day.ferienCost, 0.5);
  near(day.plus, 10);
  near(day.absent, 0.5);
});

test('Abwesenheit mit Feiertag zählt nur Arbeitstage; zu viele Tage werden markiert', () => {
  const d = base();
  // 21.12.2026–1.1.2027 – im Jahr 2026: 21.–24., 28.–31. = 8 Tage (25./26. Feiertage)
  d.absences = [{ id: 'w', from: '2026-12-21', to: '2026-12-31', ferien: 9, gleit: 0 }];
  const tl = timeline(d);
  assert.equal(tl.absences[0].units, 8);
  assert.equal(tl.absences[0].over, true);
  const p = absencePreview(tl.cal, '2026-12-21', '2026-12-31');
  assert.equal(p.units, 8);
  assert.equal(p.days, 11);
  assert.deepEqual(p.holidays, ['Weihnachten']);
  assert.equal(absencePreview(tl.cal, '2026-12-31', '2026-12-01'), null);
  assert.equal(absencePreview(tl.cal, 'x', '2026-12-01'), null);
});

test('Saldo-Stichtag überschreibt alles davor', () => {
  const d = base();
  d.absences = [{ id: 'a', from: '2026-02-02', to: '2026-02-06', ferien: 0, gleit: 5 }];
  d.saldos = [{ id: 's', date: '2026-06-01', gleitMin: 1500 }, { id: 't', date: '2026-09-01', gleitMin: -60, ferien: 12.5 }];
  const tl = timeline(d);
  assert.equal(tl.byDate.get('2026-06-01').morning.gleit, 1500);
  near(tl.byDate.get('2026-06-01').gleit, 1520); // Montag, +20
  assert.equal(tl.byDate.get('2026-09-01').morning.gleit, -60);
  assert.equal(tl.byDate.get('2026-09-01').morning.ferien, 12.5);
  const s = yearSummary(tl, 2026, '2026-09-01');
  assert.equal(s.gleitNow, -60);
  assert.equal(s.ferienNow, 12.5);
  assert.ok(s.low && s.low.gleit <= -40);
});

test('Jahreswechsel: Saldo und Ferienrest werden übernommen, manuell überschreibbar', () => {
  const d = base();
  d.years[2027] = { anspruch: 26 };
  d.absences = [{ id: 'a', from: '2026-07-06', to: '2026-07-10', ferien: 5, gleit: 0 }];
  let tl = timeline(d);
  const end26 = tl.byDate.get('2026-12-31');
  const jan27 = tl.byDate.get('2027-01-01');
  near(jan27.morning.gleit, end26.gleit);
  near(jan27.morning.ferien, end26.ferien + 26);
  let s27 = yearSummary(tl, 2027, '2026-12-01');
  near(s27.uebertrag, 23);
  assert.equal(s27.anspruch, 26);
  near(s27.ferienNow, 49, 1e-6);
  d.years[2027] = { anspruch: 26, startGleitMin: 0, startFerien: 2 };
  tl = timeline(d);
  assert.equal(tl.byDate.get('2027-01-01').morning.gleit, 0);
  assert.equal(tl.byDate.get('2027-01-01').morning.ferien, 28);
  s27 = yearSummary(tl, 2027, '2028-01-01');
  assert.equal(s27.ferienNow, s27.ferienEnd);
  assert.equal(yearSummary(tl, 2030, '2026-01-01'), null);
  // Ein Jahr ohne Startwerte: Gleitzeit 0, kein Übertrag
  const t2 = timeline({ years: { 2026: { anspruch: 20 } } });
  assert.equal(t2.byDate.get('2026-01-01').morning.gleit, 0);
  assert.equal(t2.byDate.get('2026-01-01').morning.ferien, 20);
  assert.equal(timeline({}).days.length, 0);
});

test('Jahreszusammenfassung: Monate, Feiertage, geplant vs. genommen', () => {
  const d = base();
  d.absences = [
    { id: 'a', from: '2026-02-02', to: '2026-02-06', ferien: 5, gleit: 0 },
    { id: 'b', from: '2026-10-26', to: '2026-11-06', ferien: 6, gleit: 4 },
  ];
  const tl = timeline(d);
  const s = yearSummary(tl, 2026, '2026-11-02');
  near(s.ferienTaken, 5 + 6 * 5 / 10);
  near(s.ferienPlanned, 6 * 5 / 10);
  near(s.gleitTaken + s.gleitPlanned, 4);
  assert.equal(s.months.length, 12);
  assert.equal(s.months[0].past, true);
  assert.equal(s.months[11].past, false);
  assert.ok(s.holidays.some((x) => x.date === '2026-08-01' && x.base === 0));
  assert.ok(s.plusPast > 0 && s.plusFuture > 0);
  assert.ok(s.units > 240);
  // «Heute» vor dem Jahr
  const s0 = yearSummary(tl, 2026, '2025-06-01');
  assert.equal(s0.gleitNow, 600);
  assert.equal(s0.ferienNow, 28);
});

test('Stempelrechner', () => {
  assert.equal(parseTime('7:30'), 450);
  assert.equal(parseTime('0730'), 450);
  assert.equal(parseTime('7.30'), 450);
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime(''), null);
  assert.equal(stamp(['', '', '', ''], 504).empty, true);
  // vier Zeiten: 07:30–12:00, 12:45–17:00 = 4:30 + 4:15 = 8:45 → +21
  let r = stamp(['07:30', '12:00', '12:45', '17:00'], 504);
  assert.equal(r.worked, 525);
  assert.equal(r.pause, 45);
  assert.equal(r.diff, 21);
  r = stamp(['07:30', '12:00', '12:45', '16:30'], 504);
  assert.equal(r.diff, -9);
  // drei Zeiten: wann ist die Sollzeit erreicht?
  r = stamp(['07:30', '12:00', '12:45', ''], 504, 16 * 60);
  assert.equal(r.reachAt, 12 * 60 + 45 + 504 - 270);
  assert.equal(clock(r.reachAt), '16:39');
  assert.equal(r.running, 195);
  assert.equal(r.diffNow, 270 + 195 - 504);
  // nur Kommen
  r = stamp(['07:00'], 504);
  assert.equal(r.reachAt, 7 * 60 + 504);
  assert.equal(r.noPauseYet, true);
  assert.equal(r.running, undefined);
  // Fehler
  assert.match(stamp(['12:00', '11:00'], 504).error, /aufsteigend/);
  assert.match(stamp(['07:00', '', '13:00'], 504).error, /Lücken/);
  // Mehr als vier Zeiten gehen auch
  r = stamp(['07:00', '09:00', '09:15', '12:00', '13:00', '16:00'], 504);
  assert.equal(r.worked, 120 + 165 + 180);
});

test('Anzeige-Hilfen', () => {
  assert.equal(hm(125), '2:05');
  assert.equal(hm(-45), '−0:45');
  assert.equal(hm(90, true), '+1:30');
  assert.equal(hm(-90, true), '−1:30');
  assert.equal(hm(0, true), '±0:00');
  assert.equal(clock(-30), '23:30');
  assert.equal(clock(1500), '01:00');
  assert.equal(fmtDays(12.5), '12.5');
  assert.equal(fmtDays(3), '3');
  assert.equal(fmtDays(-0.001), '0');
});

test('Dauer eingeben', async () => {
  const { parseDuration } = await import('../public/js/flux.js');
  assert.equal(parseDuration('12:34'), 754);
  assert.equal(parseDuration('+12:34'), 754);
  assert.equal(parseDuration('-3:15'), -195);
  assert.equal(parseDuration('−0:45'), -45);
  assert.equal(parseDuration('12.5'), 750);
  assert.equal(parseDuration('1,25 h'), 75);
  assert.equal(parseDuration('-2'), -120);
  assert.equal(parseDuration('90m'), 90);
  assert.equal(parseDuration('-30min'), -30);
  assert.equal(parseDuration('1:75'), null);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration(''), null);
});

test('Erstes Jahr ohne Startwerte: Verlauf wird vom ersten Stand zurückgerechnet', () => {
  const d = { settings: { ...DEFAULT_SETTINGS, plusMin: 10 }, years: { 2026: { anspruch: 25 } }, absences: [{ id: 'a', from: '2026-02-02', to: '2026-02-06', ferien: 5, gleit: 0 }], saldos: [{ id: 's', date: '2026-10-01', gleitMin: 900, ferien: 12 }] };
  const tl = timeline(d);
  const oct = tl.byDate.get('2026-10-01');
  near(oct.pre.gleit, 900);
  near(oct.pre.ferien, 12);
  // Ferienrest am 1.1. = 12 + 5 genommene = 17 → Übertrag −8 bei Anspruch 25
  near(tl.byDate.get('2026-01-01').morning.ferien, 17);
  assert.ok(tl.byDate.get('2026-01-01').morning.gleit < 900);
  // Mit festem Startwert wird nicht zurückgerechnet
  d.years[2026].startGleitMin = 0;
  assert.equal(timeline(d).byDate.get('2026-01-01').morning.gleit, 0);
});

test('Stempelrechner: Vorholzeit erreicht um …', async () => {
  let r = stamp(['07:30', '12:00', '12:45', ''], 504, 16 * 60, 15);
  assert.equal(clock(r.reachAt), '16:39');
  assert.equal(clock(r.reachPlusAt), '16:54');
  r = stamp(['07:30', '12:00', '12:45', '17:00'], 504, null, 15);
  assert.equal(r.diff, 21);
  assert.equal(r.diffPlus, 6);
  r = stamp(['07:30', '12:00', '12:45', '16:45'], 504, null, 15);
  assert.equal(r.diffPlus, -9);
  // Schon über Soll + Vorholzeit gearbeitet: erreicht = Beginn des laufenden Blocks
  r = stamp(['06:00', '15:00', '15:30'], 504, null, 15);
  assert.equal(r.reachPlusAt, 15 * 60 + 30);
});

test('Ziffernblock: Doppelpunkt automatisch, ungültige Ziffern verworfen', async () => {
  const { timeDigits } = await import('../public/js/flux.js');
  assert.deepEqual(timeDigits('').allowed.length, 10);
  assert.equal(timeDigits('0').text, '0');
  assert.equal(timeDigits('07').text, '07:');
  assert.equal(timeDigits('073').text, '07:3');
  assert.equal(timeDigits('0730').text, '07:30');
  assert.equal(timeDigits('0730').complete, true);
  assert.equal(timeDigits('7').text, '07:', 'einstellige Stunde wird ergänzt');
  assert.equal(timeDigits('730').text, '07:30');
  assert.deepEqual(timeDigits('2').allowed, [0, 1, 2, 3]);
  assert.equal(timeDigits('25').text, '2', '25 Uhr gibt es nicht');
  assert.deepEqual(timeDigits('12').allowed, [0, 1, 2, 3, 4, 5]);
  assert.equal(timeDigits('1290').text, '12:0', '9x Minuten gibt es nicht');
  assert.equal(timeDigits('12:45').text, '12:45');
  assert.deepEqual(timeDigits('1245').allowed, []);
  assert.equal(timeDigits('123456').digits, '1234');
});
