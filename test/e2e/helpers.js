// Hilfsfunktionen für die End-to-End-Tests: Server mit leerem Datenordner starten, API-Zugriff, Testdaten.
// Es werden ausschliesslich erfundene Beispieldaten verwendet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Startet Flux auf einem freien Port mit leerem Datenordner – im selben Prozess, damit die
 * Testabdeckung auch den Server-Code erfasst. Pro Testdatei genau einmal aufrufen.
 */
export async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-e2e-'));
  const port = 18000 + Math.floor(Math.random() * 20000);
  Object.assign(process.env, { PORT: String(port), DATA_DIR: dataDir, HOST: '127.0.0.1' });
  const log = [];
  const orig = console.log;
  console.log = (...a) => log.push(a.join(' '));
  const mod = await import(path.join(ROOT, 'server/index.js'));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/status')).ok) break;
    } catch { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    base,
    dataDir,
    log: () => log.join('\n'),
    readData: () => JSON.parse(fs.readFileSync(path.join(dataDir, 'flux.json'), 'utf8')),
    async stop() {
      mod.server.closeAllConnections?.();
      await new Promise((r) => mod.server.close(() => r()));
      console.log = orig;
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Kleiner API-Client */
export function apiClient(base) {
  return async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'X-Flux': '1', 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}
