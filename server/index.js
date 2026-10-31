// Flux – Ferien und Gleitzeit. Server ohne externe Abhängigkeiten (nur Node.js >= 20), Aufbau wie Kässeli, Reisli und Bracket.
// Bewusst ohne Login: Zugriff nur im Heimnetz, per VPN oder hinter Cloudflare Access.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, newId, migrate } from './store.js';
import { httpError, cleanSettings, cleanHolidays, cleanCustomHoliday, cleanYear, cleanSaldo, cleanAbsence } from './clean.js';
import { createUpdater, parseChangelog } from './update.js';
import { calendar, yearOf, fmtDays } from '../public/js/flux.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8084);
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
let CHANGELOG = [];
try { CHANGELOG = parseChangelog(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')); } catch { /* ohne */ }
const VERSION_DATE = CHANGELOG.find((x) => x.version === VERSION)?.date || '';
const updater = createUpdater({ root: process.env.UPDATE_ROOT || ROOT, version: VERSION, enabled: process.env.UPDATE_ENABLED !== 'false' });
const RESTART_ON_UPDATE = process.env.RESTART_ON_UPDATE === 'true';

const store = new Store(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------- Hilfsfunktionen ----------
function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on('end', () => {
      if (size > limit) return reject(httpError(413, 'Zu gross'));
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolve({});
      try {
        const v = JSON.parse(buf.toString('utf8'));
        resolve(v && typeof v === 'object' ? v : {});
      } catch { reject(httpError(400, 'Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

const attachment = (name) => `attachment; filename="${name.replace(/[^\w.\- ]/g, '_')}"`;

function publicData() {
  const { rev, updatedAt, settings, holidays, customHolidays, years, saldos, absences } = store.data;
  return { rev, updatedAt, settings, holidays, customHolidays, years, saldos, absences, version: VERSION, versionDate: VERSION_DATE, serverTime: Date.now() };
}

const find = (arr, id, what) => arr.find((x) => x.id === id) || (() => { throw httpError(404, `${what} nicht gefunden`); })();

/** Sorgt dafür, dass alle Jahre von–bis lückenlos erfasst sind (Ferienanspruch vom Nachbarjahr übernommen) */
function ensureYears(d, ...dates) {
  const keys = Object.keys(d.years).map(Number);
  const want = dates.map(yearOf);
  const lo = Math.min(...keys, ...want), hi = Math.max(...keys, ...want);
  if (hi - lo > 50) throw httpError(400, 'Jahr ausserhalb des sinnvollen Bereichs');
  let prev = d.years[Math.min(...(keys.length ? keys : want))]?.anspruch ?? 25;
  for (let y = lo; y <= hi; y++) {
    if (d.years[y]) { prev = d.years[y].anspruch; continue; }
    d.years[y] = cleanYear({ anspruch: prev });
  }
}

/** Mehr Ferien- und Gleitzeittage als Arbeitstage im Zeitraum? */
function checkAbsence(d, a) {
  const cal = calendar(d.settings, d.holidays, d.customHolidays);
  const { units } = cal.range(a.from, a.to);
  if (!units) throw httpError(400, 'In diesem Zeitraum gibt es keine Arbeitstage');
  if (a.ferien + a.gleit > units + 1e-9) throw httpError(400, `Im Zeitraum sind nur ${fmtDays(units)} Arbeitstage – Ferien und Gleitzeit zusammen höchstens so viele`);
}

// ---------- API ----------
async function api(req, res, url) {
  const method = req.method;
  const p = url.pathname;

  // Schutz gegen Cross-Site-Requests: alle schreibenden Aufrufe brauchen diesen Header
  if (method !== 'GET' && req.headers['x-flux'] !== '1') throw httpError(403, 'Fehlender Header');

  if (p === '/api/status' && method === 'GET') return send(res, 200, { version: VERSION, needsSetup: !Object.keys(store.data.years).length });
  if (p === '/api/data' && method === 'GET') {
    const since = Number(url.searchParams.get('rev'));
    if (since && since === store.rev) return send(res, 200, { rev: store.rev, same: true, serverTime: Date.now() });
    return send(res, 200, publicData());
  }

  // ----- Ersteinrichtung: Jahr, Anspruch und aktueller Stand in einem Schritt -----
  if (p === '/api/setup' && method === 'POST') {
    if (Object.keys(store.data.years).length) throw httpError(403, 'Bereits eingerichtet');
    const b = await readBody(req);
    store.mutate((d) => {
      if (b.settings) d.settings = cleanSettings(b.settings, d.settings);
      const saldo = cleanSaldo(b.saldo || {});
      d.years[yearOf(saldo.date)] = cleanYear({ anspruch: b.anspruch });
      d.saldos.push({ id: newId(), ...saldo, note: saldo.note || 'Startwert' });
    });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Einstellungen -----
  if (p === '/api/settings' && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => { d.settings = cleanSettings(b, d.settings); });
    return send(res, 200, { rev: store.rev });
  }
  if (p === '/api/holidays' && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => { d.holidays = cleanHolidays(b, d.holidays); });
    return send(res, 200, { rev: store.rev });
  }
  if (p === '/api/custom-holidays' && method === 'POST') {
    const b = await readBody(req);
    const item = store.mutate((d) => {
      const x = { id: newId(), ...cleanCustomHoliday(b) };
      d.customHolidays.push(x);
      return x;
    });
    return send(res, 200, { rev: store.rev, item });
  }
  let m = p.match(/^\/api\/custom-holidays\/(\w+)$/);
  if (m && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => { const x = find(d.customHolidays, m[1], 'Feiertag'); Object.assign(x, cleanCustomHoliday(b, x)); });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    store.mutate((d) => { find(d.customHolidays, m[1], 'Feiertag'); d.customHolidays = d.customHolidays.filter((x) => x.id !== m[1]); });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Jahre -----
  m = p.match(/^\/api\/years\/(\d{4})$/);
  if (m && method === 'PUT') {
    const y = Number(m[1]);
    const b = await readBody(req);
    store.mutate((d) => {
      if (!d.years[y]) ensureYears(d, `${y}-01-01`);
      d.years[y] = cleanYear(b, d.years[y]);
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    const y = Number(m[1]);
    store.mutate((d) => {
      const keys = Object.keys(d.years).map(Number);
      if (!d.years[y]) throw httpError(404, 'Jahr nicht gefunden');
      if (keys.length === 1) throw httpError(400, 'Das letzte Jahr kann nicht gelöscht werden');
      if (y !== Math.min(...keys) && y !== Math.max(...keys)) throw httpError(400, 'Nur das erste oder das letzte Jahr kann gelöscht werden (sonst entsteht eine Lücke)');
      delete d.years[y];
      d.absences = d.absences.filter((a) => yearOf(a.from) !== y && yearOf(a.to) !== y);
      d.saldos = d.saldos.filter((s) => yearOf(s.date) !== y);
    });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Saldo-Stichtage -----
  if (p === '/api/saldos' && method === 'POST') {
    const b = await readBody(req);
    const item = store.mutate((d) => {
      const x = cleanSaldo(b);
      ensureYears(d, x.date);
      // Pro Tag nur ein Stichtag: ein neuer ersetzt den alten
      d.saldos = d.saldos.filter((s) => s.date !== x.date);
      const item = { id: newId(), ...x };
      d.saldos.push(item);
      return item;
    });
    return send(res, 200, { rev: store.rev, item });
  }
  m = p.match(/^\/api\/saldos\/(\w+)$/);
  if (m && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => {
      const x = find(d.saldos, m[1], 'Stichtag');
      const next = cleanSaldo(b, x);
      if (d.saldos.some((s) => s.id !== x.id && s.date === next.date)) throw httpError(400, 'Für diesen Tag gibt es schon einen Stand');
      ensureYears(d, next.date);
      Object.assign(x, next);
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    store.mutate((d) => { find(d.saldos, m[1], 'Stichtag'); d.saldos = d.saldos.filter((x) => x.id !== m[1]); });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Abwesenheiten -----
  if (p === '/api/absences' && method === 'POST') {
    const b = await readBody(req);
    const item = store.mutate((d) => {
      const a = cleanAbsence(b);
      checkAbsence(d, a);
      ensureYears(d, a.from, a.to);
      const item = { id: newId(), ...a };
      d.absences.push(item);
      return item;
    });
    return send(res, 200, { rev: store.rev, item });
  }
  m = p.match(/^\/api\/absences\/(\w+)$/);
  if (m && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => {
      const x = find(d.absences, m[1], 'Abwesenheit');
      const a = cleanAbsence(b, x);
      checkAbsence(d, a);
      ensureYears(d, a.from, a.to);
      Object.assign(x, a);
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    store.mutate((d) => { find(d.absences, m[1], 'Abwesenheit'); d.absences = d.absences.filter((x) => x.id !== m[1]); });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Sicherung -----
  if (p === '/api/backup' && method === 'GET') {
    const { settings, holidays, customHolidays, years, saldos, absences } = store.data;
    const body = { app: 'flux', schema: 1, exportedAt: new Date().toISOString(), settings, holidays, customHolidays, years, saldos, absences };
    return send(res, 200, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': attachment(`flux-sicherung-${new Date().toISOString().slice(0, 10)}.json`) });
  }
  if (p === '/api/restore' && method === 'POST') {
    const b = await readBody(req);
    if (b.app !== 'flux' || !b.years || typeof b.years !== 'object' || !Array.isArray(b.absences)) throw httpError(400, 'Keine gültige Flux-Sicherung');
    const { settings, holidays, customHolidays, years, saldos, absences } = b;
    store.replaceAll(migrate({ settings, holidays, customHolidays, years, saldos, absences }));
    return send(res, 200, { rev: store.rev });
  }
  if (p === '/api/backups' && method === 'GET') return send(res, 200, { backups: store.listBackups() });
  if (p === '/api/backups' && method === 'POST') return send(res, 200, { name: store.snapshot('manuell'), backups: store.listBackups() });
  m = p.match(/^\/api\/backups\/([\w.-]+\.json)$/);
  if (m && method === 'GET') {
    const data = store.readBackup(m[1]);
    if (!data) throw httpError(404, 'Sicherung nicht gefunden');
    return send(res, 200, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': attachment(m[1]) });
  }
  m = p.match(/^\/api\/backups\/([\w.-]+\.json)\/restore$/);
  if (m && method === 'POST') {
    const data = store.readBackup(m[1]);
    if (!data) throw httpError(404, 'Sicherung nicht gefunden');
    store.replaceAll(data);
    return send(res, 200, { rev: store.rev });
  }

  // ----- Aktualisieren -----
  if (p === '/api/update' && method === 'GET') return send(res, 200, await updater.check());
  if (p === '/api/update' && method === 'POST') {
    const b = await readBody(req);
    const backup = store.snapshot('vor-update-' + String(b.version || '').replace(/[^\d.]/g, ''));
    const r = await updater.apply(b.version);
    send(res, 200, { ...r, backup, restart: RESTART_ON_UPDATE });
    // Docker startet den Container neu (restart: unless-stopped) – mit dem neuen Programmcode
    if (RESTART_ON_UPDATE) setTimeout(() => process.exit(0), 500);
    return;
  }

  throw httpError(404, 'Unbekannter API-Aufruf');
}

// ---------- Statische Dateien ----------
function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Ungültige Adresse'); }
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Verboten');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Nicht gefunden');
    const ext = path.extname(file);
    // Service Worker: Cache-Name an die Version koppeln → jede neue Version lädt die Oberfläche frisch
    if (rel === '/sw.js') buf = Buffer.from(buf.toString('utf8').replaceAll('__VERSION__', VERSION));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'");
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Interner Fehler' : e.message, ...(e.extra || {}) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Flux läuft auf http://localhost:${PORT}  (Daten: ${DATA_DIR})`);
});

// Sauber beenden (Docker stop, Ctrl+C): laufende Anfragen fertig, dann aus
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

export { server };
