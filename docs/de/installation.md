# Installation und Konfiguration

[Handbuch](README.md) · [English](../en/installation.md) · [Projektübersicht](../../README.md)

## Node.js und SQLite

```bash
npm ci               # Abhängigkeiten installieren (Node >= 22.12)
npm run build        # Kompiliert das Backend und bündelt das Frontend für Entwicklung
npm run dist         # Kompiliert das Backend und minifiziert das Frontend für Produktion
npm test             # führt alle automatisierten Tests aus (SQLite & MongoDB)
npm start            # startet die App (Standard: SQLite unter http://localhost:3000)
```

- **Entwicklung:** Nach `npm run build` startet `npm start` die Express-API (Port 3000); `npm run dev` startet in einem zweiten Terminal Vite mit Hot Reload unter http://127.0.0.1:5173. `/api`, `/auth` und `/sw.js` werden an Express weitergeleitet. Für eine andere Backend-Adresse kann `VITE_BACKEND_URL` gesetzt werden. OIDC verwendet die konfigurierte Backend-Adresse `APP_URL`.
- **Prüfung:** `npm run typecheck` prüft Frontend und Backend. `npm run typecheck:backend` prüft nur das Backend. Der Backend-Compiler verwendet vollständige `strict`-Prüfungen einschließlich Klasseninitialisierung und `unknown` für geworfene Fehler. Gemeinsame Repository-Verträge prüfen Benutzer, Aquarien, Besatz, Dosierpumpen und Messungen; wichtige SQL- und MongoDB-Abfragen besitzen konkrete Ergebnistypen. Eingelesenes JSON wird als `unknown` geprüft. Flexible Typen bleiben an dynamischen Import- und Datenbankgrenzen. `npm test` führt die automatisierten Tests mit kompakter Zusammenfassung aus. Eine Fortschrittsanzeige zeigt die aktuelle Testdatei von insgesamt ausgewählten Dateien und den Namen des laufenden Tests; im Terminal wird dieselbe Zeile aktualisiert, in umgeleiteten Ausgaben stehen die Fortschritte zeilenweise. Bei Fehlern werden Fehlerdetails und die letzten Testausgaben angezeigt. `npm test -- --info` zeigt zusätzlich alle Testergebnisse und vollständige Logs. Einzelne Testdateien lassen sich etwa mit `npm test -- test/auth.test.js` ausführen; `--info` kann damit kombiniert werden. Die Integrationstests benötigen lokale HTTP-Ports und für MongoDB eine MongoDB-Testbinary (beim ersten Lauf gegebenenfalls ein Download).
- **Build:** `npm run build` und `npm run dist` kompilieren zuerst das TypeScript-Backend nach `../../dist/backend` und erzeugen danach das Entwicklungs- bzw. Produktions-Bundle unter `public/dist/`. Beide führen vorher die Typprüfung aus. `npm run build:backend` baut nur das Backend; nach Backend-Änderungen neu bauen und den Server neu starten. `npm test` baut das Backend vor den Tests automatisch neu. Chart.js wird als Modul gebündelt. Vite baut den Rechen-Worker; der TypeScript-Service-Worker wird als `dist/sw.js` erzeugt und über `/sw.js` ausgeliefert.
- **Betrieb:** Express wählt die gebauten Produktions- oder Entwicklungsdateien und unterstützt `APP_URL` mit Unterpfad. Der stabile Einstiegspunkt `../../server.js` lädt das kompilierte `server.ts`. Ohne Backend-Build erscheint ein Einrichtungshinweis beim Start; fehlt nur das Frontend, antwortet dessen Seite mit HTTP 503. Im Betrieb werden weder der TypeScript-Compiler noch Entwicklungsabhängigkeiten benötigt. `npm run build:watch` / `npm run dist:watch` beobachten Frontendänderungen; das Backend wird beim Start dieser Befehle einmal kompiliert. Docker erstellt weiterhin den Produktions-Build beim Image-Bau.

