// Die wichtigsten Wege im Browser (Handy-Grösse): einrichten, Feiertag, Abwesenheit, Saldo, Stempelrechner, Jahre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, apiClient } from './helpers.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let srv, browser, page, api;
const errors = [];
const year = new Date().getFullYear();
// Montag bis Freitag der ersten vollen Dezemberwoche (ohne Standard-Feiertage)
const mon = (() => { const d = new Date(Date.UTC(year, 11, 1)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return d; })();
const isoOf = (d, plus) => new Date(d.getTime() + plus * 864e5).toISOString().slice(0, 10);

before(async () => {
  srv = await startServer();
  api = apiClient(srv.base);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'de-CH' });
  page.on('pageerror', (e) => errors.push(String(e)));
});
after(async () => {
  await browser?.close();
  await srv?.stop();
});

const data = async () => (await api('GET', '/api/data')).data;

test('Erster Start: Stand und Anspruch eintragen', { timeout: 60000 }, async () => {
  await page.goto(srv.base + '/');
  await page.waitForSelector('text=Flux einrichten');
  await page.fill('input[name=gleit]', '12:30');
  await page.fill('input[name=ferien]', '14.5');
  await page.fill('input[name=anspruch]', '25');
  await page.click('button:has-text("Los geht’s")');
  await page.waitForSelector('.hol-cfg');
  const d = await data();
  assert.equal(d.years[year].anspruch, 25);
  assert.equal(d.saldos[0].gleitMin, 750);
  assert.equal(d.saldos[0].ferien, 14.5);
});

test('Feiertag anhaken und Vorfeiertag setzen', { timeout: 60000 }, async () => {
  const row = page.locator('.hol', { hasText: 'Tag der Arbeit' });
  await row.locator('input[type=checkbox]').check();
  await page.waitForFunction(async () => (await (await fetch('/api/data')).json()).holidays.tagderarbeit.on);
  await page.locator('.hol', { hasText: 'Tag der Arbeit' }).locator('select').selectOption('half');
  await page.waitForFunction(async () => (await (await fetch('/api/data')).json()).holidays.tagderarbeit.off === 'half');
  const eve = page.locator('.hol', { hasText: 'Weihnachten' }).locator('input.small-input').last();
  await eve.fill('2:00');
  await eve.dispatchEvent('change');
  await page.waitForFunction(async () => (await (await fetch('/api/data')).json()).holidays.weihnachten.eveMin === 120);
});

test('Abwesenheit erfassen: Arbeitstage zählen, auf Ferien und Gleitzeit aufteilen', { timeout: 60000 }, async () => {
  await page.click('.tab:has-text("Abwesend")');
  await page.click('button:has-text("+ Abwesenheit")');
  // Von–Bis im Kalender: zum Dezember blättern, ersten und letzten Tag antippen – ohne OK
  const target = isoOf(mon, 0).slice(0, 7);
  for (let i = 0; i < 24 && (await page.getAttribute('dialog[open] .rcal', 'data-month')) !== target; i++) await page.click('dialog[open] .rcal-next');
  await page.click(`dialog[open] .rcal-day[data-date="${isoOf(mon, 0)}"]`);
  assert.equal(await page.getAttribute('dialog[open] .rcal', 'data-picking'), 'to');
  await page.click(`dialog[open] .rcal-day[data-date="${isoOf(mon, 4)}"]`);
  assert.equal(await page.$$eval('dialog[open] .rcal-day.in', (x) => x.length), 5);
  await page.waitForSelector('dialog[open] .preview >> text=5 Arbeitstage');
  await page.fill('dialog[open] input[name=gleit]', '1.5');
  assert.equal(await page.inputValue('dialog[open] input[name=ferien]'), '3.5');
  await page.fill('dialog[open] input[name=label]', 'Testwoche');
  await page.click('dialog[open] button:has-text("Erfassen")');
  await page.waitForSelector('.absence >> text=Testwoche');
  const a = (await data()).absences[0];
  assert.deepEqual([a.ferien, a.gleit], [3.5, 1.5]);
  // Zu viele Tage: Fehlermeldung, Dialog bleibt offen
  await page.click('.absence .abs-main');
  await page.fill('dialog[open] input[name=ferien]', '9');
  await page.click('dialog[open] button:has-text("Speichern")');
  await page.waitForSelector('.toast.error');
  assert.ok(await page.$('dialog[open]'));
  await page.keyboard.press('Escape');
});

