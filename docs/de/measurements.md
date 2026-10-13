# Messungen, Timer und Wassertest-Verbrauch

[Handbuch](README.md) · [English](../en/measurements.md) · [Projektübersicht](../../README.md)

Die Wassertests sind modular als **JSON-Dateien** unter `../../src/config/suites` (bzw. für eigene Erweiterungen unter `data/suites/`) abgelegt:
- **Standard-Suite (`jbl-pro-aquatest.json`):** JBL PRO AQUATEST Testlab Tropfentests nach offizieller Gebrauchsanweisung mit verifizierten Reaktionszeiten (z. B. Kalium 90 s, Nitrit 5 min, Nitrat 10 min, Ammonium 10 min, Phosphat 10 min, Eisen 10 min, Kupfer 15 min, Silikat 3 min).
- **Konsolidierter pH-Wert:** Statt unübersichtlicher Einzeltests für verschiedene pH-Bereiche existiert ein einheitlicher pH-Test (3,0 bis 10,0), bei dem der Messwert direkt erfasst wird.
- **Weitere Suiten:** Beliebig erweiterbar (z. B. `jbl-easy-7in1.json` für Teststreifen).
- **Benutzerauswahl:** Jeder Anwender kann sowohl im Profil (`#/profile`) als auch direkt bei der Messung (`#/a/:id/messen`) auswählen, welche Testsuite er nutzt und welche Tests er besitzt/durchführen möchte. Die Auswahl wird dauerhaft im Benutzerkonto und im Browser gespeichert.

### Verbrauchszähler und Nachkauferinnerung für JBL-Tröpfchentests

Im Profil unter **Wassertest-Verbrauch & Nachkaufen** lassen sich pro vorhandenem Test der bisherige Verbrauch und die Gesamtreichweite einer Nachfüllung einstellen. **Neue Nachfüllung / Zähler zurücksetzen** setzt den Verbrauch auf 0 und gibt die Nachkauferinnerung für diesen Test wieder frei. Vorhandene Messhistorie wird nicht rückwirkend gezählt; trage den Verbrauch deiner aktuellen Flasche einmalig ein.

Jeder neu gespeicherte Messwert zählt als **ein Test**, auch `0`, auch beim CSV-Import und über mehrere Aquarien hinweg. Gezählt wird beim eintragenden Benutzer, auch bei geteilten Aquarien. Leere, ungültige oder abgewiesene Werte zählen nicht. Das Löschen einer Messung stellt verbrauchtes Reagens nicht wieder her. Ein Thermometer und aus pH/KH berechnetes CO₂ verbrauchen kein eigenes Reagens. Die gewählte Testsuite bestimmt, welche Tests gezählt werden; Teststreifen werden nicht als einzelne JBL-Tröpfchentests gezählt.

Hinterlegte Reichweiten sind Hersteller-Richtwerte pro Test-Set bzw. Nachfüllung (recherchiert am 12.10.2026):

