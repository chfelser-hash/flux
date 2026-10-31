// Einfacher, robuster JSON-Datenspeicher (Aufbau wie Kässeli, Reisli und Bracket).
// - Atomares Schreiben (tmp-Datei + rename), damit bei Stromausfall nichts kaputt geht
// - Tägliche Sicherungskopie in data/backups (die letzten 30 Tage werden behalten)
// - Vor jeder Wiederherstellung wird der aktuelle Stand zusätzlich gesichert
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_SETTINGS, defaultHolidays } from '../public/js/flux.js';

const KEEP_DAYS = 30;

export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'flux.json');
    this.backupDir = path.join(dataDir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.data = this.#load();
  }

  #load() {
    if (fs.existsSync(this.file)) return migrate(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    const fresh = migrate({});
    this.#write(fresh);
    return fresh;
  }

  #write(obj) {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
    fs.renameSync(tmp, this.file);
  }

  #dailyBackup() {
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(this.backupDir, `flux-${day}.json`);
    if (!fs.existsSync(target) && fs.existsSync(this.file)) {
      fs.copyFileSync(this.file, target);
      const files = fs.readdirSync(this.backupDir).filter((f) => /^flux-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      for (const old of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) fs.unlinkSync(path.join(this.backupDir, old));
    }
  }

  get rev() {
    return this.data.rev;
  }

  /** Führt eine Änderung aus und speichert. fn bekommt die Daten und darf sie verändern. */
  mutate(fn) {
    this.#dailyBackup();
    const draft = structuredClone(this.data);
    const result = fn(draft); // wirft fn einen Fehler, bleibt alles wie es war
    draft.rev = (this.data.rev || 0) + 1;
    draft.updatedAt = new Date().toISOString();
    this.data = draft;
    this.#write(this.data);
    return result;
  }

  snapshot(label = 'manuell') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `${label}-${stamp}.json`;
    fs.writeFileSync(path.join(this.backupDir, name), JSON.stringify(this.data));
    return name;
  }

  replaceAll(newData) {
    this.#dailyBackup();
    this.snapshot('vor-wiederherstellung');
    const migrated = migrate(newData);
    migrated.rev = (this.data.rev || 0) + 1;
    migrated.updatedAt = new Date().toISOString();
    this.data = migrated;
    this.#write(this.data);
  }

  listBackups() {
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const st = fs.statSync(path.join(this.backupDir, f));
        return { name: f, size: st.size, at: st.mtime.toISOString() };
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  readBackup(name) {
    if (!/^[\w.-]+\.json$/.test(name)) return null;
    const file = path.join(this.backupDir, name);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }
}

export function newId() {
  return crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x');
}

const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const list = (x) => (Array.isArray(x) ? x.filter((v) => v && typeof v === 'object' && v.id) : []);

/** Bringt ältere/importierte Datenstände auf die aktuelle Struktur. */
export function migrate(d) {
  const out = obj(d);
  out.schema = 1;
  out.rev = out.rev || 1;
  out.settings = { ...DEFAULT_SETTINGS, ...obj(out.settings) };
  const hol = defaultHolidays();
  for (const [k, v] of Object.entries(obj(out.holidays))) if (hol[k]) hol[k] = { ...hol[k], ...obj(v) };
  out.holidays = hol;
  out.customHolidays = list(out.customHolidays);
  out.years = obj(out.years);
  out.saldos = list(out.saldos);
  out.absences = list(out.absences);
  return out;
}