Beim ersten Aufruf einer leeren Installation führt ein zweisprachiger Einrichtungsassistent durch das erste Administrator-Konto sowie SMTP- und Backup-Einstellungen. Er ist nur verfügbar, solange noch kein Benutzer existiert. Weitere Administratoren lassen sich anschließend in der Benutzerverwaltung bestimmen. Beim Upgrade werden bisher über `ADMIN_EMAIL` erkannte und bereits bestätigte Konten einmalig als Administratoren in die Datenbank übernommen.

## Bun: Installation, Build, Tests und Start

Bun **ab 1.4.3** wird als vollständige Runtime unterstützt; Node muss für diesen Ablauf nicht installiert sein:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run build:bun          # Entwicklung inkl. Vue-/TypeScript-Typprüfung
bun run dist:bun           # Produktionsbuild inkl. Typprüfung
bun run test:bun           # Isolierte Tests für SQLite und MongoDB
bun run start:bun          # Server mit Supervisor
bun run dev:bun            # Vite mit Hot Reload (zweites Terminal)
```

- `bun run typecheck:bun` prüft Vue-Scripts, Templates und das TypeScript-Backend über die Compiler-API ohne den Node-spezifischen Ladepatch von `vue-tsc`. Es werden keine Typfehler unterdrückt.
- `bun run build:backend:bun` baut ausschließlich das Backend; `bun run typecheck:backend:bun` prüft dessen Typen.
- `bun run build:watch:bun` und `bun run dist:watch:bun` beobachten Frontendänderungen und kompilieren das Backend zu Beginn einmal. Die Typprüfung erfolgt vor Beginn des Watch-Modus; für erneute Typprüfungen `bun run typecheck:bun` ausführen.
- `bun run test:bun --info` zeigt vollständige Testlogs; einzelne Dateien lassen sich mit `bun run test:bun test/auth.test.js` auswählen. Der Bun-Teststarter zeigt Datei- und Untertest-Ergebnisse sowie eine Gesamtsumme. Zusätzliche native Bun-Testoptionen werden direkt mit `bun test` verwendet. Der Starter setzt temporäre Datenverzeichnisse und isoliert jede Testdatei in einem eigenen Prozess.
- `../../bun.lock` fixiert die Bun-Abhängigkeiten; `package-lock.json` bleibt für Node/npm erhalten. Installationsskripte von Abhängigkeiten bleiben deaktiviert (`trustedDependencies: []`, `--ignore-scripts`). SQLite nutzt weiterhin `better-sqlite3` 13 mit mitgelieferten Node-API-Binaries.
- Der Supervisor nutzt `node:cluster`, damit mehrere Worker denselben HTTP-Port unter Node und Bun bedienen können. Ein separater Rate-Limit-Controller zählt geschützte Aktionen atomar über alle HTTP-Worker. Er wird bei Fehlern unabhängig neu gestartet; die HTTP-Worker laufen weiter. Datenbankmigrationen werden vor dem Start der Worker abgeschlossen. Mehrprozess-Betrieb ist unter Linux geprüft.

Der Controller legt `rate-limits.sqlite` und `rate-limit-controller.key` mit privaten Rechten unter `DATA_DIR` ab. Die Datenbank enthält nur HMAC-gehashte Identitäten und bewahrt aktive Limits über Controller-Neustarts. Beide Dateien gehören zum Laufzeitzustand, nicht zum Anwendungsbackup. Die Schlüsseldatei nicht verändern, solange persistierte Limits weiterverwendet werden sollen. Mehrere Container oder Hosts teilen diesen Controller nicht; dort zusätzlich ein gemeinsames Limit am Reverse Proxy oder API-Gateway konfigurieren.
- Der Standard-`docker/Dockerfile` verwendet Bun 1.4.3 für Build und Betrieb, mit unprivilegiertem Benutzer `bun`. Ein Node-Image kann weiter mit `docker build -f docker/Dockerfile.node -t aquarium-logbuch:node .` gebaut werden. Bestehende Compose-Konfigurationen bleiben verwendbar.
- CI prüft beide Runtimes inklusive Produktionsbuild und vollständiger Testsuite, bevor das Container-Image veröffentlicht wird.

## Docker Compose

Alle folgenden Befehle werden im Hauptverzeichnis des Repositorys ausgeführt. `--project-directory .` erhält den bisherigen Compose-Projektnamen und die Zuordnung der benannten Volumes. Für den lokalen Bun-Image-Build: `docker build -f docker/Dockerfile -t aquarium-logbuch:bun .`.

Beide Compose-Dateien verwenden das [offizielle Container-Image](https://github.com/DrGanmon/aquarium-logbuch/pkgs/container/aquarium-logbuch) `ghcr.io/drganmon/aquarium-logbuch:latest`. Ein lokaler Build ist nicht erforderlich. Passe vor dem Start die Umgebungsvariablen in der jeweiligen Compose-Datei an (insbesondere `APP_URL` und das MongoDB-Passwort). Eine Vorlage für alle verfügbaren Umgebungsvariablen befindet sich in [example.env](../../docker/example.env).

```bash
# Images herunterladen und App samt MongoDB-Container starten
docker compose --project-directory . -f docker/docker-compose.yml pull
docker compose --project-directory . -f docker/docker-compose.yml up -d
```

Für den Betrieb mit SQLite ohne MongoDB:

```bash
docker compose --project-directory . -f docker/docker-compose.sqlite.yml pull
docker compose --project-directory . -f docker/docker-compose.sqlite.yml up -d
```

Für Updates dieselben `pull`- und `up -d`-Befehle erneut ausführen. Die Daten bleiben in den benannten Volumes erhalten.

Der GitHub-Workflow baut das App-Image für `linux/amd64` und `linux/arm64` und veröffentlicht beide Architekturen unter denselben Tags. Docker wählt beim Pull automatisch die passende Architektur aus, etwa ARM64 auf einem Raspberry Pi mit 64-Bit-Betriebssystem. Pull Requests bauen beide Varianten zur Prüfung, ohne sie zu veröffentlichen.

## Konfigurationsvariablen


| Variable | Standard | Bedeutung |
|---|---|---|
| `DB_TYPE` | `sqlite` (oder `mongodb` falls `MONGODB_URI` gesetzt ist) | Datenbank-Typ (`sqlite` oder `mongodb`) |
| `MONGODB_URI` | `mongodb://localhost:27017/aquarium` | Verbindungszeichenfolge für MongoDB |
| `MONGODB_DB_NAME` | `aquarium` | Optionaler Name der MongoDB-Datenbank |
| `PORT` | 3000 | Port |
| `DATA_DIR` | `./data` | Ordner für Uploads, SQLite-Datenbank & Logdateien |
| `APP_URL` | (leer) | Öffentliche Adresse der App, z. B. `https://aquarium.example.com` oder `https://example.com/aquarium`. Pflicht für OIDC |
| `ALLOW_REGISTRATION` | true | `false` sperrt neue Konten (lokal und beim ersten OIDC-Login) |
| `COOKIE_SECURE` | automatisch | `true`, wenn die App hinter HTTPS läuft. Standard: `true`, wenn `APP_URL` mit `https://` beginnt |
| `TRUST_PROXY` | (aus) | `1`, wenn genau ein Reverse Proxy davorsteht |
| `OIDC_ISSUER` | (leer) | URL des Pocket-ID-Servers, z. B. `https://id.example.com`. Gesetzt = OIDC aktiv |
| `OIDC_CLIENT_ID` | (leer) | Client-ID aus Pocket ID |
| `OIDC_CLIENT_SECRET` | (leer) | Client-Secret aus Pocket ID (leer lassen bei einem öffentlichen Client) |
| `OIDC_STATE_SECRET` | Client-Secret oder zufälliger Prozessschlüssel | Geheimnis für verschlüsselten OIDC-Status. Bei öffentlichen Clients mit mehreren Instanzen einen gemeinsamen zufälligen Wert mit mindestens 32 Bytes setzen. Supervisor-Worker erben denselben Schlüssel; ohne festen Schlüssel werden laufende Anmeldungen nach Neustart ungültig. |
| `OIDC_SCOPES` | `openid profile email` | Angeforderte Scopes |
| `OIDC_PROVIDER_NAME` | `Pocket ID` | Beschriftung des Anmelde-Buttons |
| `LOCAL_LOGIN` | automatisch | Lokale Anmeldung mit Passwort. Standard: aus, wenn OIDC aktiv ist, sonst an |
| `OIDC_LINK_BY_USERNAME` | false | `true` verknüpft beim ersten OIDC-Login ein vorhandenes lokales Konto mit gleichem Benutzernamen und gleicher, vom Provider bestätigter E-Mail-Adresse |
| `ADMIN_EMAIL` | (leer) | Nur Upgrade-Kompatibilität: bestätigte bestehende Konten mit diesen E-Mail-Adressen werden einmalig in Datenbank-Administratoren migriert |
| `CONTACT_EMAIL` | `ADMIN_EMAIL` | Optionale Support- & Kontakt-E-Mail-Adresse für Impressum & Kontaktseite |

