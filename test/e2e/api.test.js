// Jeder API-Aufruf mit Erfolgs- und Fehlerfällen – nur erfundene Testdaten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, apiClient } from './helpers.js';

let srv, api;
const data = async () => (await api('GET', '/api/data')).data;

before(async () => {
  srv = await startServer();
  api = apiClient(srv.base);
});
after(() => srv.stop());

test('Erster Start: einrichten mit Anspruch und aktuellem Stand', async () => {
  let s = (await api('GET', '/api/status')).data;
  assert.equal(s.needsSetup, true);
  assert.equal((await api('POST', '/api/setup', { anspruch: 25, saldo: { date: '2026-13-01', gleitMin: 0 } })).status, 400);
  assert.equal((await api('POST', '/api/setup', { anspruch: 'x', saldo: { date: '2026-10-01', gleitMin: 0 } })).status, 400);
  const r = await api('POST', '/api/setup', { anspruch: 25, saldo: { date: '2026-10-01', gleitMin: 754, ferien: 8.5 }, settings: { sollMin: 504, plusMin: 20 } });
  assert.equal(r.status, 200);
  s = (await api('GET', '/api/status')).data;
  assert.equal(s.needsSetup, false);
  assert.equal((await api('POST', '/api/setup', { anspruch: 20 })).status, 403);
  const d = await data();
  assert.deepEqual(d.years['2026'], { anspruch: 25, startGleitMin: null, startFerien: null });
  assert.equal(d.saldos[0].gleitMin, 754);
  assert.equal(d.saldos[0].note, 'Startwert');
  assert.equal(d.settings.plusMin, 20);
  assert.equal(d.holidays.neujahr.on, true);
});

test('Schutz: schreibende Aufrufe brauchen den Header, kaputtes JSON wird abgelehnt', async () => {
  assert.equal((await api('PUT', '/api/settings', { plusMin: 5 }, { 'X-Flux': '' })).status, 403);
  assert.equal((await api('PUT', '/api/settings', '{kaputt')).status, 400);
  assert.equal((await api('GET', '/api/nichts')).status, 404);
  const big = 'x'.repeat(21 * 1024 * 1024);
  assert.equal((await api('PUT', '/api/settings', JSON.stringify({ a: big }))).status, 413);
});

test('Daten nur bei Änderung neu senden', async () => {
  const d = await data();
  assert.equal((await api('GET', `/api/data?rev=${d.rev}`)).data.same, true);
  assert.ok((await api('GET', `/api/data?rev=${d.rev - 1}`)).data.settings);
});

