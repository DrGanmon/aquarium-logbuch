# Öffentliches Nutzerhandbuch pflegen

Die veröffentlichbaren Dateien liegen unter `public/handbuch/`. Der vorhandene statische Dateiserver der App liefert sie unter **`<App-Adresse>/handbuch/` ohne Anmeldung** aus, auch vor der Ersteinrichtung. Es gibt keine zusätzliche API, kein Frontend-Modul und keinen zusätzlichen Dienst. Deutsch bleibt unter `/handbuch/` erreichbar, Englisch unter `/handbuch/en/`. Die Sprachwahl oben im Handbuch verwendet normale Links und benötigt weder JavaScript noch Cookies. Das Verzeichnis lässt sich alternativ unverändert auf einem eigenen statischen Webserver bereitstellen.

## Inhalte bearbeiten

1. Deutsche Texte in `chapters.json`, englische Texte in `chapters.en.json` und die Oberflächentexte beider Sprachen in `locales.json` pflegen. Kapitel-IDs, Reihenfolge, Bildzuordnungen und Anzahl der Schritte und Hinweise müssen übereinstimmen. Der Generator lehnt unvollständige Fassungen ab. Die Reihenfolge bestimmt Inhaltsverzeichnis und Kapitelnummern. `groups.json` ordnet jedes Kapitel genau einem Themenbereich zu und enthält dessen deutsche und englische Überschrift und Einführung. Gruppenreihenfolge und Kapitelreihenfolge müssen übereinstimmen; alte Kapitel-IDs als stabile Links erhalten.
2. Screenshots mit ausschließlich erfundenen Konten und Aquariendaten aufnehmen. Keine echten Personen, E-Mail-Adressen, Schlüssel, Tokens oder Backup-Inhalte zeigen. Die Beispielillustration der Demo wurde für dieses Handbuch erstellt.
3. Screenshots als WebP unter `public/handbuch/images/` speichern; Breite und Höhe in `images/manifest.json` eintragen. Bildnamen entsprechen dem Feld `image` des Kapitels.
4. Gestaltung bei Bedarf in `guide.css` anpassen.
5. `node scripts/build-user-guide.js` ausführen. Die erzeugten Dateien `public/handbuch/index.html`, `public/handbuch/en/index.html` und `public/handbuch/guide.css` zusammen mit den Quellen und Bildern einchecken.
6. `node scripts/build-user-guide.js --check` und `npm test -- test/user_guide.test.js test/frontend_catalog_isolation.test.js` ausführen. Desktop-, Handy- und Druckansicht prüfen.

Weitere Sprachen: Eine vollständig übersetzte Kapiteldatei `chapters.<Sprachcode>.json` anlegen und einen Eintrag mit Sprachname, Zielverzeichnis, Kapiteldatei und allen Oberflächentexten in `locales.json` ergänzen. Sprachcodes folgen `xx` oder `xx-XX`; die deutsche Standardadresse bleibt unverändert. Danach neu erzeugen und alle Sprachfassungen prüfen. Bilder und CSS werden gemeinsam verwendet, nicht pro Sprache kopiert. Die vorhandenen Aufnahmen zeigen Deutsch; dies wird in beiden Fassungen erklärt und Bildbeschreibungen sind übersetzt.

Eine Versionsnummer gehört nicht in die Einführung des Nutzerhandbuchs. Bei UI-Änderungen die betroffenen Screenshots und Schrittfolgen aktualisieren. Bei neuen Funktionen ein passendes Kapitel ergänzen. Jedes Kapitel enthält unter `features` kurze Erklärungen zu Zweck und Wirkung der Funktionen und unter `steps` die eigentliche Bedienfolge. Die Anzahl der Funktionserklärungen muss ebenso wie Schritte und Hinweise in allen Sprachen übereinstimmen. Bereiche und Funktionen werden auf fehlende Übersetzungen geprüft.

## Geschwindigkeit und Datenschutz

- Die App importiert das Handbuch nicht. Es gehört weder zum Vite-Bundle noch zur Offline-Shell oder deren Frontend-Hash.
- Kein automatisches Prefetch, Preload oder Vorladen des Handbuchs aus der App hinzufügen.
- Die Handbuchseite verwendet kein JavaScript, Tracking, externe Schriftarten oder andere externe Ressourcen. Bilder haben feste Maße und werden mit `loading="lazy"` geladen.
- Keine App-API aufrufen und keine Anmeldung voraussetzen. Ein rein statischer Link darf das Handbuch bei Bedarf in einem eigenen Tab öffnen; dafür keine neue App-Komponente einführen.
- Änderungen am Handbuch dürfen den Frontend-Inhaltshash und den Service Worker nicht verändern. Der Build-Regressionstest sichert diese Grenze ab.

## Demo für Screenshots

Die Screenshots stammen aus einer isolierten lokalen Testinstanz. Erzeuge solche Aufnahmen niemals in einer produktiven Datenbank. Für automatisierte Demo-Aufnahmen kann die Testumgebung aus `test/helpers/env.js` mit `DATA_DIR` in einem temporären Verzeichnis verwendet werden; sie startet ausschließlich auf `127.0.0.1`. Nach Abschluss Testserver und Browser schließen und temporäre Daten entfernen. Für den Update-Dialog darf ein älterer geladener Frontend-Stand in dieser Demo simuliert werden; die Bildunterschrift muss dies benennen.

## Öffentlich bereitstellen

Bei einer normalen App-Veröffentlichung werden die fertigen Dateien bereits durch das bestehende Dockerfile übernommen. Docker Compose benötigt keine Anpassung. Öffne nach dem Deployment die App-Adresse mit `/handbuch/` und `/handbuch/en/` und prüfe beide Seiten in einem privaten Browserfenster ohne Anmeldung.

Für getrenntes Hosting nur den Inhalt von `public/handbuch/` kopieren; Node, Bun, die Datenbank und ein Build sind auf dem Dokumentationsserver nicht erforderlich. Die Dateien enthalten ausschließlich Handbuchtexte und Demo-Screenshots. Die technische Entwickler- und API-Dokumentation unter `docs/de/`, `docs/en/` und `docs/api/` bleibt getrennt erhalten.
