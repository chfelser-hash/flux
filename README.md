# Flux

Ferien und Gleitzeit fürs ganze Jahr im Blick – Geschwister von [Kässeli](https://github.com/chfelser-hash/kaesseli), [Reisli](https://github.com/chfelser-hash/reisli) und [Bracket](https://github.com/chfelser-hash/bracket).
Läuft im Browser auf Handy und PC, die Daten liegen auf der eigenen Synology NAS.

- **Übersicht** – Gleitzeit-Saldo und Ferien übrig *heute* und *Ende Jahr*, der Verlauf des Saldos übers Jahr (antippen = Stand an diesem Tag, gestrichelt = Prognose, sandfarben = abwesend), eine Warnung, falls der Saldo irgendwann ins Minus fällt, wie viele Abwesenheitstage über Ferien und wie viele über Gleitzeit kompensiert sind (genommen, geplant, total), die Monate und die Feiertage des Jahres.
- **Saldo eintragen** – ab und zu den Stand aus der Zeiterfassung eintragen (Stand am Morgen, ohne den Tag selbst). Alles davor gilt als erledigt, ab da rechnet Flux neu. Auf Wunsch auch den Ferien-Rest korrigieren.
- **Abwesend** – Ferien mit Datum erfassen. Flux zählt die Arbeitstage (ohne Wochenenden und Feiertage), du teilst sie auf Ferien und Gleitzeit auf – auch halbe Tage und Kommazahlen. Bleibt ein Rest, arbeitest du an diesen Tagen.
- **Stempel** – vier Zeiten (Kommen, Gehen, Kommen, Gehen) eintragen oder «Jetzt stempeln»: Differenz zur Sollzeit in Minuten, grün darüber, rot darunter. Solange du noch da bist: «Sollzeit erreicht um …» und «wenn du jetzt gehst». Bleibt nur auf dem Gerät und nur für heute.
- **Einstellungen** – Sollzeit (8:24), durchschnittlicher Gleitzeit-Aufbau pro Tag, Arbeitstage, Jahre mit Ferienanspruch, Feiertage, Sicherung, Update.

Bewusst **ohne Login**: Flux gehört ins Heimnetz, hinter Tailscale/VPN oder hinter Cloudflare Access (siehe unten). Keine externen Abhängigkeiten: nur Node.js. Daten als JSON-Datei mit täglicher automatischer Sicherung (30 Tage).

> **Datenschutz:** Im Repo liegt kein einziger persönlicher Wert. Der Ordner `data/` ist per `.gitignore` ausgeschlossen. Bitte nichts davon manuell einchecken.

---

## So rechnet Flux

Tag für Tag durch alle erfassten Jahre:

1. **1. Januar:** Der Ferienanspruch des Jahres kommt dazu. Ferien-Rest und Gleitzeit-Saldo werden aus dem Vorjahr übernommen – oder du setzt sie unter «Einstellungen → Jahre» von Hand.
2. **Stand eingetragen:** Gleitzeit (und, wenn ausgefüllt, Ferien) gelten ab diesem Morgen. Hat das erste Jahr keine Startwerte, rechnet Flux vom ersten Stand zurück, damit der Verlauf davor dazu passt.
3. **Arbeitstag:** + eingestellter Aufbau (z.B. 15 Minuten). An verkürzten Tagen anteilig, an Abwesenheitstagen nicht.
4. **Abwesenheit:** Die Ferien- und Gleitzeittage werden gleichmässig auf die Arbeitstage des Zeitraums verteilt. Ein Gleitzeittag kostet eine volle Sollzeit (8:24).

### Feiertage

- Alle Schweizer Feiertage stehen in der Liste, auch die beweglichen (Karfreitag, Ostermontag, Auffahrt, Pfingstmontag, Fronleichnam, Bettagsmontag, Knabenschiessen, Sechseläuten …). Anhaken, was dein Arbeitgeber gibt.
- Pro Feiertag: **ganzer Tag**, **halber Tag** oder **Stunden** frei.
- **Vortag weniger:** so viel weniger Sollzeit am Tag davor (z.B. 2:00 vor Weihnachten). Ob das auch gilt, wenn der Feiertag auf ein Wochenende fällt, ist einstellbar.
- Fällt ein Feiertag aufs Wochenende, zählt er nicht.
- **Eigene Feiertage:** jedes Jahr am selben Datum oder einmalig (z.B. ein geschenkter Brückentag).

Gezählt wird in Arbeitstagen, gerundet auf halbe Tage: ein Tag mit halbem Feiertag zählt ½, ein Vortag mit 2 Stunden weniger zählt 1.

### Jahre

Oben in der Übersicht blätterst du zwischen den Jahren. Nichts wird gelöscht – alte Jahre bleiben zum Anschauen. Ein neues Jahr legst du unter «Einstellungen → Jahre» an (Anspruch vom Vorjahr vorgeschlagen); trägst du eine Abwesenheit oder einen Stand im nächsten Jahr ein, legt Flux es selbst an.

## 1. Lokal starten (Windows)

1. [Node.js](https://nodejs.org) (LTS, ab Version 20) installieren.
2. Repo herunterladen oder klonen.
3. `start.bat` doppelklicken – der Browser öffnet <http://localhost:8084>.

Alternativ im Terminal: `npm start` (Port ändern mit `set PORT=3000`).

## 2. Betrieb auf der Synology DS218+

Gleich wie Reisli und Bracket – **Container Manager** (DSM 7.2). Flux nutzt Port **8084** (Kässeli 8080, Reisli 8081, Bracket 8082).

1. Per SSH auf die NAS und das Repo klonen:
   ```sh
   sudo git clone https://github.com/chfelser-hash/flux.git /volume1/docker/flux
   ```
2. Image bauen und starten – direkt per SSH:
   ```sh
   cd /volume1/docker/flux && sudo docker compose up -d --build
   ```
   Oder im Container Manager → **Projekt** → **Erstellen**
   - Projektname: `flux`
   - Pfad: `/docker/flux`
   - Quelle: «Vorhandene docker-compose.yml verwenden»
   - Erstellen – das Image wird auf der NAS gebaut und gestartet.
3. Im Heimnetz `http://<IP-der-NAS>:8084` öffnen und den aktuellen Stand eintragen.

Die Daten liegen in `/docker/flux/data` und werden von Hyper Backup mitgesichert, wenn der Ordner `docker` im Backup-Job ist.

## 3. Von unterwegs

- **Tailscale / VPN:** `http://<NAS>:8084` – nichts weiter nötig.
- **Cloudflare Tunnel:** Public Hostname anlegen (z.B. `flux.<deine-domain>`, Service HTTP, `<IP-der-NAS>:8084`) und – weil Flux kein Login hat – unbedingt eine **Cloudflare-Access-Regel** davor (nur deine E-Mail-Adresse), wie bei den anderen Diensten.

**Als App installieren:** Android (Chrome): Menü ⋮ → «App installieren». Windows (Edge/Chrome): Installieren-Symbol in der Adressleiste. Installieren klappt über HTTPS (Cloudflare oder der eigene Proxy).

### Update

**Über die App:** «Einstellungen → Über Flux → Nach Updates suchen». Angeboten werden nur Versionen, die auf GitHub alle Tests bestanden haben. Flux sichert vorher, holt den neuen Stand und startet von selbst neu; auch «zurück zu einer früheren Version» ist dort möglich.

**Von Hand:** `cd /volume1/docker/flux && sudo git pull && sudo docker compose up -d --build`. Nötig nur, wenn sich `Dockerfile` oder `docker-compose.yml` ändern – die Änderungsliste sagt es dann ausdrücklich.

## 4. Sicherung

- **Automatisch:** Bei der ersten Änderung des Tages wird `data/backups/flux-JJJJ-MM-TT.json` angelegt, 30 Tage aufbewahrt. Zusätzlich vor jeder Wiederherstellung und jedem Update.
- **Einstellungen → Sicherung:** herunterladen, einspielen, «Jetzt sichern», frühere Stände auf dem Server laden oder wiederherstellen.

## Qualität und Versionen

- **Version** in `package.json`, Änderungen in `CHANGELOG.md` (zu sehen unter «Einstellungen → Über Flux»). Fehlerkorrekturen → 1.0.**x**, neue Funktionen → 1.**x**.0, grosse Umbauten → **x**.0.0.
- **Tests:** Rechenkern (Ostern, Feiertage, Vorfeiertage, Abwesenheiten, Stichtage, Jahreswechsel, Stempelrechner) möglichst lückenlos, jeder API-Aufruf mit Erfolgs- und Fehlerfällen, Update mit lokalem Git-Repo, Browser-Abläufe für die wichtigsten Wege. Nur erfundene Testdaten. Auf GitHub muss die Testabdeckung Mindestwerte erreichen (Zeilen 85 %, Zweige 70 %, Funktionen 80 %).
- **Datenschutz-Check** bei jedem Push (`npm run privacy`): keine Daten- oder Sicherungsdateien, keine Excel/CSV, keine echten E-Mail-Adressen. Eigene Begriffe als GitHub-Secret `PRIVATE_PATTERNS` (kommagetrennt) hinterlegen – nie im Repo.
- **Freigabe:** Ist alles grün, markiert GitHub die Version als `vX.Y.Z`. Nur solche Versionen bietet «Aktualisieren» in der App an.

## Technisches

| | |
|---|---|
| Server | `server/` – Node.js ohne Abhängigkeiten, REST-API unter `/api` |
| Oberfläche | `public/` – HTML/CSS/JavaScript-Module, PWA |
| Rechenkern | `public/js/flux.js` – Feiertage, Sollzeit, Zeitachse, Jahreszusammenfassung, Stempelrechner; von Browser, Server und Tests gemeinsam genutzt |
| Daten | `data/flux.json`, `data/backups/` |
| Konfiguration | `PORT` (8084), `DATA_DIR` (./data), `RESTART_ON_UPDATE`, `UPDATE_ENABLED` |
| Tests | `npm test` (schnell: Rechenkern), `npm run test:e2e` (API, Update, Browser – braucht Playwright), `npm run test:coverage` (alles mit Testabdeckung) |