| `IMPRINT_EMAIL` | `CONTACT_EMAIL` | Optionale E-Mail-Adresse für Anbieterkennzeichnung / Impressum gem. § 5 DDG |
| `SMTP_HOST` | (leer) | SMTP-Server-Host für E-Mail-Versand (auch über Admin-Interface konfigurierbar) |
| `SMTP_PORT` | `587` | SMTP-Port (z. B. `587` für STARTTLS, `465` für SSL/TLS, `25` unverschlüsselt) |
| `SMTP_SECURE` | `false` | `true` für direkte SSL/TLS-Verschlüsselung (Port 465) |
| `SMTP_USER` | (leer) | SMTP-Benutzername |
| `SMTP_PASS` | (leer) | SMTP-Passwort |
| `SMTP_FROM` | `Aquarium-Logbuch <noreply@...>` | Absenderadresse für ausgehende E-Mails |
| `SMTP_RATE_LIMIT_MS` | `500` | Verzögerung zwischen E-Mails in der Queue (Millisekunden) |
| `DEFAULT_AI_PROVIDER` | `openai` | Standard-KI-Provider für den Chat (`openai`, `gemini`, `claude`) |
| `APP_ENCRYPTION_KEY` | (leer; lokale Schlüsseldatei) | 64 Hex-Zeichen / 32 zufällige Bytes für persönliche KI-Schlüssel. Alle Instanzen derselben Datenbank müssen denselben Wert bzw. dieselbe Schlüsseldatei verwenden. |
| `OPENAI_API_KEY` | (leer) | Globaler Fallback-API-Key für OpenAI / ChatGPT (optional) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Standard-Modell für OpenAI Chat Completions |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Optionale Basis-URL für OpenAI API / Proxys |
| `GEMINI_API_KEY` | (leer) | Globaler Fallback-API-Key für Google Gemini (optional) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Standard-Modell für Google Gemini |
| `CLAUDE_API_KEY` | (leer) | Globaler Fallback-API-Key für Anthropic Claude (optional) |
| `CLAUDE_MODEL` | `claude-3-5-haiku-20241022` | Standard-Modell für Anthropic Claude Messages API |
| `LOG_FILE` | `./data/aquarium.log` | Pfad zur `.log`-Datei für Fehler- und Systemprotokolle |
| `SUPERVISOR` | `true` | `false` startet die Anwendung im Einzelprozess ohne Überwachungs-Watchdog |
| `WORKERS` | `1` (bzw. `auto` in Docker) | Anzahl der Worker-Prozesse (`auto` = alle CPU-Kerne) |
| `WORKER_THREADS` | `auto` | Anzahl der Worker-Threads für rechenintensive Aufgaben (Scrypt, Datenanalyse) |

