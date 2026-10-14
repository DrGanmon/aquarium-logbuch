# Vorgaben für Änderungen

- Bei jeder Änderung am Repository in der abschließenden Antwort eine passende Commit-Message angeben, auch wenn kein Commit erstellt wird.
- Das bestehende Schema verwenden: `typ(bereich): kurze Beschreibung auf Deutsch`.
- Passenden Typ wählen, zum Beispiel `fix`, `feat`, `perf`, `docs`, `test` oder `chore`; den Bereich passend zur Änderung benennen.
- Beispiel: `fix(ci): Build- und Testfehler in der Pipeline beheben`.
- Eine Commit-Message bereitzustellen ist keine Aufforderung, automatisch zu committen oder zu pushen.

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
