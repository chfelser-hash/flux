# Änderungen

Neueste Version zuoberst. Format: `## Version – Datum`, darunter je eine Zeile pro Änderung.
Die Version steht auch in `package.json` und unter «Einstellungen → Über Flux».

## 1.2.0 – 2026-11-02
- Stempelrechner: Zeiten über einen grossen Ziffernblock eintippen – der Doppelpunkt kommt von selbst (0 7 3 0 → 07:30, eine 7 allein wird zu 07:), danach springt es ins nächste Feld. Ungültige Ziffern sind gesperrt. Am PC geht auch die Tastatur.
- Stempelrechner: zusätzlich «Vorholzeit erreicht um …» (Sollzeit plus eingestellter Aufbau pro Tag); nach dem Ausstempeln, ob die Vorholzeit erreicht ist oder wie viel fehlt.

## 1.1.0 – 2026-10-31
- Abwesenheit erfassen: Von und Bis direkt in einem Kalender im Dialog antippen – erster Tag, letzter Tag, ohne «OK». Wochenenden und Feiertage sind blass bzw. markiert.

## 1.0.3 – 2026-10-31
- Übersicht: Der Gleitzeit-Saldo steht überall auch in Tagen – im Verlauf, beim tiefsten Stand, in den Monaten und bei den eingetragenen Ständen.

## 1.0.2 – 2026-10-31
- Übersicht: Gleitzeit-Saldo Ende Jahr in Stunden und Tagen.

## 1.0.1 – 2026-10-31
- Abwesenheit erfassen: Nach dem Wählen von «Von» öffnet sich «Bis» gleich mit diesem Datum – Von und Bis in einem Zug.

## 1.0.0 – 2026-10-31
- Erste Version: Ferien und Gleitzeit fürs ganze Jahr im Blick – Prognose Tag für Tag mit Monatsübersicht und Verlauf.
- Aktuellen Gleitzeit-Saldo (und auf Wunsch Ferien-Rest) mit Stichtag eintragen; ab dort rechnet Flux neu mit dem eingestellten Aufbau pro Arbeitstag.
- Abwesenheiten mit Datum: Flux zählt die Arbeitstage, du teilst sie auf Ferien und Gleitzeit auf – auch halbe Tage und Kommazahlen.
- Alle Schweizer Feiertage zum Anhaken, ganz, halb oder in Stunden; Vorfeiertage mit weniger Sollzeit am Vortag; eigene Feiertage. Feiertage am Wochenende zählen nicht.
- Jahre: Saldo und Ferienrest gehen automatisch ins neue Jahr, alte Jahre bleiben zum Anschauen.
- Stempelrechner: vier Zeiten eintragen, Differenz zur Sollzeit grün/rot in Minuten, «Sollzeit erreicht um …».
- Sicherung, Update-Knopf, als App installierbar.