test('Übersicht: Stand, Verlauf, Kompensation; Saldo neu eintragen', { timeout: 60000 }, async () => {
  await page.click('.tab:has-text("Übersicht")');
  await page.waitForSelector('svg.chart');
  assert.match(await page.textContent('.readout.gleit .r-value'), /\+12:30/);
  assert.match(await page.textContent('.readout.gleit .r-end'), /Ende Jahr [+−±]\d+:\d\d h≈ [+−]?[\d.]+ Tage?/);
  assert.match(await page.textContent('.comp tfoot'), /5 Tage/);
  // Antippen in der Mitte des Verlaufs (direkt als Ereignis – unabhängig davon, was gerade im Bild ist)
  await page.$eval('svg.chart .hit', (el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
  });
  await page.waitForFunction(() => /Ferien/.test(document.querySelector('.pick').textContent));
  await page.click('button:has-text("Saldo eintragen")');
  await page.fill('dialog[open] input[name=gleit]', 'abc');
  await page.click('dialog[open] button:has-text("Speichern")');
  await page.waitForSelector('dialog[open] .form-error:not([hidden])');
  await page.fill('dialog[open] input[name=gleit]', '-1:15');
  await page.click('dialog[open] button:has-text("Speichern")');
  await page.waitForSelector('.readout.gleit .saldo.neg');
  assert.match(await page.textContent('.readout.gleit .r-value'), /−1:15/);
  assert.equal((await data()).saldos.length, 1, 'gleicher Tag ersetzt den Stand');
});

test('Stempelrechner: Ziffernblock, Differenz grün/rot, Vorholzeit', { timeout: 60000 }, async () => {
  await page.click('.tab:has-text("Stempel")');
  await page.waitForSelector('.stamp');
  await page.fill('.soll-input', '8:24');
  await page.dispatchEvent('.soll-input', 'change');
  const type = async (digits) => { for (const d of digits) await page.click(`.keypad .key[data-key="${d}"]`); };
  const slot = (i) => page.textContent(`.stamp-slot[data-i="${i}"] .slot-time`);
  // 7 → «07:» (einstellige Stunde), Doppelpunkt kommt von selbst, danach springt es ins nächste Feld
  await type('7');
  assert.equal(await slot(0), '07:');
  await type('30');
  assert.equal(await slot(0), '07:30');
  assert.match(await page.getAttribute('.stamp-slot[data-i="1"]', 'class'), /\bon\b/);
  // Ungültige Ziffer gesperrt: nach «2» geht keine 5
  await type('1');
  assert.equal(await page.isDisabled('.keypad .key[data-key="5"]'), false);
  await page.click('.keypad .key-fn[aria-label="Löschen"]');
  await type('2');
  assert.equal(await page.isDisabled('.keypad .key[data-key="5"]'), true);
  await page.click('.keypad .key-fn[aria-label="Löschen"]');
  await type('1200');
  await type('1245');
  assert.match(await page.textContent('.reach-row'), /Sollzeit erreicht16:39/);
  assert.match(await page.textContent('.reach-row'), /Vorholzeit \(\+15 Min\.\)16:54/);
  await type('1700');
  assert.match(await page.textContent('.diff'), /\+21/);
  assert.ok(await page.$('.diff.pos'));
  assert.match(await page.textContent('.plus-check'), /Vorholzeit \(\+15 Min\.\) erreicht – 6 Min\. darüber/);
  // Letztes Feld korrigieren
  await page.click('.stamp-slot[data-i="3"]');
  await type('1630');
  assert.match(await page.textContent('.diff'), /−9/);
  assert.ok(await page.$('.diff.neg'));
  assert.match(await page.textContent('.plus-check'), /fehlen 24 Min/);
  // Bleibt nach dem Neuladen erhalten
  await page.reload();
  await page.waitForSelector('.diff.neg');
  // Tastatur am PC
  await page.click('button:has-text("Leeren")');
  assert.equal(await slot(0), '––:––');
  await page.keyboard.type('0815');
  assert.equal(await slot(0), '08:15');
  await page.click('.keypad .key-fn[aria-label="Jetzt"]');
  assert.match(await slot(1), /^\d\d:\d\d$/);
});

test('Einstellungen: nächstes Jahr anlegen und dorthin blättern', { timeout: 60000 }, async () => {
  await page.click('.tab:has-text("Einstellungen")');
  await page.click(`button:has-text("+ Jahr ${year + 1}")`);
  await page.fill('dialog[open] input[name=anspruch]', '27');
  await page.click('dialog[open] button:has-text("Hinzufügen")');
  await page.waitForSelector(`.year-no:has-text("${year + 1}")`);
  assert.equal((await data()).years[year + 1].anspruch, 27);
  await page.click('.tab:has-text("Übersicht")');
  await page.click('button[aria-label="Nächstes Jahr"]');
  await page.waitForSelector(`.year:has-text("${year + 1}")`);
  assert.match(await page.textContent('.readout.ferien .r-sub'), /Anspruch 27/);
  assert.deepEqual(errors, []);
});