MongoDB muss als Replica Set betrieben werden, auch bei einem einzelnen Knoten. Mehr-Collection-Backups verwenden Snapshot-Lesevorgänge; Restores laufen atomar in einer Transaktion. Die Compose-Vorlage richtet ein authentifiziertes Einzelknoten-Replica-Set samt zufällig erzeugtem, zugriffsgeschütztem Keyfile automatisch ein. Das Keyfile liegt im persistenten Volume `mongo-keyfile`; dieses Volume bei bestehenden Mongo-Daten nicht löschen oder zwischen Instanzen unterschiedlich erzeugen. Bei eigener MongoDB muss die URI ein Replica Set angeben, zum Beispiel `replicaSet=rs0`, und jedes Replica-Set-Mitglied benötigt dasselbe Keyfile.

## Reverse Proxy und OIDC

1. In Pocket ID unter *OIDC Clients* einen neuen Client anlegen:
   - **Callback URL:** `<APP_URL>/auth/callback`, z. B. `https://aquarium.example.com/auth/callback`
   - **Logout Callback URL:** `<APP_URL>/`, z. B. `https://aquarium.example.com/`
   - Optional: Zugriff über *Allowed User Groups* auf bestimmte Gruppen beschränken.
2. Client-ID und Client-Secret übernehmen und die App starten, z. B.:

