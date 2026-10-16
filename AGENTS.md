# Vorgaben für Änderungen

- Bei jeder Änderung am Repository in der abschließenden Antwort eine passende Commit-Message angeben, auch wenn kein Commit erstellt wird.
- Das bestehende Schema verwenden: `typ(bereich): kurze Beschreibung auf Deutsch`.
- Passenden Typ wählen, zum Beispiel `fix`, `feat`, `perf`, `docs`, `test` oder `chore`; den Bereich passend zur Änderung benennen.
- Beispiel: `fix(ci): Build- und Testfehler in der Pipeline beheben`.
- Eine Commit-Message bereitzustellen ist keine Aufforderung, automatisch zu committen oder zu pushen.

## App-Aufbau und Update-Grenzen erhalten

- Frontend: Vue/TypeScript unter `public/frontend`, Vite-Build nach `public/dist`. Backend: Express/TypeScript unter `src`, kompilierte Laufzeit unter `dist/backend`. Gemeinsame browserfähige Fachlogik liegt in `src/shared`; Servermodule und Geheimnisse dürfen nicht in Browser-Bundles gelangen.
- Drei Versionierungen getrennt halten: allgemeine App-Version aus `version.json` und Git-Historie, Frontend-SHA-256 aus den tatsächlich ausgelieferten Browserdateien und eigene Inhaltsversionen je Arten-, Pflanzen- und Gesundheitskatalog. Frontend-Hashes ausschließlich beim Build erzeugen; Versionsabfragen lesen gespeicherte Metadaten. App-/Backend-Versionswechsel und reine Katalogdatenänderungen dürfen keinen Frontend-Update-Hinweis auslösen.
- Katalogdaten aus `src/config/species`, `src/config/plants` und `src/config/health` sowie Arten-/Pflanzenbilder über die Katalog-API bzw. ihre Bildpfade laden. Keine direkten Daten-Imports in Frontend oder Web Worker; die Build-Sperre in `vite.config.mts` erhalten. Ansichten und Browserlogik weiterhin vollständig in die Frontend-Inhaltsversion einbeziehen.
- Der Service Worker hält die Offline-Shell einschließlich nachladbarer Chunks vor, übernimmt unveränderte Dateien und aktiviert angebotene Updates erst nach Bestätigung. Browser dürfen wartende Updates regulär aktivieren, sobald alle bisherigen Tabs geschlossen sind. HTML und Assets müssen derselben Fassung entsprechen. Caches installierender/wartender Updates und noch genutzte Dateien anderer Tabs nicht vorzeitig löschen.
- Aquariendaten, private Bilder und die dauerhafte Änderungswarteschlange liegen benutzergetrennt in IndexedDB. Private API-Daten niemals im gemeinsamen Shell-Cache speichern. Kontowechsel und Abmeldung über mehrere Tabs berücksichtigen; ID-Zuordnung, bestätigter lokaler Stand und Entfernen quittierter Aktionen atomar speichern.
- Offline-Operationen serverseitig erneut authentifizieren, autorisieren und validieren. Wiederholungen über Operations-IDs atomar deduplizieren; Berechtigungen auch beim Belegabruf für bestehende Aquarien prüfen. Konflikte anhand des Ausgangsstands erkennen und zur Entscheidung anzeigen; keine stillen Überschreibungen oder automatischen Duplikate. SQLite und MongoDB unterstützen.
- Referenzkataloge separat und erst nach dem Abgleich ausstehender Benutzereinträge synchronisieren; vorhandene Stände regulär höchstens alle zwölf Stunden prüfen. Authentifizierung, Kontosicherheit, KI, Freigaben, Social und Administration bleiben online. HTTPS ist für Service Worker erforderlich, abgesehen von localhost; keine uneingeschränkte Offline- oder Hintergrundausführung auf Mobilgeräten versprechen.
- Änderungen an Build, Offline-Speicherung oder Update-Abläufen mit den passenden Build-/Offline-/Katalogtests prüfen. Bei Buildänderungen Node 22 und Bun 1.4.3 berücksichtigen; die bestehende 350-KB-Grenze des minifizierten Startbundles nicht zur Umgehung eines Fehlers anheben. Schwere Ansichten und nur nach Anmeldung benötigte Offline-Bedienelemente bedarfsgesteuert laden.
- Öffentliches Nutzerhandbuch: Texte und Gestaltung unter `docs/user-guide`, fertige statische Dateien und Demo-Screenshots unter `public/handbuch`. Nach Inhaltsänderungen `node scripts/build-user-guide.js` ausführen und `--check` prüfen. Bei Funktionsänderungen betroffene Anleitungen und Screenshots mitpflegen. Keine echten Kontodaten oder Schlüssel abbilden. Handbuchdateien weder in Frontend/Web Worker importieren noch in die Offline-Shell aufnehmen oder automatisch vorladen; der App-Footer verlinkt ausschließlich per normalem Link darauf. Reine Änderungen an Handbuchtexten, Gestaltung oder Screenshots dürfen Frontend-Hash und Service Worker nicht verändern.

## API-Dokumentation pflegen

- Bei der Anlage neuer API-Endpunkte die OpenAPI-/Swagger-Dokumentation in `docs/api/openapi.json` im selben Änderungsschritt mitpflegen. Dies gilt auch für neue Alias-Pfade sowie Änderungen oder das Entfernen bestehender Endpunkte.
- HTTP-Methoden, Pfad- und Query-Parameter, Anfrage- und Antwortschemata, Authentifizierung, Berechtigungen und Fehlercodes entsprechend dem tatsächlichen Verhalten dokumentieren. Bei geänderten Abläufen auch die Anleitung und Aufrufbeispiele in `docs/api/README.md` aktualisieren.
- Nach API-Änderungen `node scripts/check-api-docs.js` ausführen und gemeldete Abweichungen vor Abschluss der Änderung beheben.

## Changelog pflegen

- Bei jeder Änderung und beim Formulieren jeder neuen Commit-Message automatisch auch `CHANGELOG.md` aktualisieren. Diese Pflege gehört zur Aufgabe und benötigt keine zusätzliche Aufforderung.
- Noch nicht committete Änderungen unter `Unveröffentlicht` auf Deutsch beschreiben: neue Features, Fehlerbehebungen und weitere relevante Änderungen. Bestehende Einträge ergänzen oder präzisieren, statt dieselbe Änderung mehrfach einzutragen.
- Vor der Aktualisierung die Git-Historie prüfen: inzwischen committete Einträge aus `Unveröffentlicht` in den passenden Versionsabschnitt überführen und mit tatsächlicher Commit-ID und Commit-Datum versehen. Keine zukünftigen Hashes oder Veröffentlichungen erfinden.
- Versionsstände entsprechend `version.json` und `scripts/version.js` zuordnen: `feat` erhöht die Revision und setzt den Patch zurück, `fix` erhöht den Patch; andere Typen behalten die Version bei. Manuelle Major-/Minor-Wechsel berücksichtigen.
- Im Changelog ausschließlich Revisionsabschnitte im Format `MAJOR.MINOR.REVISION-ALPHA` verwenden. Alle zugehörigen Patch-Änderungen unter derselben Revision zusammenfassen; keine eigenen Patch-Versionsüberschriften anlegen.
- Revisionen und ihre Änderungen jeweils neueste zuerst aufführen. Bestehende Historie erhalten und Änderungen ohne Versionssprung ebenfalls bei der zugehörigen Revision aufführen.
- Commit-Message und Changelog müssen denselben tatsächlichen Änderungsumfang wiedergeben. Die abschließende Antwort enthält weiterhin die Commit-Message im vorgegebenen Schema.