test('Einstellungen prüfen', async () => {
  assert.equal((await api('PUT', '/api/settings', { sollMin: 10 })).status, 400);
  assert.equal((await api('PUT', '/api/settings', { weekdays: [] })).status, 400);
  assert.equal((await api('PUT', '/api/settings', { plusMin: 'viel' })).status, 400);
  assert.equal((await api('PUT', '/api/settings', { sollMin: 492, plusMin: 15, weekdays: [5, 1, 2, 2, 9, 3, 4], eveOnWeekend: false })).status, 200);
  const st = (await data()).settings;
  assert.deepEqual(st.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(st.sollMin, 492);
  assert.equal(st.eveOnWeekend, false);
  await api('PUT', '/api/settings', { sollMin: 504, eveOnWeekend: true });
});

test('Feiertage anhaken, halber Tag, Stunden, Vorfeiertag', async () => {
  assert.equal((await api('PUT', '/api/holidays', { weihnachten: { eveMin: 2000 } })).status, 400);
  assert.equal((await api('PUT', '/api/holidays', { weihnachten: { off: 0 } })).status, 400);
  const r = await api('PUT', '/api/holidays', { weihnachten: { eveMin: 120 }, tagderarbeit: { on: true, off: 'half' }, knabenschiessen: { on: true, off: 240 }, unbekannt: { on: true } });
  assert.equal(r.status, 200);
  const h = (await data()).holidays;
  assert.deepEqual(h.weihnachten, { on: true, off: 'full', eveMin: 120 });
  assert.equal(h.tagderarbeit.off, 'half');
  assert.equal(h.knabenschiessen.off, 240);
  assert.equal(h.unbekannt, undefined);
});

test('Eigene Feiertage: jedes Jahr oder einmalig', async () => {
  assert.equal((await api('POST', '/api/custom-holidays', { name: '', date: '06-12' })).status, 400);
  assert.equal((await api('POST', '/api/custom-holidays', { name: 'X', date: '13-12' })).status, 400);
  assert.equal((await api('POST', '/api/custom-holidays', { name: 'X', date: '2026-02-30' })).status, 400);
  const a = (await api('POST', '/api/custom-holidays', { name: 'Firmenfest', date: '06-12', off: 'half' })).data.item;
  const b = (await api('POST', '/api/custom-holidays', { name: 'Brücke', date: '2026-05-15' })).data.item;
  assert.equal((await api('PUT', `/api/custom-holidays/${a.id}`, { eveMin: 60, name: 'Firmenfest 2' })).status, 200);
  let list = (await data()).customHolidays;
  assert.equal(list.length, 2);
  assert.equal(list[0].eveMin, 60);
  assert.equal(list[0].name, 'Firmenfest 2');
  assert.equal(list[0].off, 'half');
  assert.equal((await api('PUT', '/api/custom-holidays/nix', { name: 'Y' })).status, 404);
  assert.equal((await api('DELETE', `/api/custom-holidays/${b.id}`)).status, 200);
  assert.equal((await api('DELETE', `/api/custom-holidays/${b.id}`)).status, 404);
  list = (await data()).customHolidays;
  assert.equal(list.length, 1);
});

test('Abwesenheiten: Arbeitstage prüfen, Jahre automatisch ergänzen', async () => {
  assert.equal((await api('POST', '/api/absences', { from: '2026-02-20', to: '2026-02-02' })).status, 400);
  assert.equal((await api('POST', '/api/absences', { from: '2026-02-02', to: '2027-12-31' })).status, 400);
  assert.equal((await api('POST', '/api/absences', { from: '2026-02-07', to: '2026-02-08', ferien: 1 })).status, 400, 'nur Wochenende');
  const over = await api('POST', '/api/absences', { from: '2026-02-02', to: '2026-02-06', ferien: 4, gleit: 2 });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /nur 5 Arbeitstage/);
  assert.equal((await api('POST', '/api/absences', { from: '2026-02-02', to: '2026-02-06', ferien: -1 })).status, 400);
  const a = (await api('POST', '/api/absences', { from: '2026-02-02', to: '2026-02-20', label: 'Skiferien', ferien: 10, gleit: 5 })).data.item;
  assert.equal(a.ferien, 10);
  const half = (await api('POST', '/api/absences', { from: '2026-03-04', to: '2026-03-04', ferien: 0.5 })).data.item;
  assert.equal(half.gleit, 0);
  // Über den Jahreswechsel: 2027 wird mit dem Anspruch von 2026 angelegt
  const w = await api('POST', '/api/absences', { from: '2026-12-28', to: '2027-01-08', label: 'Winter', ferien: 6, gleit: 2 });
  assert.equal(w.status, 200);
  let d = await data();
  assert.equal(d.years['2027'].anspruch, 25);
  assert.equal(d.absences.length, 3);
  assert.equal((await api('PUT', `/api/absences/${a.id}`, { gleit: 6 })).status, 400);
  assert.equal((await api('PUT', `/api/absences/${a.id}`, { ferien: 9, gleit: 6, label: 'Ski' })).status, 200);
  d = await data();
  assert.equal(d.absences.find((x) => x.id === a.id).label, 'Ski');
  assert.equal((await api('PUT', '/api/absences/nix', {})).status, 404);
  assert.equal((await api('DELETE', `/api/absences/${half.id}`)).status, 200);
  assert.equal((await api('DELETE', `/api/absences/${half.id}`)).status, 404);
});

test('Saldo-Stichtage: pro Tag einer, bearbeiten, löschen', async () => {
  assert.equal((await api('POST', '/api/saldos', { date: '2026-11-02' })).status, 400);
  assert.equal((await api('POST', '/api/saldos', { date: '2026-11-02', gleitMin: 'viel' })).status, 400);
  const a = (await api('POST', '/api/saldos', { date: '2026-11-02', gleitMin: 800, note: 'Zeiterfassung' })).data.item;
  const b = (await api('POST', '/api/saldos', { date: '2026-11-02', gleitMin: 810 })).data.item;
  let list = (await data()).saldos.filter((x) => x.date === '2026-11-02');
  assert.equal(list.length, 1, 'ein neuer Stand ersetzt den alten am selben Tag');
  assert.equal(list[0].id, b.id);
  assert.equal((await api('PUT', `/api/saldos/${a.id}`, { gleitMin: 1 })).status, 404);
  const c = (await api('POST', '/api/saldos', { date: '2026-12-01', gleitMin: 100, ferien: 3 })).data.item;
  assert.equal(c.ferien, 3);
  assert.equal((await api('PUT', `/api/saldos/${c.id}`, { date: '2026-11-02' })).status, 400);
  assert.equal((await api('PUT', `/api/saldos/${c.id}`, { gleitMin: -45, ferien: null })).status, 200);
  list = (await data()).saldos;
  assert.equal(list.find((x) => x.id === c.id).gleitMin, -45);
  assert.equal(list.find((x) => x.id === c.id).ferien, null);
  // Stand in einem neuen Jahr legt das Jahr an
  const z = (await api('POST', '/api/saldos', { date: '2028-01-05', gleitMin: 0 })).data.item;
  assert.ok((await data()).years['2028']);
  assert.equal((await api('DELETE', `/api/saldos/${z.id}`)).status, 200);
  assert.equal((await api('DELETE', `/api/saldos/${z.id}`)).status, 404);
});