```bash
APP_URL=https://aquarium.example.com \
OIDC_ISSUER=https://id.example.com \
OIDC_CLIENT_ID=... OIDC_CLIENT_SECRET=... \
TRUST_PROXY=1 npm start
```

Die App nutzt den Authorization Code Flow mit PKCE, prüft die Signatur des ID-Tokens über die JWKS des Servers
sowie `iss`, `aud`, `exp` und `nonce`. Beim ersten Login wird automatisch ein Konto angelegt
(Benutzername aus `preferred_username`), die Zuordnung erfolgt dauerhaft über die `sub` des Benutzers.
"Abmelden" beendet auch die Sitzung bei Pocket ID.

**Umstieg und nachträgliche Zuordnung von lokalen Konten:**
- **Selbstverknüpfung:** Angemeldete Benutzer können ihr Konto in der Kopfzeile über „Mit Pocket ID verknüpfen“ direkt mit Pocket ID verbinden.
- **Automatisch per E-Mail:** Stimmt die im lokalen Konto hinterlegte E-Mail-Adresse mit der E-Mail-Adresse aus Pocket ID überein, wird das Konto beim OIDC-Login automatisch zugeordnet.
- **Admin-Benutzerverwaltung:** Administratoren können in der Benutzerverwaltung die OIDC-Benutzer-ID (`sub`) für jedes Konto direkt eintragen, ändern oder löschen.
- **Per Benutzername:** Mit `OIDC_LINK_BY_USERNAME=true` wird ein vorhandenes Konto beim ersten Pocket-ID-Login übernommen, wenn Benutzername und bestätigte E-Mail-Adresse übereinstimmen. Unbestätigte Provider-Adressen werden weder zur Kontoverknüpfung noch zur Vergabe von Administratorrechten verwendet.

**App unter einem Unterpfad:** `APP_URL` darf einen Pfad enthalten (z. B. `https://example.com/aquarium`).
Der Reverse Proxy muss diesen Präfix dann entfernen, bevor er an die App weiterleitet
(Caddy: `handle_path /aquarium/* { reverse_proxy localhost:3000 }`).

## Betrieb

- **HTTPS:** Hinter einen Reverse Proxy (Caddy, nginx, Traefik) stellen, `APP_URL=https://...` (oder `COOKIE_SECURE=true`) sowie `TRUST_PROXY=1` setzen.
- **Backup:** `sqlite3 data/aquarium.db ".backup backup.db"` (die Datenbank läuft im WAL-Modus,
  daher nicht einfach nur die .db-Datei kopieren).
- **Passwörter** (nur lokale Anmeldung) werden mit scrypt gehasht, Sitzungen als Hash in der Datenbank gespeichert.

## Verschlüsselung persönlicher KI-Schlüssel

Persönliche API-Schlüssel werden mit AES-256-GCM und einer zufälligen Nonce verschlüsselt. Die Authentifizierung bindet jeden Chiffretext an Benutzer-ID und Anbieter. Migration 7 verschlüsselt vorhandene Klartextwerte und legt `<anbieter>_api_key_prefix` / `<anbieter>_api_key_suffix` mit jeweils bis zu vier Zeichen an. Bei jedem Start werden Schlüssel geprüft und gegebenenfalls normalisiert. Anbieteraufrufe verwenden entschlüsselte Werte nur im Arbeitsspeicher. Globale Anbieter-Schlüssel aus Umgebungsvariablen bleiben außerhalb der Datenbank.

