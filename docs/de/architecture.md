# Architektur, Build und Entwicklung

[Handbuch](README.md) · [English](../en/architecture.md) · [Projektübersicht](../../README.md)

## Aufbau und Zuständigkeiten

| Bereich | Quellen | Aufgabe |
|---|---|---|
| Server und HTTP | `../../server.ts`, `src/app.ts`, `src/routes/` | Start, API, Authentifizierung und Auslieferung des Frontends |
| Fachlogik | `../../src/services` | Aquarien, Arten, Testsuiten, Diagnose, Chat, Erinnerungen und Backups |
| Datenbank | `../../src/db`, `src/types/repositories.ts` | SQLite-/MongoDB-Adapter, Migrationen und Repository-Verträge |
| Frontend | `../../public/frontend` | Vue-Ansichten, Komponenten, Router, Zustand und API-Zugriffe |
| Kataloge und Vorlagen | `../../src/config`, `src/templates/mail/` | Versionierte Daten und übersetzte E-Mail-Vorlagen |
| Lokale Daten | `../../data` bzw. `DATA_DIR` | Datenbank, Uploads, Konfiguration, eigene Kataloge und Sicherungen |

Das Backend verwendet TypeScript mit strikter Typprüfung und Express. Services bündeln Fachlogik; Katalog-Caches gehören zur jeweiligen Instanz. Konfigurationsservices nutzen einen gemeinsamen JSON-Speicher mit getrennten Dateipfaden. Node.js ab 22.12 und Bun ab 1.4.3 werden unterstützt.

SQLite ist der Standard und verwendet WAL und `busy_timeout`; MongoDB wird über `DB_TYPE` und `MONGODB_URI` gewählt. Migrationen laufen vor dem Start der Server-Worker.

## Frontend und Hintergrundarbeit

Vue 3 verwaltet Ansichten und Dialoge, Vite bündelt TypeScript und Chart.js. Übersetzungen aus `../../public/locales` sind im Bundle enthalten. Der API-Client sendet Sprach- und Sitzungskontext mit den Anfragen; der Server prüft den Zugriff auf Aquarien und Unterressourcen.

Seiten und größere Dialoge werden als separate JavaScript-Module erst beim Öffnen geladen. Diagrammcode wird erst im Messverlauf geladen; einzelne Diagramme entstehen beim Annähern an den sichtbaren Bereich. Chart.js registriert nur die benötigten Linienchart-Bausteine. Krankheits- und Medikamentenkataloge rendern zunächst 24 Karten und ergänzen weitere beim Scrollen oder per Schaltfläche; die Suche umfasst weiterhin den vollständigen geladenen Katalog. Messwerttabellen rendern zunächst 50 Zeilen und ergänzen weitere beim Scrollen; Diagramme und Export behalten den gesamten gewählten Zeitraum. Profil-Tabs laden ihre Inhalte beim ersten Besuch und behalten anschließend Eingaben. Der Gesundheitskatalog wird nur im Katalog-Tab abgerufen. Dateinamen der Module enthalten einen Inhalts-Hash und können dauerhaft gecacht werden; Einstieg, Versionsdatei und Service Worker behalten ihre Aktualisierungsregeln.

Der Web Worker (`../../public/frontend/worker.ts`) übernimmt CSV-Verarbeitung, Katalogsuche, Zeitreihenberechnungen und unterstützte Bildverarbeitung. Der separate Service Worker (`public/frontend/service-worker.ts`) verarbeitet Timer-Benachrichtigungen. Beide haben unterschiedliche Aufgaben; die App bietet keinen vollständigen Offline-Modus.

Passwort-Hashing mit scrypt läuft asynchron. Ein Backend-Threadpool verarbeitet Hintergrundaufgaben. Der Supervisor kann über `WORKERS` mehrere Serverprozesse starten und abgestürzte Worker ersetzen. `WORKER_THREADS` steuert den Threadpool; OIDC-Zustände sind signiert und nicht an einen einzelnen Prozess gebunden. Ereignisse und Fehler werden in `LOG_FILE` geschrieben.

