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

Der Web Worker (`../../public/frontend/worker.ts`) übernimmt CSV-Verarbeitung, Katalogsuche, Zeitreihenberechnungen und unterstützte Bildverarbeitung. Der separate Service Worker (`public/frontend/service-worker.ts`) verarbeitet Timer-Benachrichtigungen. Beide haben unterschiedliche Aufgaben; die App bietet keinen vollständigen Offline-Modus.

Passwort-Hashing mit scrypt läuft asynchron. Ein Backend-Threadpool verarbeitet Hintergrundaufgaben. Der Supervisor kann über `WORKERS` mehrere Serverprozesse starten und abgestürzte Worker ersetzen. `WORKER_THREADS` steuert den Threadpool; OIDC-Zustände sind signiert und nicht an einen einzelnen Prozess gebunden. Ereignisse und Fehler werden in `LOG_FILE` geschrieben.

## Build, Entwicklung und Tests

`npm run build` und `npm run dist` prüfen Typen, kompilieren das Backend nach `../../dist/backend` und bauen das Frontend nach `public/dist/`. Stabile JavaScript-Einstiegspunkte laden das kompilierte Backend. Nach Backendänderungen neu bauen und den Server neu starten. Watch-Befehle beobachten das Frontend und kompilieren das Backend nur beim Start.

Für Hot Reload läuft nach einem Build die API über `npm start`, Vite separat über `npm run dev`. Vite leitet `/api`, `/auth` und `/sw.js` weiter. Die [Installation](installation.md) enthält auch die Bun-Befehle und Proxy-Konfiguration.

```bash
npm run typecheck
npm test
npm test -- test/auth.test.js
npm test -- --info
```

Die Tests bauen das Backend vorab. Integrationstests benötigen lokale HTTP-Ports und für MongoDB eine Testbinary, die beim ersten Lauf gegebenenfalls heruntergeladen wird. Der kompakte Teststarter zeigt Fortschritt und Fehler; `--info` aktiviert vollständige Ausgaben. CI prüft beide Runtimes, Produktionsbuilds und Tests.

## Betriebsgrenzen

Die dokumentierten Prüfergebnisse und verbleibenden Betriebsgrenzen stehen in [AUDIT.md](../../AUDIT.md).