Ohne `APP_ENCRYPTION_KEY` erzeugt die Anwendung bei der ersten notwendigen Verschlüsselung atomar eine zufällige Schlüsseldatei `DATA_DIR/app-encryption.key` mit POSIX-Rechten `0600`. Sie bleibt über Neustarts erhalten und wird von Workern im selben Datenvolume gemeinsam genutzt. Bei mehreren unabhängigen Instanzen mit derselben MongoDB entweder dieselbe Datei bereitstellen oder überall denselben Umgebungswert setzen. Beispiel zum Erzeugen eines Umgebungswertes: `openssl rand -hex 32`. Den Wert geheim halten.

Die Schlüsseldatei bzw. den Umgebungswert **separat sichern**: Datenbank-/Bildbackups enthalten diesen Master-Schlüssel absichtlich nicht. Für eine Wiederherstellung auf einem anderen Server zuerst den ursprünglichen Schlüssel bereitstellen. Einen bestehenden Master-Schlüssel nicht einfach austauschen: ohne passende Entschlüsselung und erneute Verschlüsselung werden vorhandene Tokens unlesbar. Bei fehlendem/falschem Schlüssel oder manipuliertem Chiffretext wird die Entschlüsselung abgewiesen; Wiederherstellung prüft verschlüsselte Tokens vor dem Ersetzen der Daten.

Neue Sicherungen einschließlich des Backups vor der Migration enthalten bereits verschlüsselte persönliche Tokens. Ältere Klartextbackups werden beim Restore vor dem Einfügen verschlüsselt; bereits vorhandene Archive und externe Kopien werden nicht rückwirkend verändert. SQLite kann alte Klartextreste in freien Seiten oder älteren WAL-/Dateikopien behalten; diese physische Bereinigung ist nicht Teil der logischen Migration. Datenvolume, Schlüsseldatei und Backups weiterhin vor fremdem Zugriff schützen.

### App-Schlüssel und Backup-Passwort

`APP_ENCRYPTION_KEY` ist der gemeinsame Schlüssel für persönliche KI-Schlüssel, das verschlüsselt in SQLite/MongoDB gespeicherte Backup-Passwort und lokale Archivschlüssel. Docker Compose übernimmt ihn aus der Umgebung bzw. `.env`. Beim Umstieg den **bisherigen Wert unverändert übernehmen**. Der alte Name `AI_TOKEN_ENCRYPTION_KEY` bleibt als Fallback lesbar; die alte Datei `ai-token-encryption.key` wird ohne Schlüsselwechsel als `app-encryption.key` übernommen. Ein gesetzter neuer Umgebungswert hat Vorrang.

Unter Administration → Backups ein Passwort mit mindestens 12 Zeichen setzen und speichern. Neue manuelle und automatische Backups sind danach vollständig verschlüsselte `.json.gz.enc`-Dateien. Ohne Passwort werden sie abgewiesen. Migrationssicherungen vor der ersten Einrichtung werden mit dem App-Schlüssel verschlüsselt. Alte unverschlüsselte Backups werden nicht automatisch umgewandelt und bleiben importierbar.

Passwortwechsel gelten für neue Backups. Alte Downloads benötigen das damalige Passwort oder den ursprünglichen App-Schlüssel. Im Wiederherstellungsfeld kann das Archivpasswort angegeben werden; leer verwendet den lokalen App-Schlüssel. Dieser ermöglicht auch die Bildbereinigung in lokalen Archiven nach Passwortwechseln. App-Schlüssel separat sichern: Persönliche KI-Schlüssel im Backup benötigen ihn weiterhin, selbst wenn das Archivpasswort bekannt ist. Backup-Passwörter werden weder in Antworten noch in Exportdaten aufgenommen; beim Restore bleibt die aktuelle Passwortkonfiguration erhalten.