## Build, Entwicklung und Tests

`npm run build` und `npm run dist` prüfen Typen, kompilieren das Backend nach `../../dist/backend` und bauen das Frontend nach `public/dist/`. Stabile JavaScript-Einstiegspunkte laden das kompilierte Backend. Nach Backendänderungen neu bauen und den Server neu starten. Watch-Befehle beobachten das Frontend und kompilieren das Backend nur beim Start.

Für Hot Reload läuft nach einem Build die API über `npm start`, Vite separat über `npm run dev`. Vite leitet `/api`, `/auth` und `/sw.js` weiter. Die [Installation](installation.md) enthält auch die Bun-Befehle und Proxy-Konfiguration.

```bash
npm run typecheck
npm test
npm test -- --jobs=4
npm test -- --serial
npm test -- test/auth.test.js
npm test -- --info
```

Die Tests bauen das Backend vorab. Integrationstests benötigen lokale HTTP-Ports und für MongoDB eine Testbinary, die beim ersten Lauf gegebenenfalls heruntergeladen wird. Der kompakte Teststarter zeigt Fortschritt und Fehler; `--info` aktiviert vollständige Ausgaben. CI prüft beide Runtimes, Produktionsbuilds und Tests.

## Betriebsgrenzen

Die dokumentierten Prüfergebnisse und verbleibenden Betriebsgrenzen stehen in [AUDIT.md](../AUDIT.md).

## Parallele und isolierte Testläufe

Der Starter führt standardmäßig bis zu vier Testdateien parallel aus, begrenzt durch verfügbare CPUs und das Speicherlimit (Budget von 1 GiB pro Worker). Jede Datei läuft in einem eigenen Prozess mit eigenem temporärem `DATA_DIR`; Modulzustand, Umgebungsvariablen, Uploads, Logs und Backups sind getrennt. Tests und Untertests innerhalb einer Datei bleiben seriell. Die Frontend-Buildtests laufen exklusiv, da sie den gemeinsamen Buildordner verändern. Fehlerausgaben, Exit-Code und Summen werden aus allen Dateien zusammengeführt; ein Abbruch beendet die Prozessgruppen und bereinigt temporäre Daten.

`--jobs=N` oder `--test-concurrency=N` legt die Parallelität fest (1–64), `--serial` schaltet auf eine Datei um. Alternativ setzt `AQUARIUM_TEST_JOBS=2 npm test` den Standard; CLI-Angaben haben Vorrang. Dieselben Optionen gelten für `bun run test:bun`. `--info` zeigt vollständige Logs und Ergebnisse. Eine leere Dateiauswahl oder ungültige Parallelität schlägt fehl. Native Node-Filter wie `--test-name-pattern` können weitergegeben werden. Eigene Reporter, Watch-Modus, Coverage-Optionen und deaktivierte Prozessisolation verwenden automatisch den seriellen nativen Node-Runner, damit diese Funktionen erhalten bleiben.

Das Backend wird vor dem Testlauf einmal kompiliert. Verschachtelte Starter-Tests verwenden diesen Build erneut, statt die Dateien anderer Worker zu löschen und neu zu erzeugen. Auch CI verwendet den zuvor erfolgreich typgeprüften Produktionsbuild für die Tests und begrenzt die Parallelität auf zwei Dateien. Der MongoDB-Binärcache wird über GitHub Actions wiederverwendet; die einzelnen Datenbanken und Server bleiben getrennt.

Grundlagen: [Node-Testisolation](https://nodejs.org/api/test.html#test-runner-execution-model), [Buns `node:test`-Kompatibilität](https://bun.com/docs/runtime/nodejs-compat#node-test) und [MongoDB-Binärcache](https://typegoose.github.io/mongodb-memory-server/docs/api/config-options/#download_dir).
