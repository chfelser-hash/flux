// Flux – Oberfläche: Zustand, Server-Abgleich, Navigation, Jahr.
import { h, toast, confirmDialog } from './ui.js';
import { timeline, yearSummary, iso } from './flux.js';
import { renderOverview } from './views/overview.js';
import { renderAbsences } from './views/absences.js';
import { renderStamp } from './views/stamp.js';
import { renderSettings, renderFirstRun } from './views/settings.js';

const ROUTES = {
  uebersicht: { label: 'Übersicht', icon: '〰', render: renderOverview, years: true },
  abwesenheiten: { label: 'Abwesend', icon: '▭', render: renderAbsences, years: true },
  stempel: { label: 'Stempel', icon: '◷', render: renderStamp },
  einstellungen: { label: 'Einstellungen', icon: '⚙', render: renderSettings },
};

export const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ohne Speicher */ } return null; };

/** Heutiges Datum auf diesem Gerät (nicht UTC) */
export const today = () => { const d = new Date(); return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

export const state = {
  data: null,
  year: Number(store('flux-year')) || new Date().getFullYear(),
  online: true,
  dirty: false,
};

export const route = () => (location.hash.slice(1).split('/')[0] || 'uebersicht');

// ---------- Server ----------
async function rawFetch(method, url, body) {
  return fetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Flux': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function api(method, url, body) {
  let res;
  try {
    res = await rawFetch(method, url, body);
  } catch {
    setOnline(false);
    throw new Error('Keine Verbindung zum Flux-Server');
  }
  setOnline(true);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || 'Fehler ' + res.status);
  return data;
}

/** API-Aufruf mit Fehlermeldung als Toast; lädt danach die Daten neu */
export async function act(method, url, body, opts = {}) {
  try {
    const r = await api(method, url, body);
    await refresh(true);
    if (opts.done) toast(opts.done);
    return r;
  } catch (e) {
    toast(e.message, { error: true });
    return null;
  }
}

/** Löschen mit Rückfrage */
export async function remove(url, what) {
  if (!(await confirmDialog('Löschen', `${what} löschen?`, 'Löschen', true))) return null;
  return act('DELETE', url, undefined, { done: 'Gelöscht' });
}

function setOnline(v) {
  if (state.online === v) return;
  state.online = v;
  document.body.classList.toggle('offline', !v);
}

export async function refresh(force = false) {
  const d = state.data;
  let r;
  try {
    r = await (await rawFetch('GET', !force && d ? `/api/data?rev=${d.rev}` : '/api/data')).json();
    setOnline(true);
  } catch {
    setOnline(false);
    return;
  }
  if (r.same) return;
  state.data = r;
  render();
}

setInterval(() => { if (!document.hidden) refresh(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// ---------- Berechnete Sicht ----------
let ctxCache = null;
export function ctx() {
  const d = state.data;
  const t = today();
  if (ctxCache && ctxCache.rev === d.rev && ctxCache.today === t && ctxCache.year === state.year) return ctxCache;
  const tl = ctxCache && ctxCache.rev === d.rev ? ctxCache.tl : timeline(d);
  const years = tl.years;
  ctxCache = { rev: d.rev, today: t, year: state.year, tl, years, summary: yearSummary(tl, state.year, t) };
  return ctxCache;
}

export function setYear(y) {
  state.year = y;
  store('flux-year', String(y));
  render();
}

// ---------- Darstellung ----------
const main = () => document.getElementById('main');

export function render() {
  if (!state.data) return;
  // Läuft gerade ein Dialog, nicht dazwischenfunken
  if (document.querySelector('dialog[open]')) { state.dirty = true; return; }
  state.dirty = false;
  const r = ROUTES[route()] ? route() : 'uebersicht';
  document.body.dataset.route = r;
  if (!Object.keys(state.data.years).length) {
    document.getElementById('topbar').replaceChildren(brand());
    document.getElementById('tabbar').replaceChildren();
    main().dataset.view = 'start';
    renderFirstRun(main());
    return;
  }
  // Gewähltes Jahr muss es geben – sonst das aktuelle bzw. das nächstliegende
  const keys = Object.keys(state.data.years).map(Number);
  if (!keys.includes(state.year)) {
    const now = new Date().getFullYear();
    state.year = keys.includes(now) ? now : keys.reduce((a, b) => (Math.abs(b - now) < Math.abs(a - now) ? b : a));
  }
  const c = ctx();
  renderTopbar(r, keys);
  const scroll = window.scrollY;
  const keep = main().dataset.view === r;
  main().dataset.view = r;
  ROUTES[r].render(main(), c);
  if (keep) window.scrollTo(0, scroll);
}

// Nach dem Schliessen eines Dialogs aufgeschobene Aktualisierung nachholen
new MutationObserver(() => { if (state.dirty && !document.querySelector('dialog[open]')) render(); }).observe(document.body, { childList: true });

const brand = () => h('a', { class: 'brand', href: '#uebersicht' }, h('img', { class: 'logo', src: '/icons/icon.svg', alt: '' }), h('span', null, 'Flux'));

function renderTopbar(r, keys) {
  const y = state.year;
  const lo = Math.min(...keys), hi = Math.max(...keys);
  const yearNav = ROUTES[r].years ? h('div', { class: 'year-nav', role: 'group', 'aria-label': 'Jahr' },
    h('button', { class: 'icon-btn', disabled: y <= lo, 'aria-label': 'Vorheriges Jahr', onclick: () => setYear(y - 1) }, '‹'),
    h('strong', { class: 'year' + (y < new Date().getFullYear() ? ' archived' : '') }, String(y)),
    h('button', { class: 'icon-btn', disabled: y >= hi, 'aria-label': 'Nächstes Jahr', onclick: () => setYear(y + 1) }, '›')) : null;
  document.getElementById('topbar').replaceChildren(
    brand(),
    h('span', { class: 'spacer' }),
    h('span', { class: 'conn', title: 'Keine Verbindung zum Server' }, 'offline'),
    ...(yearNav ? [yearNav] : []));
  document.getElementById('tabbar').replaceChildren(...Object.entries(ROUTES).map(([k, v]) =>
    h('a', { href: '#' + k, class: 'tab' + (k === r ? ' on' : ''), 'aria-current': k === r ? 'page' : null }, h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, v.icon), h('span', null, v.label))));
}

// ---------- Start ----------
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (route() === 'uebersicht') render(); }, 200); });

(async function start() {
  await refresh(true);
  if (!state.data) {
    main().replaceChildren(h('p', { class: 'loading' }, 'Der Flux-Server ist nicht erreichbar. Ich versuche es weiter …'));
    const retry = setInterval(async () => { await refresh(true); if (state.data) clearInterval(retry); }, 3000);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
