<p align="center">
  <img src="public/icon-192.png" alt="Aquarium-Logbuch Logo" width="128" height="128" style="border-radius: 24px;">
</p>

# Aquarium-Logbuch

<p align="center">
  <strong>🇩🇪 Deutsch</strong> &nbsp;|&nbsp; <a href="README.en.md">🇬🇧 English</a>
</p>

Mehrbenutzer-Webanwendung für Aquarien-Wasserwerte und Pflegeaktivitäten.
Anmeldung wahlweise lokal mit Passwort oder per OAuth 2.0 / OpenID Connect gegen [Pocket ID](https://pocket-id.org).

## App-Funktionen

- Anmeldung über Pocket ID (OIDC) oder lokal mit Registrierung
- **4 Registrierungs- & Einladungsmodi:**
  - **🟢 Offen:** Jeder Besucher kann sich direkt selbst registrieren.
  - **🔒 Einladung (Admin):** Nur Administratoren können neue Einladungscodes generieren oder Einladungs-E-Mails versenden.
  - **👥 Einladung (Offen):** Alle registrierten Benutzer können im Profil Freunde per Code oder E-Mail einladen.
  - **⛔ Geschlossen:** Registrierung und neue Einladungen sind vollständig deaktiviert.
  - **Flexible Einladungscodes & E-Mails:** Einladungscodes mit konfigurierbarer Gültigkeit (standardmäßig max. 7 Tage für Nutzer, vom Admin konfigurierbar) und Verwendungsbeschränkungen sowie E-Mail-Einladungen (max. 14 Tage Gültigkeit).
- **Light & Dark Mode:** Vollständige Unterstützung für ein helles und augenschonendes dunkles Farbschema:
  - **Systemstandard:** Verwendet standardmäßig die Farbschema-Einstellungen des Betriebssystems (`prefers-color-scheme`).
  - **Umschaltbar:** Schnell-Umschalter in der Kopfzeile und auf der Anmeldeseite sowie feste Auswahlmöglichkeit im Benutzerprofil.
  - **Chart-Anpassung:** Verlaufsdiagramme und Tooltips passen ihre Farbpalette dynamisch an das aktive Farbschema an.
- **🌐 Mehrsprachigkeit (Deutsch & Englisch):**
  - **Umschaltbar & Persistiert:** Direkter 1-Klick-Schnellumschalter (`🌐 DE` / `🌐 EN`) in der Kopfzeile und im Anmeldebereich sowie dauerhafte Sprachauswahl im Benutzerprofil (`#/profile`).
  - **Nahtlose Lokalisierung:** Vollständige Lokalisierung aller Ansichten (Login/Registrierung, Beckenübersicht, Detailansicht, Messmaske, Logbuch, CSV-Import/Export, Artenkatalog, KI-Chat, Admin-Bereich und Rechtsseiten) inklusive sprachspezifischer Datums- und Zahlenformatierung (`Intl.DateTimeFormat` / `Intl.NumberFormat`).
- **E-Mail-Verifizierung & Passwort-Reset:**
  - **E-Mail-Verifizierung für neue Benutzer:** Neue Registrierungen (außer der Admin-E-Mail-Adresse) erhalten automatisch eine Bestätigungs-E-Mail mit Aktivierungslink. Nicht verifizierte Benutzer werden beim Login geschützt und können sich neue Bestätigungslinks anfordern.
  - **Passwort vergessen & Reset per E-Mail:** Über die Anmeldeseite kann ein zeitlich begrenzter Link zum sicheren Zurücksetzen des Passworts angefordert werden. Beim Zurücksetzen werden alle bestehenden Benutzersitzungen automatisch invalidiert.
- Benutzerprofil zur Pflege von Profilbild (Avatar), Vorname, Nachname, Benutzername und „Über mich“-Bio sowie Passwortverwaltung, Erscheinungsbild und OIDC-Verknüpfung
- Admin-Bereich mit Benutzerverwaltung für Administratoren (festgelegt anhand der E-Mail-Adresse in der Konfiguration) sowie integriertem System-Logbuch & Fehlerprotokoll
- **Aquarien-Verwaltung mit Motto, Beschreibung & Pflegezyklen:**
  - Aquarien flexibel anlegen und pflegen mit Name, individuellem Motto / Leitspruch, ausführlicher Beschreibung (Scape, Bepflanzung, Philosophie, Technik), Süß- oder Meerwasser, Volumen und Notizen.
  - **Unabhängige Mess- und Düngzyklen:**
    - **🧪 Messzyklus:** Intervall flexibel in Tagen oder Wochen (z. B. alle 3 Tage, wöchentlich, alle 2 Wochen) mit optionalem festen Wochentag (z. B. samstags).
    - **🌿 Düngzyklus:** Unabhängig konfigurierbarer Zyklus in Tagen oder Wochen mit Wochentagsfestlegung für Pflanzendünger.
    - **📧 Optionale Erinnerungs-E-Mails:** Automatische Benachrichtigung per E-Mail (`measure-reminder.tpl` / `fertilize-reminder.tpl`) mit direktem Aktionslink, sobald eine Messung oder Düngung fällig oder überfällig wird.
    - **Status-Tracking:** Übersichtliche Statusanzeigen im Aquarium („Fällig heute“, „Überfällig seit X Tagen“) und Fälligkeits-Badges in der Beckenübersicht.
- **Mehrere Bilder pro Aquarium & Fotogalerie:** Beliebig viele Bilder pro Becken hochladen (PNG, JPG, WebP, GIF bis 5 MB), Bildunterschriften vergeben, Titelbild auswählen und alle Fotos in einer interaktiven Galerie mit Lightbox-Großansicht betrachten
- **Bewohner benennen & Einzelfotos hochladen:** Aquarienbewohner mit individuellen Namen / Bezeichnungen (z. B. Kampffisch „Bubbles“, Pärchen, Gruppen) versehen und eigene Porträtfotos für jeden Bewohner hochladen und ansehen
- **Aquarium-Logbuch & Aktivitäten-Timeline:** Lückenloses, chronologisches Protokoll über alle Arbeiten und Ereignisse am Aquarium:
  - **Wasserwechsel:** Erfassung mit prozentualer Angabe (z. B. 30 %, 50 %) und Details zur Wasseraufbereitung.
  - **Filterpflege:** Filterwechsel (mit Angabe der getauschten Medien wie Filtervlies, Aktivkohle, Schwämme) und Filterreinigung.
  - **Pflanzen & Gärtnern:** Dokumentation von Pflanzenschnitten/Rückschnitt sowie neu eingesetzten Pflanzenarten.
  - **Pflege & Düngung:** Erfassung von Scheibenreinigung, Bodengrundpflege, Düngedosierungen und Spezialfütterungen.
  - **Kombinierte Timeline:** Anzeige aller Pflegemaßnahmen und Wassermessungen in einer gefilterten Übersicht (Alle, Wasserwechsel, Pflege & Filter, Pflanzen, Messungen).
- **Aquarien-Übersicht mit 2 Tabs & Einladungs-Workflow:**
  - **🐠 Eigene Aquarien:** Zeigt übersichtlich alle selbst erstellten Aquarien inklusive Wasserwerten, Alarmanzeigen und Fotos.
  - **👥 Mit mir geteilte Aquarien:** Listet alle Becken auf, die von anderen Aquarianern freigegeben und angenommen wurden.
  - **✉️ Einladungs-Mail & Annahme-Pflicht:** Beim Teilen eines Aquariums wird eine ansprechende Einladungs-E-Mail (`share-aquarium.tpl`) mit Bestätigungslink an den Benutzer versendet. Erst nach Annahme der Einladung (über den E-Mail-Link oder direkt im Tab „Mit mir geteilte Aquarien“) wird das Aquarium für den Benutzer sichtbar und zugänglich.
- Aquarien mit anderen registrierten Benutzern teilen mit flexiblen Berechtigungen:
  - **Lesen (view):** Wasserwerte, Verlaufsgraphen, Besatz, Logbuch und Alarme einsehen.
  - **Schreiben (write):** Messwerte und Pflegeaktivitäten erfassen/bearbeiten/löschen, Besatz verwalten, Alarme bestätigen und Bilder bearbeiten.
- Besatz pro Becken eintragen. Die Fischarten bestimmen die optimalen Grenzwerte
  (Weichwasser, Hartwasser, Garnelen und Wirbellose).
- **Artenkatalog & Besatzprüfung:** Umfassende Datenbank aller gängigen Aquarienbewohner in Deutschland (Salmler, Lebendgebärende, Labyrinthfische/Kampffische, Buntbarsche, Welse, Bärblinge, Garnelen, Schnecken, Meerwasser) mit Wasserwerten, Mindestbeckenvolumen, Sozialverhalten und Territorialregeln.
- **Verhaltens- & Territorialitäts-Prüfung:** Automatische Erkennung von Vergesellschaftungs- und Verhaltenskonflikten (z. B. Einzelhaltung bei Siamesischen Kampffischen, Flossenbeißer vs. Langflosser, Räuber vs. Zwerggarnelen, Krebse vs. Bodenfische, Mindestgruppengrößen bei Schwarmfischen und Temperatur-/pH-Inkompatibilitäten).
- **🤖 Persönlicher KI-Chat-Assistent für Aquarien (Multi-Provider: OpenAI, Google Gemini, Anthropic Claude):**
  - **Umfassender automatischer Beckenkontext:** Bei jeder Chat-Anfrage wird ein präziser System-Prompt injiziert mit Beckenabmessungen, Volumen, Beckentyp, Filtertechnik, Bodengrund, vollständigem Tier- und Pflanzenbesatz (samt Verhaltens- und Artanforderungen) sowie den letzten 10 Wassertests (inklusive Messdatum, Grenzwert-Einstufungen `ok`/`warn`/`crit` und Trendanalyse).
  - **Persistenter Chat-Verlauf & Intelligente Kontext-Komprimierung:** Sämtliche Gespräche werden pro Aquarium dauerhaft in der Datenbank (SQLite & MongoDB) gespeichert und beim Öffnen wiederhergestellt. Ältere Gesprächsrunden werden für den KI-Kontext automatisch intelligent komprimiert und zusammengefasst, sodass die KI über frühere Diagnosen und Ratschläge genau Bescheid weiß, ohne das Token-Budget zu überlasten.
  - **Multi-Provider & Bring Your Own Key (BYOK):** Volle Unterstützung für **OpenAI (ChatGPT)**, **Google Gemini** und **Anthropic Claude**. Jeder Benutzer kann im eigenen Profil persönliche API-Schlüssel hinterlegen, den bevorzugten Provider wählen und verfügbare Modelle dynamisch beim Anbieter abfragen lassen (inklusive Freitext-Eingabe für individuelle Modelle).
  - **Dynamische Modellabfrage:** Beim Eingeben eines API-Keys werden die für den Account freigeschalteten Modelle (z. B. GPT-6, GPT-6-mini, GPT-4o, Gemini 2.5 Flash/Pro, Claude 3.7 Sonnet, Claude 3.5 Haiku) in Echtzeit über die Provider-API abgefragt und im Dropdown zur Auswahl bereitgestellt.
  - **Responsive Chatansicht:** Auf Mobilgeräten füllt der KI-Chat den Bildschirm und die verfügbare Breite. Nachrichten scrollen unabhängig von der Eingabe; die sichtbare Fensterhöhe wird bei Größenänderungen der Bildschirmtastatur berücksichtigt. Auf dem Desktop bleibt der Chat ein zentriertes Modal.
  - **Schwebender Aktionsbutton (FAB):** Direkter Zugriff auf den Chat über einen dezenten Floating Action Button in der Detailansicht des Aquariums – wird dynamisch nur angezeigt, wenn für das Benutzerkonto ein gültiger KI-Schlüssel hinterlegt ist.
  - **Live-Verbindungstest & Schnellstart-Fragen:** Integrierte Schlüssel-Validierung direkt im Profil sowie thematische Schnellfragen im Chat (*„Bewerte meine Wasserwerte“*, *„Passen neue Fische dazu?“*, *„Tipps gegen Algen“*).
  - **Datensparsamkeit & Sicherheit:** Keine Datenweitergabe an KI-Dienste ohne aktive Chatauslösung; API-Schlüssel werden sicher in der Datenbank gespeichert, im UI maskiert und können jederzeit vom Benutzer gelöscht werden.
- Messmaske für 15 Parameter mit Timer pro Test (mehrere gleichzeitig, Ton und Vibration bei Ablauf,
  Bildschirm bleibt während der Timer an, wenn der Browser das erlaubt)
- **PWA & Installation auf dem Home-Bildschirm:**
  - **Optimiert für Mobilgeräte (iOS & Android):** Vollständige Unterstützung für Homescreen-Shortcuts und Web-App-Installation mit gestochen scharfem App-Icon (lila Fisch mit Blasen auf tiefviolettem Hintergrund).
- **Push-Benachrichtigungen für Timer:** Automatische System- und Push-Benachrichtigungen bei Ablauf der Reaktionszeiten:
  - **Präzises Timing:** Verhindert das Überziehen von Reaktionszeiten und schützt vor Fehlinterpretationen bei Farbvergleichstests.
  - **Status & Testen:** Aktivierungsbanner in der Messmaske sowie Konfigurationskarte und 3-Sekunden-Test-Benachrichtigung im Benutzerprofil.
- **CSV & Excel Export & Import mit Spaltenzuordnung:**
  - **📤 Exportieren (CSV / Excel):** Messwerte für beliebige Zeiträume (oder den gesamten Verlauf) als CSV mit UTF-8-BOM und Semikolon (für Microsoft Excel) oder Komma (Standard-CSV) herunterladen.
  - **📥 Importieren mit interaktiver Spaltenmaske (CSV):** CSV-Dateien per Drag & Drop oder Dateiauswahl hochladen. Die Kopfzeile und Beispielwerte werden automatisch eingelesen.
  - **Intelligente Spaltenzuordnung:** Erkennt automatisch Datum, Uhrzeit, Notiz sowie Wasserparameter (pH, KH, GH, NO2, NO3, PO4, Fe, K, Mg, Ca, Temperatur, Salinität etc.) und ordnet diese vor.
  - **Flexible Datenkonvertierung:** Unterstützt deutsche Datumsformate (`TT.MM.JJJJ`), ISO-Standards, separate Datums-/Uhrzeitspalten und Zahlen mit Komma oder Punkt als Dezimaltrenner.
  - **Integrierte Grenzwertprüfung:** Bei importierten Werten werden Alarme und Warnungen automatisch anhand der Becken-Grenzwerte generiert.
- Live-Bewertung beim Tippen, Eingabe mit Komma möglich
- **Flexible Verlaufsgraphen mit Zeitraumauswahl:**
  - **Standard-Zeitraum 3 Monate (90 Tage):** Beim Öffnen eines Aquariums wird standardmäßig der Verlauf der letzten 3 Monate dargestellt.
  - **Schnellfilter:** Umschaltbar zwischen 7 Tage, 14 Tage, 30 Tage, 3 Monate (Standard), 6 Monate, 1 Jahr und Alles.
  - **Benutzerdefinierter Zeitraum:** Freie Auswahl von Start- und Enddatum per Datumswähler.
  - **Persönliche Voreinstellung:** Im Benutzerprofil kann der gewünschte Standard-Zeitraum für das eigene Konto dauerhaft festgelegt werden.
- **Rechtliche Konformität & Footer (EU AI Act, DDG, DSGVO, Lizenzen & Kontakt):**
  - **Footer auf allen Seiten:** Fester, responsiver Footer mit Schnelllinks zu Impressum, Datenschutz, Lizenzen und Kontakt – erreichbar im angemeldeten und nicht angemeldeten Zustand.
  - **🤖 EU AI Act Transparenz (Art. 50 Verordnung (EU) 2024/1689):** Vollständige Offenlegung der KI-gestützten Softwareerstellung (JetBrains Junie) inklusive Hinweisen zu den Grenzen automatisierter Richtwert- und Berechnungsfunktionen sowie des KI-Aquarium-Assistenten.
  - **⚖️ Impressum (§ 5 DDG & § 18 MStV):** Gesetzeskonforme Anbieterkennzeichnung mit Betreiberangaben, Kontakt-E-Mail und Hinweisen zur EU-Online-Streitbeilegung.
  - **🔒 Datenschutzerklärung (DSGVO / GDPR):** Transparente Erläuterung aller Datenverarbeitungsprozesse (Konto, Aquariendaten, Session-Cookies, SMTP-Mails, Server-Logs, optionale KI-Chat-Dienste via OpenAI, Google Gemini und Anthropic Claude), datensparsames lokales Hosting ohne Drittanbieter-Tracker und Dokumentation der Betroffenenrechte (inkl. CSV-Datenexport und 2-Stufen-Kontolöschung).
  - **📜 Modul-Copyright & Open-Source-Lizenzen:** Lückenlose Auflistung aller verwendeten Open-Source-Module (`express`, `better-sqlite3`, `mongodb`, `chart.js`, Node.js Built-ins) mit Autoren, Versionen und vollständigen Lizenztexten (MIT, Apache 2.0, CC BY-NC-SA 4.0).
  - **✉️ Kontakt & Support:** Direkte Kontaktmöglichkeiten für technischen Support, Administrator-Anfragen und Datenschutzanliegen.
- Warnungen (auffällig) und Alarme (kritisch) mit Handlungshinweis, zum Abhaken
- Erinnerung, wenn die letzte Messung länger her ist als eingestellt

## Technische Features

- **Technischer Aufbau:** Express mit TypeScript im Backend, Node.js (ab Version 22.12) oder Bun (ab Version 1.4.3), Express sowie wahlweise **SQLite** (lokal/leichtgewichtig) oder **MongoDB** (produktiv/skalierbar).
- **TypeScript-Backend:** Die Quellen liegen in `server.ts`, `config.ts`, `oidc.ts` und `src/**/*.ts`. `tsconfig.backend.json` erzeugt CommonJS-JavaScript für Node und Bun. Kataloge und Mailvorlagen werden in den Backend-Build kopiert; `data/` und `public/` bleiben im Projektstamm. `server.js`, `config.js` und `oidc.js` sind kleine Einstiegspunkte für bestehende Aufrufe.
- **Vue 3, Vite und TypeScript:** Das gesamte Frontend liegt unter `public/frontend/`. Vue-Komponenten verwalten alle Ansichten, Formulare, Dialoge und Timer. Die vorhandenen CSS-Regeln, Icons, Übersetzungen und API-Verträge bleiben die Grundlage. Anwendungscode und Worker sind in TypeScript geschrieben; alte JavaScript-Ansichten und Kompatibilitätslayer entfallen.
- **Flexibles Dual-Datenbanksystem:**
  - **SQLite (Standard lokal):** Dateibasierte, performante Zero-Setup-Datenbank (`data/aquarium.db`) mit WAL-Modus und `busy_timeout` für nebenläufige Zugriffe.
  - **MongoDB (Produktiv):** Volle Unterstützung für MongoDB-Cluster/Container via `DB_TYPE=mongodb` und `MONGODB_URI`.
- **Multithreading & Multi-Core Clustering:**
  - **Frontend Web-Worker-Multithreading:** Dedizierter Web-Worker (`public/frontend/worker.ts` / `dist/worker.min.js`) für rechenintensive clientseitige Operationen (CSV-Parsing & Trennzeichenerkennung großer Importdateien, Artenkatalog-Volltextsuche mit Trefferbewertung, statistische Zeitreihenberechnung sowie asynchrone Bildskalierung & -kompression via `OffscreenCanvas`), um den UI-Thread vollkommen flüssig (60/120 fps) und ruckelfrei zu halten.
  - **Nicht-blockierende Kryptografie (Backend):** Passwort-Hashing und Verifizierung (Scrypt) werden asynchron über den Threadpool abgewickelt, sodass gleichzeitige Anmeldungen den Event-Loop nicht blockieren.
  - **Backend Worker-Thread-Pool:** Dedizierter Worker-Pool für rechenintensive Hintergrund- und Inspektionsaufgaben.
  - **Multi-Worker Clusterbetrieb:** Über `WORKERS=auto` (oder feste Anzahl) verteilt der Supervisor eingehende Anfragen auf mehrere Worker-Prozesse über alle CPU-Kerne hinweg.
  - **Zustandsloses OIDC:** OIDC-Zustände werden kryptografisch signiert und funktionieren prozess- und instanzübergreifend.
- **Überwachungsprozess & Ausfallsicherheit (Supervisor):** Ein übergeordneter Watchdog-Prozess überwacht die Anwendung, fängt ungeplante Abstürze oder Ausnahmen automatisch ab und startet den Worker-Prozess verzögerungsfrei neu
- **Strukturiertes Fehler- und Ereignis-Logging:** Alle Serverfehler, Uncaught Exceptions, Stderr-Meldungen und Supervisor-Ereignisse werden mit Zeitstempel und Log-Level in eine `.log`-Datei (`data/aquarium.log`) protokolliert
- **Technische Umsetzung der Mehrsprachigkeit:**
  - **Standardisiertes JSON-Format:** Vollständig modulare Sprachdateien unter `public/locales/de.json` und `public/locales/en.json` mit strukturierter Verschachtelung und Token-Interpolation (`{count}`, `{name}`, `{days}` etc.).
  - **Vollständig im Dist-Bundle integriert:** Automatische Bündelung und Minifizierung im Vite-Build für minimale Ladezeiten und sofortige Verfügbarkeit ohne zusätzliche Netzwerk-Roundtrips.
- **SMTP-Versand, E-Mail-Vorlagen & Warteschlange:**
  - **Modulare HTML-E-Mail-Templates (.tpl-Dateien):** Jede E-Mail besitzt eine eigene, frei anpassbare `.tpl`-Datei mit HTML-Code und dynamischen Tokens (z. B. `{{username}}`, `{{verifyUrl}}`, `{{resetUrl}}`, `{{expiresHours}}` etc.) unter `src/templates/mail/` (bzw. für eigene Vorlagen unter `data/mail-templates/`).
  - **Rate-Limited Mail-Warteschlange (Queue):** E-Mails werden über eine FIFO-Warteschlange mit konfigurierbarer Verzögerung versendet, um SMTP-Server nicht zu überlasten und Spam-Filter-Trigger zu vermeiden.
  - **SMTP-Konfiguration im Admin-Bereich:** Konfigurierbar über die Admin-Oberfläche (`#/admin`) oder via Umgebungsvariablen (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) inklusive Versand von Test-E-Mails und Einsicht in den Warteschlangen-Status.
- **Service Worker für Timer-Benachrichtigungen:**
  - **Hintergrund-Timer:** Service Worker stellt sicher, dass Alarme auch dann pünktlich ankommen, wenn der Tab minimiert ist oder im Hintergrund liegt.
- **App-Icons & Favicons:**
  - **iOS Apple Touch Icon:** 180×180 px Vollflächen-Icon ohne transparente Ecken für nahtloses, kantenfreies Rendern der Apple-typischen Squircle-Maske.
  - **Android Adaptive & Maskable Icons:** Bereitstellung von 192×192 px und 512×512 px Icons im Standard- (`any`) sowie im adaptiven Maskable-Format (`maskable`), bei dem das Motiv sicher innerhalb der 80%-Safe-Zone liegt und von Android-Launchern (z. B. Kreis, Tropfen, Squircle) ohne abgeschnittene Ränder maskiert wird.
  - **Multi-Resolution Favicons:** Favicons in 16×16, 32×32 sowie Standard `favicon.ico` für Browser-Tabs und Lesezeichen.

## Automatische App-Version und Docker-Tags

Das Format ist **`MAJOR.MINOR.REVISION[-PATCH]-ALPHA`**; `ALPHA` ist immer enthalten. Die Version steht rechts im Footer. Ausgangspunkt ist `0.0.0-ALPHA`, festgelegt in `version.json` mit einem Git-Basiscommit.

- Jeder Commit mit `feat:` oder `feat(bereich):` erhöht die **Revision** und setzt den Patch auf 0 zurück.
- Jeder Commit mit `fix:` oder `fix(bereich):` erhöht den **Patch**. Patch 0 wird nicht angezeigt: `1.0.3-ALPHA` → Fix → `1.0.3-1-ALPHA` → Feature → `1.0.4-ALPHA`.
- Andere Commit-Typen ändern die Nummer nicht. Merge-Commits werden nicht doppelt gezählt. Auch `feat!:` und `fix!:` erhöhen ausschließlich Revision bzw. Patch; Major und Minor bleiben manuell.
- **Major/Minor manuell:** `npm run version:major` bzw. `npm run version:minor` (mit Bun: `bun run version:major:bun` / `bun run version:minor:bun`). Diese Befehle setzen Revision/Patch zurück und speichern einen neuen Basiscommit. Danach die geänderten Versionsdateien beispielsweise mit `chore: manuelle Minor-Version erhöhen` committen. Ein Major-Sprung setzt zusätzlich Minor auf 0.
- `node scripts/version.js` bzw. `bun run version:current:bun` zeigt die berechnete Version. Lokale Builds und Vite berechnen sie automatisch aus der vollständigen Git-Historie. Ein Commit erhöht die Nummer erst beim nächsten Build/Neustart des Vite-Servers; bloße Dateiänderungen tun das nicht.
- Die Docker-Pipeline berechnet die Nummer einmal und verwendet denselben Wert für Footer, Backup-Metadaten, OCI-Label und den vollständigen Image-Tag, etwa `ghcr.io/drganmon/aquarium-logbuch:1.0.4-2-ALPHA`. Die Versions-Tags werden auf dem Default-Branch und bei passenden `v…`-Release-Tags veröffentlicht; `latest`, Branch- und SHA-Tags bleiben verfügbar. Pull Requests veröffentlichen keine Images.
- **Compose fest auf eine Version setzen:** `AQUARIUM_VERSION=1.0.4-2-ALPHA docker compose up -d`; alternativ `AQUARIUM_VERSION` in `.env` setzen. Ohne Angabe wird weiterhin `latest` verwendet.
- **Lokales Docker-Image:** `APP_VERSION=$(node scripts/version.js)` und danach `docker build --build-arg APP_VERSION="$APP_VERSION" -t "aquarium-logbuch:$APP_VERSION" .`. Ohne Git-Historie und ohne explizites `APP_VERSION` wird nur der in `version.json` hinterlegte Ausgangswert verwendet. Eine unvollständige Historie in einem Git-Checkout verursacht einen Fehler statt einer falschen Versionsnummer.

## Starten

### 1. Lokale Entwicklung (SQLite)

```bash
npm ci               # Abhängigkeiten installieren (Node >= 22.12)
npm run build        # Kompiliert das Backend und bündelt das Frontend für Entwicklung
npm run dist         # Kompiliert das Backend und minifiziert das Frontend für Produktion
npm test             # führt alle automatisierten Tests aus (SQLite & MongoDB)
npm start            # startet die App (Standard: SQLite unter http://localhost:3000)
```

- **Entwicklung:** Nach `npm run build` startet `npm start` die Express-API (Port 3000); `npm run dev` startet in einem zweiten Terminal Vite mit Hot Reload unter http://127.0.0.1:5173. `/api`, `/auth` und `/sw.js` werden an Express weitergeleitet. Für eine andere Backend-Adresse kann `VITE_BACKEND_URL` gesetzt werden. OIDC verwendet die konfigurierte Backend-Adresse `APP_URL`.
- **Prüfung:** `npm run typecheck` prüft Frontend und Backend. `npm run typecheck:backend` prüft nur das Backend. Der Backend-Compiler verwendet `strict` und verhindert Builds mit Typfehlern; dynamische Datenbankzeilen, externe JSON-Daten und bestehende Fehlerobjekte behalten an den jeweiligen Grenzen teilweise flexible Typen. Repository-Methoden und Express-Anfragen besitzen geprüfte Typverträge. `npm test` führt die automatisierten Tests mit kompakter Zusammenfassung aus. Eine Fortschrittsanzeige zeigt die aktuelle Testdatei von insgesamt ausgewählten Dateien und den Namen des laufenden Tests; im Terminal wird dieselbe Zeile aktualisiert, in umgeleiteten Ausgaben stehen die Fortschritte zeilenweise. Bei Fehlern werden Fehlerdetails und die letzten Testausgaben angezeigt. `npm test -- --info` zeigt zusätzlich alle Testergebnisse und vollständige Logs. Einzelne Testdateien lassen sich etwa mit `npm test -- test/auth.test.js` ausführen; `--info` kann damit kombiniert werden. Die Integrationstests benötigen lokale HTTP-Ports und für MongoDB eine MongoDB-Testbinary (beim ersten Lauf gegebenenfalls ein Download).
- **Build:** `npm run build` und `npm run dist` kompilieren zuerst das TypeScript-Backend nach `dist/backend/` und erzeugen danach das Entwicklungs- bzw. Produktions-Bundle unter `public/dist/`. Beide führen vorher die Typprüfung aus. `npm run build:backend` baut nur das Backend; nach Backend-Änderungen neu bauen und den Server neu starten. `npm test` baut das Backend vor den Tests automatisch neu. Chart.js wird als Modul gebündelt. Vite baut den Rechen-Worker; der TypeScript-Service-Worker wird als `dist/sw.js` erzeugt und über `/sw.js` ausgeliefert.
- **Betrieb:** Express wählt die gebauten Produktions- oder Entwicklungsdateien und unterstützt `APP_URL` mit Unterpfad. Der stabile Einstiegspunkt `server.js` lädt das kompilierte `server.ts`. Ohne Backend-Build erscheint ein Einrichtungshinweis beim Start; fehlt nur das Frontend, antwortet dessen Seite mit HTTP 503. Im Betrieb werden weder der TypeScript-Compiler noch Entwicklungsabhängigkeiten benötigt. `npm run build:watch` / `npm run dist:watch` beobachten Frontendänderungen; das Backend wird beim Start dieser Befehle einmal kompiliert. Docker erstellt weiterhin den Produktions-Build beim Image-Bau.

### Bun: Installation, Build, Tests und Start

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
- `bun.lock` fixiert die Bun-Abhängigkeiten; `package-lock.json` bleibt für Node/npm erhalten. Installationsskripte von Abhängigkeiten bleiben deaktiviert (`trustedDependencies: []`, `--ignore-scripts`). SQLite nutzt weiterhin `better-sqlite3` 13 mit mitgelieferten Node-API-Binaries.
- Der Supervisor nutzt `node:cluster`, damit mehrere Worker denselben HTTP-Port unter Node und Bun bedienen können. Datenbankmigrationen werden vor dem Start der Worker abgeschlossen. Mehrprozess-Betrieb ist unter Linux geprüft.
- Der Standard-`Dockerfile` verwendet Bun 1.4.3 für Build und Betrieb, mit unprivilegiertem Benutzer `bun`. Ein Node-Image kann weiter mit `docker build -f Dockerfile.node -t aquarium-logbuch:node .` gebaut werden. Bestehende Compose-Konfigurationen bleiben verwendbar.
- CI prüft beide Runtimes inklusive Produktionsbuild und vollständiger Testsuite, bevor das Container-Image veröffentlicht wird.

### 2. Betrieb mit MongoDB (Docker Compose)

Beide Compose-Dateien verwenden das [offizielle Container-Image](https://github.com/DrGanmon/aquarium-logbuch/pkgs/container/aquarium-logbuch) `ghcr.io/drganmon/aquarium-logbuch:latest`. Ein lokaler Build ist nicht erforderlich. Passe vor dem Start die Umgebungsvariablen in der jeweiligen Compose-Datei an (insbesondere `APP_URL`, `ADMIN_EMAIL` und das MongoDB-Passwort). Eine Vorlage für alle verfügbaren Umgebungsvariablen befindet sich in `example.env`.

```bash
# Images herunterladen und App samt MongoDB-Container starten
docker compose pull
docker compose up -d
```

Für den Betrieb mit SQLite ohne MongoDB:

```bash
docker compose -f docker-compose.sqlite.yml pull
docker compose -f docker-compose.sqlite.yml up -d
```

Für Updates dieselben `pull`- und `up -d`-Befehle erneut ausführen. Die Daten bleiben in den benannten Volumes erhalten.

Der GitHub-Workflow baut das App-Image für `linux/amd64` und `linux/arm64` und veröffentlicht beide Architekturen unter denselben Tags. Docker wählt beim Pull automatisch die passende Architektur aus, etwa ARM64 auf einem Raspberry Pi mit 64-Bit-Betriebssystem. Pull Requests bauen beide Varianten zur Prüfung, ohne sie zu veröffentlichen.

### 3. Konfigurationsvariablen

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
| `OIDC_SCOPES` | `openid profile email` | Angeforderte Scopes |
| `OIDC_PROVIDER_NAME` | `Pocket ID` | Beschriftung des Anmelde-Buttons |
| `LOCAL_LOGIN` | automatisch | Lokale Anmeldung mit Passwort. Standard: aus, wenn OIDC aktiv ist, sonst an |
| `OIDC_LINK_BY_USERNAME` | false | `true` verknüpft beim ersten OIDC-Login ein vorhandenes lokales Konto mit gleichem Benutzernamen |
| `ADMIN_EMAIL` | (leer) | E-Mail-Adresse des Administrators (oder mehrere durch Komma getrennt) für den Admin-Bereich / Benutzerverwaltung |
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

## Benutzerprofil und Kontoverwaltung

Jeder angemeldete Benutzer kann über die Kopfzeile auf sein **Benutzerprofil** (`#/profile`) zugreifen:
- **Profilbild (Avatar):** Hochladen (JPG, PNG, WebP, GIF bis 5 MB) oder Löschen des eigenen Profilbilds.
- **Persönliche Angaben:** Pflege von Vorname, Nachname, Benutzername, „Über mich“-Bio und E-Mail-Adresse.
- **Standard-Zeitraum für Graphen:** Festlegung des bevorzugten Zeitraums (z. B. 3 Monate, 6 Monate, 1 Jahr) für die Verlaufsgraphen.
- **🤖 KI-Assistent & Sprachmodelle:**
  - Auswahl des bevorzugten Anbieters (**OpenAI / ChatGPT**, **Google Gemini**, **Anthropic Claude**).
  - Sichere Hinterlegung und Maskierung persönlicher API-Keys.
  - Dynamische Modellauswahl direkt vom Anbieter (mit Echtzeit-Abfrage bei Key-Eingabe sowie benutzerdefinierter Freitexteingabe).
  - Integrierter Live-Verbindungstest und vollständiges Löschen gespeicherter Schlüssel mit einem Klick.
- **Passwortverwaltung:** Ändern des aktuellen Passworts (bei lokaler Anmeldung).
- **OIDC-Verknüpfung:** Direktes Verknüpfen oder Entkoppeln des Kontos mit Pocket ID / OpenID Connect.
- **Freunde einladen (bei aktivem Einladungsmodus):** Registrierungscodes (bis maximal 7 Tage bzw. konfigurierte Gültigkeit) und E-Mail-Einladungen (bis maximal 14 Tage Gültigkeit) erstellen, den Status einsehen und Einladungslinks direkt teilen.
- **Konto löschen (Zweistufige Bestätigung):**
  - **1. Schritt (In der Anwendung):** Bestätigung im Profilbereich (bei lokaler Anmeldung inklusive Passworteingabe) zur Auslösung der Löschanforderung.
  - **2. Schritt (Per E-Mail):** Aus Sicherheitsgründen wird eine Bestätigungs-E-Mail mit einem zeitlich begrenzten Bestätigungslink versendet. Erst durch Klick auf diesen Link wird die Löschung endgültig vollzogen.
  - **Kaskadierende Datenbereinigung:** Bei der Bestätigung werden das Benutzerkonto, alle eigenen Aquarien samt Fotos (auf dem Server und in der Datenbank), Bewohner, Besatzbilder, Messwerte, Alarme, Pflegemaßnahmen, Freigaben und aktive Sitzungen restlos und konsistent entfernt. Der Administrator-Account ist vor versehentlicher Profil-Löschung geschützt.

## Admin-Bereich und Benutzerverwaltung

Die Admin-Ansicht ist in fünf Tabs gegliedert: **Userverwaltung**, **Einladung & Registrierung** (Registrierungsmodi, Gültigkeiten, Einladungscodes und E-Mail-Einladungen), **Einstellungen** (Rechtliches sowie E-Mail/SMTP inklusive Testmail und Warteschlange), **Backups** und **Logs**.

Der Administrator wird anhand der E-Mail-Adresse festgelegt. Dazu entweder in `config.ts` oder über die Umgebungsvariable `ADMIN_EMAIL` die gewünschte E-Mail-Adresse hinterlegen (z. B. `ADMIN_EMAIL=admin@example.com` bzw. kommagetrennt für mehrere).

- Benutzer, deren E-Mail-Adresse (aus OIDC/Pocket ID oder lokaler Registrierung) mit `ADMIN_EMAIL` übereinstimmt, erhalten Administrator-Rechte.
- Im Header erscheint der Button **Admin** (`#/admin`).
- Administratoren können alle registrierten Benutzer einsehen, neue Benutzer anlegen, bestehende Benutzer bearbeiten (Benutzername, E-Mail, Passwort ändern) und Benutzer samt deren Daten löschen.
- **Registrierungs-Modi & Einladungs-Verwaltung:**
  - Umschalten zwischen den 4 Modi: **Offen**, **Einladung (Admin)**, **Einladung (Offen)** und **Geschlossen**.
  - Konfiguration der maximalen Gültigkeit für Benutzer-Einladungscodes (Standard: 7 Tage).
  - Erstellung von Admin-Einladungscodes mit individueller Verwendungsanzahl (z. B. unbegrenzt oder einmalig) sowie E-Mail-Einladungen.
  - Übersicht aller aktiven, eingelösten und abgelaufenen Einladungen inklusive Widerruf- / Löschfunktion.
- **E-Mail- & SMTP-Server-Konfiguration:**
  - Konfiguration des SMTP-Ausgangsservers für E-Mail-Verifizierungen, Passwort-Reset und Benachrichtigungen.
  - Warteschlangen-Statusanzeige und Live-Testmail-Versand.
- **Rechtliches & Kontakt-E-Mails (Impressum & Support):**
  - Eigene E-Mail-Adressen für Support-/Datenschutz-Anfragen (`CONTACT_EMAIL`) und das Impressum (`IMPRINT_EMAIL` gem. § 5 DDG) direkt über die Weboberfläche oder per Umgebungsvariablen festlegen.
- **Backup & Restore (Datensicherung & Wiederherstellung):**
  - **Manuelle Backups:** Vollständige Sicherung der gesamten Datenbank (Benutzer, Aquarien, Messwerte, Alarme, Logbuch) inklusive aller hochgeladenen Fotos als komprimierte Datei (`.json.gz`).
  - **Wiederherstellung (Restore):** Einspielen von Sicherungsdateien über die Weboberfläche oder aus der lokalen Backup-Liste.
  - **Abwärtskompatibilität & Migration:** Backups älterer Versionen (z. B. v1 ohne neue Tabellen/Felder oder mit separater Messwerttabelle) werden beim Einspielen automatisch auf das aktuelle Datenbankschema migriert und normalisiert.
  - **Automatische lokale Sicherungen:** Im Admin-Bereich konfigurierbar (Aktivieren/Deaktivieren, Intervall in Stunden z. B. alle 6h, 12h, 24h, Vorhalteanzahl/Retention z. B. max. 10 Backups und automatisches Pruning alter Dateien).
  - **Sicherheit & Zugriffsschutz:** Alle Backup- und Restore-Funktionen sind strikt auf Administratoren beschränkt.
- **System-Logbuch:** Live-Einsicht und Bereinigung der Server- und Fehlerprotokolle (`data/aquarium.log`).

## Anmeldung mit Pocket ID (OIDC)

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
- **Per Benutzername:** Mit `OIDC_LINK_BY_USERNAME=true` wird ein vorhandenes Konto beim ersten Pocket-ID-Login übernommen, wenn der Pocket-ID-Benutzername übereinstimmt (nur aktivieren, wenn Benutzer sich in Pocket ID keine beliebigen Namen vergeben können).

**App unter einem Unterpfad:** `APP_URL` darf einen Pfad enthalten (z. B. `https://example.com/aquarium`).
Der Reverse Proxy muss diesen Präfix dann entfernen, bevor er an die App weiterleitet
(Caddy: `handle_path /aquarium/* { reverse_proxy localhost:3000 }`).

## Wassertests und Testsuiten (JSON-konfigurierbar)

Die Wassertests sind modular als **JSON-Dateien** unter `src/config/suites/` (bzw. für eigene Erweiterungen unter `data/suites/`) abgelegt:
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

Die Reichweite bleibt anpassbar, etwa für eine andere Packungsgröße oder den individuellen Tropfenverbrauch. Im Profil können die pH- und Magnesium-Variante sowie CO₂ Direct oder berechnetes CO₂ ausgewählt werden. Ab **75 % Verbrauch** wird einmal pro Nachfüllung eine E-Mail mit Testname und Restmenge eingereiht, sofern die Erinnerung aktiviert ist, die E-Mail-Adresse verifiziert wurde und SMTP eingerichtet ist. Die Grenze wird auf ganze Tests aufgerundet: bei 50 Tests ab Test 38, bei 25 ab Test 19. Nach dem Einrichten von SMTP prüft der Erinnerungs-Scheduler bisher offene Erinnerungen ebenfalls (alle 30 Minuten). Vorlagen: `test-refill-reminder.tpl` und `test-refill-reminder.en.tpl`; eigene Vorlagen unter `data/mail-templates/`. Verbrauch und Erinnerungsstatus bleiben bei Backup/Restore mit SQLite und MongoDB erhalten.

## Aquarium-Detailansicht: Lazy Loading

Beim Öffnen eines Aquariums werden Stammdaten, Pflegezyklen, aktuelle Messwerte und Warnungen sofort geladen. Galerie, Verlauf, Bewohner, Dosierpumpen und Logbuch werden nachgeladen, sobald ihr Abschnitt beim Scrollen in die Nähe des sichtbaren Bereichs kommt. Verlauf und Messwerttabelle teilen ihre Datenabfrage. Bereits geladene Abschnitte bleiben verfügbar; nach Änderungen werden die Übersicht und die bereits aktivierten Bereiche aktualisiert.

Dosierpumpen werden pro Pumpe oder Kanal mit Flüssigkeit, Menge pro Dosierung, Tagesintervall und optionaler Uhrzeit eingerichtet. Der Plan kann aktiv oder pausiert sein. „Dosierung eintragen“ bestätigt eine bereits erfolgte Dosierung und speichert sie zum aktuellen Zeitpunkt im Logbuch; die App steuert keine Hardware. Beim Löschen einer Pumpe bleiben vorhandene Logbucheinträge erhalten.

- Fehlgeschlagene Abschnitte lassen sich einzeln erneut laden. Überholte Anfragen, etwa nach einem Zeitraumwechsel, und Anfragen beim Verlassen der Ansicht werden abgebrochen.
- Das Logbuch lädt weiterhin jeweils 25 Einträge über „Weitere laden“ nach.
- Bei bekannten Bewohnerarten öffnet **Artendetails** die Katalogansicht mit Bild, Wasseranforderungen, Haltung und Bildnachweis direkt als Modal. Die Schaltfläche ist auch mit reinem Lesezugriff verfügbar. Freie Arten ohne Katalogtreffer erhalten einen entsprechenden Hinweis.
- Die API unterstützt eine kompakte Übersicht über `GET /api/aquariums/:id?summary=true` und das getrennte Nachladen über `GET /api/aquariums/:id/stock`. Ohne `summary=true` bleibt die bisherige vollständige Detailantwort erhalten. Die bisherigen Zugriffsrechte gelten auch für die neuen Abfragen.
- Browser ohne `IntersectionObserver` laden die Bereiche automatisch ohne Scroll-Erkennung.

## Artenkatalog und Besatz-Kompatibilitätsprüfung

Der Besatz wird über modulare **JSON-Artenkataloge** unter `src/config/species/` (bzw. für eigene Erweiterungen unter `data/species/`) gesteuert:
- **Kataloge:**
  - `freshwater-popular.json`: Gängige Salmler, Lebendgebärende, Labyrinthfische, Bärblinge, Welse und Schmerlen.
  - `cichlids.json`: Südamerikanische Zwergbuntbarsche, Skalare, Diskusfische sowie ostafrikanische Buntbarsche (Malawi / Tanganjika).
  - `invertebrates.json`: Zwerggarnelen, Fächergarnelen, Zwergflusskrebse und Zierschnecken.
  - `saltwater.json`: Meerwasserfische, Anemonenfische, Putzergarnelen und Einsiedlerkrebse.
- **Dubletten-Abgleich:** Abweichende strukturierte Werte aus der neuen Popular-Datei wurden in die bestehenden Buntbarsch-Einträge übernommen, Tags aus beiden Dateien vereinigt und fehlende Haltungshinweise ergänzt. Die Vorrangregel und alle strukturierten Unterschiede stehen im [Import-Abgleich](docs/species-duplicate-merge.md).
- **147 Arten ohne doppelte Katalogeinträge:** Buntbarsche stehen ausschließlich in `cichlids.json`. Die alternative Diskus-ID `symphysodon-spp` bleibt als Alias für `symphysodon-sp` erreichbar.
- **Sulawesi-Profil:** Kardinalsgarnelen und Tylomelania erhalten ein eigenes Profil für warmes, alkalisches, mittelhartes Wasser. Seine Bereiche stammen aus der Überschneidung der gelieferten Katalogwerte; sie sind keine unabhängig geprüften artspezifischen Gefahrenwerte.
- **Neue Verhaltenstags:** Garnelenjäger (`shrimp_predator`, `aggressive_to_shrimp`) werden in der Räuber-Beute-Prüfung berücksichtigt. Weitere Tags erzeugen deutsch- und englischsprachige Haltungshinweise, etwa zu Strömung, Fütterung, Ausbruchschutz, Riffverträglichkeit und Nachzucht. `solitary` beschreibt die mögliche Einzelhaltung; strikte Einzelhaltungs-Konflikte richten sich weiterhin nach dem Aggressionsmerkmal.
- **Optionales Artenschema für Salinität:** `salinity` verwendet dieselben Felder wie Temperatur (`min`, `max`, `idealMin`, `idealMax`), ausschließlich in **‰**. Vorhandene Werte erscheinen in den Artendetails und im strukturierten KI-Kontext. Die gelieferten Dateien enthalten keine Salinitätswerte; es werden keine pauschalen Werte nachgetragen. Dies ergänzt keine Messmethode oder Testsuite und verändert keine Messwert-Grenzwerte.
- **Datenherkunft:** Die erweiterten Kataloge wurden aus den bereitgestellten Dateien übernommen. Abgeleitete KH-Bereiche und allgemeine Meerwasser-KH-Bereiche sind Richtwerte und wurden nicht als artspezifische Quellenangaben verifiziert.
- **Mobile Artendetails mit Bildern:** Klar gegliederte Übersicht mit Beckenbedarf, Haltung, Verhalten, Ideal-/Wasserbereichen und Einrichtung. 146 Arten haben ein lokal gespeichertes WebP-Bild; bei `nannostomus-beckfordi` fehlt ein Bild in der gelieferten Zuordnung. Die Kameraschaltfläche unten im Bild öffnet Urheber, Urheberlink, Lizenz, Lizenzlink, Bildquelle, ursprüngliche Herkunft und Bearbeitungshinweise. Nicht mitgelieferte Links werden kenntlich gemacht.
- **Bilddateien & Lizenzen:** `public/species-images/manifest.json` ordnet Bilder und Bildnachweise zu; `attribution.json` bewahrt die vollständige gelieferte Zuordnung. Die Bilder stehen jeweils unter ihrer eigenen dort angegebenen Lizenz, einschließlich ShareAlike, und fallen nicht pauschal unter die Softwarelizenz. Sie werden lokal geladen, ohne externe Bildabrufe. Die Bildzuordnung wurde aus der bereitgestellten Datenbank übernommen; deren Review-Status ist im Originalnachweis erhalten.
- **Bildoptimierung:** Maximal 768 × 768 Pixel, WebP (Qualität 74), ohne Beschnitt. Die eingebundenen Bilder benötigen insgesamt rund 5,4 MB statt 24,8 MB (78 % weniger). Erneuter Import mit Python 3 und Pillow: `python3 scripts/import-species-images.py "/pfad/zum/out"`. Dabei bleiben Originalnachweise erhalten und die zusätzliche Komprimierung wird dokumentiert.
- **Artenkatalog-Ansicht (`#/species`):** Durchsuche und filtere alle Bewohner nach Wassertyp oder Kategorie und sieh dir Wasseranforderungen (Temperatur, pH, GH, KH), Mindestbeckenvolumen, Schwimmzone und Wesen an.
  - **Zum Aquarium hinzufügen:** Direkt auf der Artenkarte oder in den Artendetails ein passendes Aquarium mit Schreibzugriff auswählen und die Anzahl eingeben. Optional erscheinen dynamische Namensfelder pro Tier; unbenannte Tiere werden als Gruppe gespeichert.
- **Verhaltens- & Territorialitäts-Prüfung:**
  - **Kampffische (*Betta splendens*):** Prüfung auf strikte Einzelhaltung (mehrere Kampffische in einem Becken lösen kritische Alarme aus), Schutz vor Flossenbeißern (Sumatrabarbe, Blutsalmler) und Rivalitätswarnung bei bunten Schleierfischen (Guppys).
  - **Mindestbeckengrößen:** Warnung, wenn das Aquarium kleiner ist als das empfohlene Mindestvolumen einer Art (z. B. Skalare ab 200 L, Diskus ab 300 L, Prachtschmerlen ab 400 L).
  - **Schwarmgrößen:** Warnung bei Schwarmfischen (Neonsalmler, Rotkopfsalmler, Zebrabärblinge), wenn weniger als die empfohlene Mindestanzahl gehalten wird.
  - **Räuber-Beute & Flossenschutz:** Warnungen vor Zwerggarnelen-Verlusten bei größeren Raubfischen (Skalare/Buntbarsche), Zwickgefahren bei Krebsen und Schneckenfressern (Raubschnecke Helena, Prachtschmerle) bei Zierschnecken.
  - **Biotop- und Wasserwertkonflikte:** Automatische Erkennung unvereinbarer Ansprüche (z. B. alkalische Malawi-/Tanganjika-Buntbarsche vs. Weichwasser-Südamerikaner oder Kaltwasserfische wie Kardinalfische vs. wärmebedürftige Tropenfische).

## Wartezeiten und Grenzwerte prüfen

Die Testparameter und Standardwerte liegen in `src/config/suites/jbl-pro-aquatest.json` und `config.ts`.

- **Wartezeiten:** Alle Zeiten im Standard-Set basieren auf der JBL Testlab-Gebrauchsanweisung (`verified: true`). Eigene Testsuiten können jederzeit als JSON ergänzt werden.
- **Grenzwerte:** Richtwerte für Süß- und Meerwasser. Prüfe sie für dein Becken und passe sie an.
  Die App ersetzt keine Beratung durch Fachleute.

## Betrieb

- **HTTPS:** Hinter einen Reverse Proxy (Caddy, nginx, Traefik) stellen, `APP_URL=https://...` (oder `COOKIE_SECURE=true`) sowie `TRUST_PROXY=1` setzen.
- **Backup:** `sqlite3 data/aquarium.db ".backup backup.db"` (die Datenbank läuft im WAL-Modus,
  daher nicht einfach nur die .db-Datei kopieren).
- **Passwörter** (nur lokale Anmeldung) werden mit scrypt gehasht, Sitzungen als Hash in der Datenbank gespeichert.

## Bekannte Grenzen

- Automatischer E-Mail-Versand bei Grenzwert-Alarmen ist für ein zukünftiges Release vorgesehen.

## Lizenz & Copyright

Dieses Projekt steht unter der **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International Lizenz (CC BY-NC-SA 4.0)**.

- **✅ Erlaubt (Privat & Community):**
  - Kostenlose Nutzung, Installation und Betrieb für den privaten und persönlichen Gebrauch.
  - Modifikation, Anpassung und Weiterentwicklung des Quellcodes.
- **🔄 Pflicht (Copyleft & Attribution):**
  - **ShareAlike:** Abgeleitete Werke und Weiterentwicklungen müssen unter derselben Lizenz (CC BY-NC-SA 4.0) veröffentlicht werden.
  - **Attribution:** Urheberhinweise und Verweise auf das Originalprojekt müssen erhalten bleiben.
- **⛔ Untersagt (Nicht-kommerziell):**
  - Jegliche kommerzielle Nutzung, der Weiterverkauf oder das Anbieten der Anwendung als entgeltliche Dienstleistung (z. B. kommerzielles SaaS-Hosting) ohne vorherige schriftliche Genehmigung des Urhebers.
- **📜 Drittanbieter-Lizenzen:**
  - Verwendete Open-Source-Module (`express`, `better-sqlite3`, `chart.js` unter MIT License; `mongodb` unter Apache License 2.0).

Vollständiger Lizenztext: Siehe [LICENSE](LICENSE) sowie in der App unter `#/lizenzen`.

## Geplante Erweiterungen & Roadmap

- [x] KI-Chat-Assistent für Aquarien mit Multi-Provider-Unterstützung (OpenAI, Google Gemini, Anthropic Claude) und automatischem Beckenkontext (Maße, Besatz, Grenzwerte, die letzten 10 Messungen).
- [x] Dünger-Dosierung & Dosierpumpen (beliebige Dünger, Dosiermengen in ml, frei konfigurierbare Intervalle, Protokollierung im Logbuch und Lazy Loading)
- [ ] Automatischer E-Mail-Versand bei kritischen Grenzwert-Alarmen.
- [ ] Social Bereich
- [x] Wassertest-Verbrauch mit automatischer Zählung, Profilkorrektur, Rücksetzung und Nachkauferinnerung ab 75 %.