test('Jahre: anlegen, Übertrag von Hand, nur Randjahre löschen', async () => {
  assert.equal((await api('PUT', '/api/years/2027', { anspruch: 27, startFerien: '', startGleitMin: 120 })).status, 200);
  let y = (await data()).years;
  assert.deepEqual(y['2027'], { anspruch: 27, startGleitMin: 120, startFerien: null });
  assert.equal((await api('PUT', '/api/years/2027', { anspruch: 200 })).status, 400);
  assert.equal((await api('PUT', '/api/years/2027', { startGleitMin: 'x' })).status, 400);
  assert.equal((await api('PUT', '/api/years/2030', { anspruch: 30 })).status, 200);
  y = (await data()).years;
  assert.ok(y['2029'], 'Lücke wird gefüllt');
  assert.equal(y['2030'].anspruch, 30);
  assert.equal((await api('PUT', '/api/years/2200', {})).status, 400);
  assert.equal((await api('DELETE', '/api/years/2028')).status, 400, 'Jahr in der Mitte');
  assert.equal((await api('DELETE', '/api/years/1999')).status, 404);
  assert.equal((await api('DELETE', '/api/years/2030')).status, 200);
  assert.equal((await api('DELETE', '/api/years/2029')).status, 200);
  assert.equal((await api('DELETE', '/api/years/2028')).status, 200);
  // Jahr 2027 löschen entfernt auch die Abwesenheit über den Jahreswechsel
  assert.equal((await api('DELETE', '/api/years/2027')).status, 200);
  const d = await data();
  assert.ok(!d.absences.some((a) => a.to.startsWith('2027')));
  assert.equal((await api('DELETE', '/api/years/2026')).status, 400, 'letztes Jahr');
});

test('Sicherung: herunterladen, einspielen, Server-Sicherungen', async () => {
  const dl = await api('GET', '/api/backup');
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /flux-sicherung-/);
  assert.equal(dl.data.app, 'flux');
  assert.equal((await api('POST', '/api/restore', { app: 'andere' })).status, 400);
  const mod = { ...dl.data, absences: [], years: { 2026: { anspruch: 20 } } };
  assert.equal((await api('POST', '/api/restore', mod)).status, 200);
  let d = await data();
  assert.equal(d.absences.length, 0);
  assert.equal(d.years['2026'].anspruch, 20);
  assert.ok(d.holidays.neujahr, 'fehlende Teile werden ergänzt');
  const made = await api('POST', '/api/backups');
  assert.ok(made.data.name.startsWith('manuell-'));
  const list = (await api('GET', '/api/backups')).data.backups;
  assert.ok(list.some((b) => b.name.startsWith('vor-wiederherstellung-')));
  const one = await api('GET', `/api/backups/${made.data.name}`);
  assert.equal(one.status, 200);
  assert.equal((await api('GET', '/api/backups/gibts-nicht.json')).status, 404);
  assert.equal((await api('POST', '/api/backups/gibts-nicht.json/restore')).status, 404);
  const vor = list.find((b) => b.name.startsWith('vor-wiederherstellung-'));
  assert.equal((await api('POST', `/api/backups/${vor.name}/restore`)).status, 200);
  d = await data();
  assert.equal(d.years['2026'].anspruch, 25);
  // Tägliche Sicherung liegt im Datenordner
  assert.ok(fs.readdirSync(path.join(srv.dataDir, 'backups')).some((f) => /^flux-\d{4}-\d{2}-\d{2}\.json$/.test(f)));
});

test('Statische Dateien, Service Worker mit Version, kein Ausbruch aus dem Ordner', async () => {
  let r = await fetch(srv.base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<title>Flux<\/title>/);
  r = await fetch(srv.base + '/sw.js');
  assert.match(await r.text(), /flux-shell-\d+\.\d+\.\d+/);
  r = await fetch(srv.base + '/js/flux.js');
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(srv.base + '/gibts-nicht.css')).status, 404);
  assert.notEqual((await fetch(srv.base + '/%2e%2e/package.json')).status, 200);
  assert.notEqual((await fetch(srv.base + '/..%2Fpackage.json')).status, 200);
  assert.equal((await fetch(srv.base + '/%E0%A4%A.css')).status, 400);
  assert.ok((await fetch(srv.base + '/einstellungen')).ok, 'Pfad ohne Endung → App');
});

test('Update: ungültige Version wird abgelehnt', async () => {
  assert.equal((await api('POST', '/api/update', { version: 'abc' })).status, 400);
});