| JBL PROAQUATEST | Messungen (ca.) | Quelle |
|---|---:|---|
| pH 3,0–10,0 | 50 | [JBL-Testübersicht](https://www.jbl.de/de/themenwelt/essential_section/132?country=de&cpref=32) |
| pH 6,0–7,6 / 7,4–9,0 | 80 | [JBL pH 6,0–7,6](https://www.jbl.de/de/produkte/detail/8643/jbl-proaquatest-ph-60-76?country=de&cpref=824), [JBL pH 7,4–9,0](https://www.jbl.de/de-de/productsv2/detail/25161373) |
| NH₄, NO₂, PO₄ Sensitive, Fe, Cu, SiO₂ | 50 je Test | [JBL-Testübersicht](https://www.jbl.de/de/themenwelt/essential_section/132?country=de&cpref=32) |
| NO₃ | 40 | [JBL Nitrat](https://www.jbl.de/de-de/productsv2/detail/25211652) |
| O₂ | 40 | [JBL Sauerstoff](https://www.jbl.de/de-lu/productsv2/detail/25169665) |
| K | 25 | [JBL Kalium](https://www.jbl.de/fr-mg/productsv2/detail/25211514) |
| Mg Fresh water | 60 | [JBL-PROAQUATEST-Katalog (PDF)](https://pm-aquaristik.de/jbl-pdf/jbl-pro-aquatest-katalog.pdf) |
| KH, GH, Ca, Mg-Ca (Meerwasser), CO₂ Direct | variabel, eigene Schätzung erforderlich | [JBL Calcium / Titrationstests](https://www.jbl.de/de/produkte/detail/8682/jbl-proaquatest-ca-calcium?country=de&cpref=736), [JBL CO₂ Direct](https://www.jbl.de/de/produkte/detail/8691/jbl-proaquatest-co2-direct?country=de&cpref=384) |

Die Reichweite bleibt anpassbar, etwa für eine andere Packungsgröße oder den individuellen Tropfenverbrauch. Im Profil können die pH- und Magnesium-Variante sowie CO₂ Direct oder berechnetes CO₂ ausgewählt werden. Ab **75 % Verbrauch** wird einmal pro Nachfüllung eine E-Mail mit Testname und Restmenge eingereiht, sofern die Erinnerung aktiviert ist, die E-Mail-Adresse verifiziert wurde und SMTP eingerichtet ist. Die Grenze wird auf ganze Tests aufgerundet: bei 50 Tests ab Test 38, bei 25 ab Test 19. Nach dem Einrichten von SMTP prüft der Erinnerungs-Scheduler bisher offene Erinnerungen ebenfalls (alle 30 Minuten). Vorlagen: `test-refill-reminder.tpl` und `test-refill-reminder.en.tpl`; eigene Vorlagen unter `../../data/mail-templates`. Verbrauch und Erinnerungsstatus bleiben bei Backup/Restore mit SQLite und MongoDB erhalten.

## Wartezeiten und Grenzwerte

Die Testparameter und Standardwerte liegen in `../../src/config/suites/jbl-pro-aquatest.json` und `config.ts`.

- **Wartezeiten:** Alle Zeiten im Standard-Set basieren auf der JBL Testlab-Gebrauchsanweisung (`verified: true`). Eigene Testsuiten können jederzeit als JSON ergänzt werden.
- **Grenzwerte:** Richtwerte für Süß- und Meerwasser. Prüfe sie für dein Becken und passe sie an.
  Die App ersetzt keine Beratung durch Fachleute.

## Messablauf, Verlauf und CSV

Wähle im Profil oder in der Messmaske (`#/a/:id/messen`) die Testsuite und die tatsächlich verwendeten Tests. Werte werden bereits bei der Eingabe bewertet; Dezimalkomma ist erlaubt. Mehrere Reaktionstimer können gleichzeitig laufen. Ton, Vibration, Bildschirm-Wachhalten und Systembenachrichtigungen hängen von Browserunterstützung und Berechtigungen ab. Der Service Worker verarbeitet Timer-Nachrichten, speichert aber keine Offline-Version der App; Betriebssysteme können Hintergrundprozesse unterbrechen. Im Profil lässt sich eine Testbenachrichtigung auslösen.

Im Aquarium zeigen Diagramme und Tabelle den Messverlauf. Schnellfilter reichen von sieben Tagen bis zum gesamten Verlauf; Start und Ende können frei gewählt werden. Standardmäßig werden 90 Tage angezeigt, sofern im Profil kein anderer Zeitraum hinterlegt ist. Auffällige Werte erzeugen Warnungen oder kritische Alarme, die bestätigt werden können.

CSV-Export bietet Semikolon mit UTF-8-BOM für Excel oder Komma für Standard-CSV. Es werden CSV-Dateien exportiert, keine `.xlsx`-Arbeitsmappen. Beim Import lassen sich Datum, Uhrzeit, Notiz und Wasserparameter interaktiv zuordnen. Deutsche und ISO-Datumsformate sowie Komma/Punkt als Dezimaltrenner werden unterstützt. Importierte Werte durchlaufen die Grenzwertprüfung und zählen bei passenden Tests zum Verbrauch.
