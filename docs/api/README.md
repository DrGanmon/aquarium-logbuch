# API / Swagger

Die vollständige [OpenAPI-Spezifikation](openapi.json) beschreibt **130 Pfade mit 194 Operationen** des Repository-Standes vom 15.10.2026. Sie verwendet [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html) und lässt sich in Swagger UI oder Swagger Editor importieren. Enthalten sind Ersteinrichtung, Konten, Kataloge, Aquarien, Bilder, Besatz, Messungen, Pflege, Dünger, Freigaben, Diagnose, KI-Chat, Social, Benachrichtigungen, Administration, Metriken und OIDC.

## In Swagger ansehen

In einer lokalen Swagger-Editor-Installation `docs/api/openapi.json` über **File → Import file** öffnen. Alternativ eine eigene Swagger UI auf diese Datei konfigurieren. Die Datei gehört zur Dokumentation; die Anwendung stellt keinen zusätzlichen `/swagger`-Endpunkt bereit.

Die `servers`-URL ist standardmäßig `http://localhost:3000`. Für die eigene Installation auf die öffentliche `APP_URL` setzen, etwa `https://example.org/aquarium`. Der Unterpfad gehört in die Server-URL; `/api` ist bereits in den dokumentierten Pfaden enthalten. Statische Frontend-, Katalogbild- und Service-Worker-Dateien gehören nicht zu dieser API.

Swagger beschreibt Cookie-Authentifizierung; das Browserwerkzeug kann ein HttpOnly-Cookie nicht über den Authorize-Dialog setzen. Für ausführbare Anfragen eine gültige Sitzung derselben Anwendung verwenden oder die folgenden curl-Beispiele nutzen. Das Backend stellt keine allgemeine CORS-Freigabe für eine getrennt gehostete Swagger UI bereit.

## Anmeldung und Anfrageformat

- Authentifizierung erfolgt über das Cookie `session`, nicht über Bearer-Token oder Basic Auth. Lokale Anmeldung setzt es mit `Set-Cookie`; OIDC erzeugt es nach dem Callback. Cookie-Laufzeit: 30 Tage, `HttpOnly`, `SameSite=Lax`, `Secure` abhängig von der Konfiguration.
- Jeder schreibende `/api`-Aufruf benötigt `X-Requested-With`, auch ohne Body. Das Frontend verwendet `XMLHttpRequest` als Wert. Ohne Header: `403`.
- Ein Body muss `Content-Type: application/json` haben und ein JSON-Objekt enthalten. Andere Inhaltstypen: `415`; Arrays oder primitive JSON-Werte: `400`. Es gibt keine Multipart-Uploads. Das globale JSON-Limit ist 50 MiB; vorgeschaltete Proxys können kleinere Limits setzen.
- Solange die Ersteinrichtung erforderlich ist, sind nur `/api/setup/status`, `/api/setup/complete` und der technische Healthcheck erreichbar. Alle anderen `/api`- und `/auth`-Aufrufe liefern `428` mit `code: SETUP_REQUIRED`.
- Aquarium-Rollen: `view`, `write`, `owner`; höhere Rollen schließen niedrigere ein. Die Anforderungen stehen an jeder Operation. Die Variable `ownAquarium` im Backend verlangt tatsächlich **Leserechte**. Unzugängliche Aquarien liefern `404`, unzureichende Rollen `403`.
- Administrator-Routen benötigen eine Sitzung mit in der Datenbank gesetzter Administratorrolle. Mehrere Benutzer können gleichzeitig Administrator sein; Administratoren verwalten diese Rolle in der Benutzerverwaltung.
- `GET /metrics` ist ein separater JSON-Endpunkt und benötigt das im Adminbereich konfigurierte Bearer-Passwort. Er gibt nur aggregierte Summen und Durchschnittswerte ohne Nutzerkennungen aus.
- Katalog- und Diagnosetexte unterstützen `lang=de|en`, alternativ `X-Language`; anschließend wird die Profilsprache berücksichtigt. `/api/terms` verwendet stattdessen `language=de|en`.

```sh
# BASE_URL inklusive APP_URL-Unterpfad setzen.
BASE_URL='http://localhost:3000'

# Anmeldung; Beispielzugang durch den eigenen Testzugang ersetzen.
curl -c /tmp/aquarium-api-cookies.txt \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -d '{"username":"beispiel","password":"beispiel-passwort"}' \
  "$BASE_URL/api/login"

curl -b /tmp/aquarium-api-cookies.txt "$BASE_URL/api/aquariums"

curl -b /tmp/aquarium-api-cookies.txt \
  "$BASE_URL/api/plants?lang=de&q=anubias&limit=24&offset=0"
```

## Systemmetriken

Ein Administrator kann die Metrikübersicht über `GET /api/admin/metrics` abrufen und das Scrape-Passwort mit `PUT /api/admin/metrics` festlegen. Das Passwort ist 16 bis 256 Zeichen lang, wird mit scrypt gehasht in `DATA_DIR/metrics-access.json` gespeichert und nicht in Backups aufgenommen. Ein neues Passwort ersetzt das bisherige.

Der unabhängige `GET /metrics`-Endpunkt verlangt `Authorization: Bearer <Passwort>`. Die JSON-Antwort enthält Nutzer- und Bestätigtenzahlen, Gesamtzahlen und Durchschnittswerte für Aquarien, Messungen und Pflegeeinträge, Social-Beiträge, Besatz, aktive Sitzungen sowie KI-Anfragen und Token je Anbieter. Erfolgreiche KI-Anfragen werden gezählt; Tokenwerte nur, wenn der Anbieter Usage-Daten meldet. Die Erfassung beginnt mit dieser Version; frühere Tokenwerte lassen sich nicht rückwirkend ermitteln. Die Datenbank speichert nur aufsummierte Provider-Zähler. Metriken enthalten keine Nutzer-IDs, Namen oder einzelnen Nutzungsverläufe. Antworten sind mit `Cache-Control: no-store` markiert; Fehlversuche sind begrenzt.

```sh
# Im Adminbereich zunächst das Scrape-Passwort festlegen.
curl -b /tmp/aquarium-api-cookies.txt -X PUT "$BASE_URL/api/admin/metrics" \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: XMLHttpRequest' \
  --data '{"password":"ein-langes-geheimes-scrape-passwort"}'

# Anschließend den JSON-Endpunkt mit demselben Passwort abrufen.
curl -H 'Authorization: Bearer ein-langes-geheimes-scrape-passwort' \
  "$BASE_URL/metrics"
```

## AGB und Social-Bilder

`GET /api/terms?language=de` liefert `{version, terms}`. Registrierung und `POST /api/me/terms` verlangen `{acceptTerms:true, termsVersion:"VERSION_AUS_GET_TERMS"}`. Für den OIDC-Einstieg mit Zustimmung gibt es `POST /api/oidc/login`; dessen Antwort enthält die Weiterleitungs-URL. Social-Beiträge, Likes und neue Kommentare verlangen aktuelle Zustimmung, sonst `428`.

Social-Bilder werden in `image` als `data:image/jpeg;base64,...` bzw. PNG, WebP oder GIF übertragen. Erlaubt sind **10 MiB dekodierte Bilddaten**, höchstens 40 Megapixel und maximal 14 MiB für den Data-URL-String. Der Server speichert ein WebP mit höchstens 1600 Pixeln Kantenlänge, korrigierter Orientierung und ohne Vergrößerung. Andere Bild-Uploads (Profil, Aquarium, Bewohner) erlauben 5 MiB. Ungültige oder zu große Bilder liefern `400`; `413` betrifft das HTTP-Body-Limit oder den vorgeschalteten Proxy.

Ein neuer Beitrag verwendet `{image, text, isPublic}`. `text` darf bis 2200 Zeichen enthalten; `isPublic` ist standardmäßig `false`. Interne Beiträge sind für angemeldete Mitglieder sichtbar. Die öffentliche Feed-Abfrage enthält ausschließlich öffentliche Beiträge.

`GET /api/social/posts/{id}` liefert Gästen bei einem internen Beitrag `403` mit `code:"MEMBERS_ONLY"`, ohne Beitragsdaten. Direkte Bild- und Kommentaraufrufe liefern weiterhin `404`. Das Frontend nutzt den Fehlercode für den Mitgliederhinweis am Teilen-Link.

`GET /api/notifications` bündelt für angemeldete Nutzer Reaktionen auf eigene Social-Beiträge mit offenen Wasserwertwarnungen aus allen zugänglichen Aquarien. Likes und Kommentare des Beitragsautors selbst erzeugen keine Benachrichtigung. `POST /api/notifications/read` markiert einzelne Social-Benachrichtigungen über `{ids:[...]}` oder ohne `ids` alle als gelesen. Wasserwertwarnungen werden weiterhin über `/api/aquariums/{id}/alerts/ack` quittiert.

## Listen, Datensätze und Spezialformate

- Pflanzenlisten sind paginiert: `limit` 1–100 (Standard 24), `offset` ab 0, Antwort `{plants, categories, total, next}`. Artenlisten verwenden diese Paginierung nur, wenn `limit` oder `offset` angegeben wird; sonst liefern sie die vollständige Liste. `next` ist der nächste Offset oder `null`. Detailaufrufe liefern Bilder mit Quellen- und Lizenznachweisen.
- Social-Beiträge und Kommentare verwenden einen `before`-Cursor mit maximal 20 Einträgen pro Seite. `next` ist die nächste Cursor-ID oder `null`. Kommentare einer Seite erscheinen in aufsteigender Reihenfolge.
- Aquarium-Listen, Besatz, Pflanzenbestand, Bilderlisten, Messungen, Pflegemaßnahmen, Timeline und Freigabelisten liefern Arrays. Antworten sind nicht allgemein in `{data:...}` verpackt. Anlegen liefert häufig `200`; nur die ausdrücklich dokumentierten Social-Anlegeoperationen liefern `201`.
- Messparameter und Wertebereiche stammen aus `/api/config` bzw. der Testsuite. Beispiel: `{values:{ph:7.2},note:"Vor Wasserwechsel"}`. Messlisten sind chronologisch aufsteigend, standardmäßig auf 90 Tage begrenzt. `days=all` oder `all=true` lädt alle Messungen. CSV-Export ohne Zeitraumfilter exportiert alle Werte, mit UTF-8-BOM und standardmäßig Semikolon.
- CSV-Import verwendet einen JSON-Body mit `csvText`, optional `delimiter`, `hasHeader` und `mapping`. Die Zuordnung lautet z. B. `{"0":"measured_at","1":"ph","2":"note"}`: nullbasierter Spaltenindex auf Zielfeld. `/parse-csv-header` liefert erkannte Kopfzeilen, Beispielzeilen und eine automatische Zuordnung.
- Düngerpläne haben `mode=manual|automatic`. Nur manuelle Pläne erlauben Mail-Erinnerungen und den `/dose`-Aufruf. Automatische Dosierungen werden vom Scheduler protokolliert; manuelles Protokollieren automatischer Pumpen liefert `400`. `/fertilizers` und `/dosing-pumps` sind Alias-Pfade. Zeiten gelten in der Server-Zeitzone; die Liste liefert `schedule_timezone` und `next_due_at`.
- Aquarium-Einladungen können per Token ohne Sitzung angenommen oder abgelehnt werden. Bei `aquarium_id` statt Token ist die Sitzung des eingeladenen Benutzers nötig. Abgelaufene oder bereits angenommene Einladungen werden beim Annehmen abgewiesen.
- Backup-Anlegen mit `download=1` bzw. `{download:true}` und Backup-Download liefern Dateien. Restore-Upload nimmt `backupBase64`, `backupData` oder direkt ein Backup-JSON-Objekt entgegen. Wiederherstellung kann Sitzungen ungültig machen.
- `/api/verify-email`, `/api/confirm-delete-account` und `/api/delete-account` verwenden im Backend `router.all`. Deshalb sind auch GET, HEAD und OPTIONS bei diesen Token-Aktionen **nicht nebenwirkungsfrei**. Die Spezifikation dokumentiert alle acht in OpenAPI darstellbaren HTTP-Methoden (einschließlich TRACE); für Integrationen POST verwenden. Der Token kann im JSON-Body oder in der Query stehen.

Die Schemas dokumentieren Kernfelder und bleiben bei Katalogen, Konfigurationen sowie Anbieterantworten erweiterbar (`additionalProperties`). Sie sind keine vollständig geschlossene Beschreibung sämtlicher interner Datenbankfelder. Ein optionales Feld mit freiem Schema bedeutet eine dynamische, nicht auf einen einzelnen Typ festgelegte Antwort.

## Persönliche KI-Schlüssel

Die Profilrouten `/api/me/ai` bzw. die anbieterspezifischen `/api/me/openai`, `/api/me/gemini`, `/api/me/claude` (inklusive Alias-Pfaden) nehmen API-Schlüssel wie bisher als JSON-Zeichenfolge an. Der Server verschlüsselt sie vor der Speicherung; Modelllisten, Verbindungstests und Chat entschlüsseln gespeicherte persönliche Tokens erst für den Anbieteraufruf. Globale Umgebungswerte bleiben der Fallback.

Profilantworten liefern `openaiKeyMasked`, `geminiKeyMasked` und `claudeKeyMasked` mit den gespeicherten ersten/letzten vier Zeichen, beispielsweise `sk-p...1234`, bei kurzen Tokens `***`. Vollständige Schlüssel und Chiffretexte werden nicht ausgegeben. Ohne persönlichen Schlüssel liefert die Maskierung `null` oder `Über Server konfiguriert`. Löschen entfernt auch die Identifikationsfelder. Neue Backups enthalten verschlüsselte Tokens; zum Wiederherstellen ist derselbe Master-Schlüssel erforderlich, siehe [Installation](../de/installation.md#verschlüsselung-persönlicher-ki-schlüssel).

## Chat-Antworten

Ohne Streaming antwortet `/api/aquariums/{id}/chat` als JSON mit `ok`, `reply`, `provider`, `model` und gegebenenfalls `usage`. Der Diagnose-Chat liefert `reply`, `provider` und `model`.

`progress=true` aktiviert `application/x-ndjson`: eine JSON-Nachricht pro Zeile, kein JSON-Array. Statusereignisse melden Arbeitsschritte, keine interne Modellbegründung.

```jsonl
{"type":"status","stage":"generating"}
{"type":"done","reply":"Antworttext"}
```

Fehler nach Streambeginn werden als `{"type":"error","error":"Fehlermeldung"}` bei bereits gesendetem HTTP `200` übertragen. Beim Aquarium-Chat aktiviert `stream=true` ohne `progress=true` stattdessen `text/event-stream`; dieses SSE-Format wird vom KI-Anbieter durchgereicht. `progress=true` hat Vorrang.

## Fehler und Wartung

Normale Fehlerantworten sind JSON mit `error`, teilweise zusätzlich `code` oder weiteren Hinweisen. Typische Statuscodes: `400` Eingabe/Token, `401` Sitzung, `403` Berechtigung/CSRF, `404` fehlende oder verborgene Ressource, `409` Konflikt, `413` Body-Limit, `415` Inhaltstyp, `428` AGB, `429` Aktionslimit, `500` interner Fehler. Während einer gemeinsamen Backup-/Restore-Wartung werden dynamische `/api`- und `/auth`-Anfragen vorübergehend mit `503` abgewiesen; erneut versuchen, wenn die Wartung beendet ist. OIDC-Routen unter `/auth` leiten ansonsten weiter; bei deaktiviertem OIDC können sie eine leere `404`-Antwort liefern. Auch ein Proxy kann einen anderen Fehlertyp zurückgeben.

Bei Routenänderungen die Spezifikation mitpflegen und aus dem Repository-Root prüfen:

```sh
node scripts/check-api-docs.js
npm run lint
```

Die Prüfung liest die tatsächlichen Router-Mounts und Routen mit dem TypeScript-Parser. Sie erkennt fehlende/veraltete Operationen, Alias-Pfade, `router.all`, doppelte Operation-IDs, fehlerhafte Referenzen und Pfadparameter sowie fehlenden Sitzungsschutz oder Schreib-Header. Sie ersetzt keine fachliche Kontrolle der Schemas. Die Datei wurde zusätzlich mit `@apidevtools/swagger-parser` gegen OpenAPI 3.0.3 validiert.

Sicherheitsbefunde und Betriebsgrenzen: [Audit](../AUDIT.md). Die Versionsangabe ist ein dokumentierter Repository-Stand und wird beim Aktualisieren der API-Dokumentation an `node scripts/version.js` angepasst.

### Verschlüsselte Backups

Vor manuellen oder automatischen Backups als Administrator ein Passwort setzen:

```sh
curl -b /tmp/aquarium-api-cookies.txt -X PUT "$BASE_URL/api/admin/backups/config" \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: XMLHttpRequest' \
  --data '{"password":"ein-langes-geheimes-passwort","enabled":true}'
curl -b /tmp/aquarium-api-cookies.txt -X POST "$BASE_URL/api/admin/backups/create?download=1" \
  -H 'X-Requested-With: XMLHttpRequest' -o backup.json.gz.enc
```

`GET /api/admin/backups` und `PUT /api/admin/backups/config` liefern nur `passwordConfigured`, niemals das Passwort oder dessen Chiffretext. Ein leeres Passwort lässt das bisherige unverändert. Neue Passwörter benötigen 12–1024 Zeichen. Ohne Passwort wird die Erstellung mit HTTP 400 abgewiesen.

Zur Wiederherstellung über `POST /api/admin/backups/restore-upload` ein JSON-Objekt mit `backupBase64` (Base64 der vollständigen Archivdatei) und optional `password` senden. Auch `POST /api/admin/backups/{filename}/restore` akzeptiert `{"password":"damaliges-passwort"}`. Ein falsches Passwort oder eine manipulierte Datei ergibt HTTP 400 vor Änderungen an Datenbank und Bildern. Ohne Passwort wird der lokale App-Schlüssel verwendet. Alte JSON-/gzip-Dateien bleiben importierbar.

Das Format `AQLBENC1` enthält einen längenbegrenzten, authentifizierten Header, einen zufälligen Salt, IV und AES-256-GCM-Chiffretext. scrypt (N=32768, r=8, p=1) leitet den Archivschlüssel vom Passwort ab. Eine mit dem separaten App-Schlüssel verschlüsselte Kopie des Archivschlüssels ermöglicht lokale Wiederherstellung und Bildbereinigung auch nach Passwortwechseln. Das Passwort selbst wird nicht exportiert. Heruntergeladene ältere Archive behalten ihr ursprüngliches Passwort. Migrationssicherungen vor der ersten Passwortkonfiguration sind ausschließlich mit dem App-Schlüssel entschlüsselbar.

## Offline-Messwerte, Logbucheinträge und mehrere Geräte

Die PWA speichert neue Messungen und manuelle Logbucheinträge pro Benutzer in IndexedDB und überträgt sie bei geöffneter App nach Wiederherstellung der Verbindung, beim Aktivieren und regelmäßig alle 30 Sekunden. Erster Login und Laden der gewünschten Aquarien/Testkonfiguration müssen online erfolgen. Der Produktionsbuild speichert die App-Oberfläche einschließlich aller Ansichten im Service Worker; HTTPS oder localhost sind erforderlich. Bereits geladene Listen und Details stehen offline zur Verfügung. Bearbeiten und Löschen bestehender Einträge sowie andere Schreibvorgänge bleiben online erforderlich. Docker Compose benötigt dafür keinen zusätzlichen Dienst.

Für jede neue Messung einmal eine UUID v4 erzeugen und denselben Inhalt bei Übertragungswiederholungen beibehalten:

```http
POST /api/aquariums/42/measurements
Content-Type: application/json
X-Requested-With: fetch
Cookie: session=…

{"operation_id":"5b758776-47d8-46b2-b4c4-f4873a80d724","operation_user_id":7,"measured_at":"2026-10-15T12:00:00.000Z","values":{"ph":7.2},"selectedTests":["jbl-pro:ph"],"note":"Offline erfasst"}
```

`operation_user_id` muss zur Sitzung gehören. Authentifizierte Antworten enthalten `X-Aquarium-User` mit der aktuellen Benutzer-ID; die PWA prüft diese vor dem Speichern geladener Daten, damit ein Kontowechsel in einem anderen Tab keine fremden Daten im lokalen Benutzerbestand ablegt. Eine Wiederholung liefert HTTP 200 mit derselben Messungs-ID und den ursprünglichen Alarmen, ohne weitere Messung, Alarme oder Reagenzverbrauch zu erzeugen. Abweichender Inhalt bei gleicher Operations-ID liefert 409. Zwei Geräte mit verschiedenen UUIDs erzeugen zwei Messungen; gleiche Messwerte werden nicht automatisch gelöscht oder zusammengeführt. Wiederholungsbelege bleiben nach dem Löschen einer Messung erhalten und sind Bestandteil neuer Backups. Alte Backups besitzen diese Belege nicht.

Bei abgelaufener Anmeldung pausiert die Übertragung; lokale Eingaben bleiben erhalten und sind nach erneuter Anmeldung desselben Benutzers erreichbar. Abmelden entfernt die aktive Offline-Identität, behält aber offene Eingaben kontogetrennt. Lokale Daten liegen im Browserprofil; Browserdaten-Löschen, Speicherverlust oder Geräteverlust können noch nicht synchronisierte Daten entfernen. Berechtigungsentzug wird beim nächsten Serverkontakt durchgesetzt. Synchronisierung bei geschlossener App ist nicht garantiert. Es gibt noch keine Offline-Bearbeitung oder -Löschung bestehender Messungen und keine automatische Erkennung unabhängig erfasster Duplikate.

Neue manuelle Logbucheinträge nutzen dieselbe Warteschlange und dieselben Sitzungsprüfungen. Unterstützt werden Wasserwechsel, Filterwechsel/-reinigung, Pflanzenschnitt, neue Pflanzen, Pflege, manuelle Düngung, Fütterung und sonstige Arbeiten. Automatische Dosierpumpen-Einträge bleiben serverseitig; deren manuelle Anlage wird weiterhin abgelehnt.

```http
POST /api/aquariums/42/maintenance
Content-Type: application/json
X-Requested-With: fetch
Cookie: session=…

{"operation_id":"693e8917-ec95-46b1-8784-1db5c43bd4d6","operation_user_id":7,"logged_at":"2026-10-15T12:00:00.000Z","type":"water_change","percentage":30,"details":"Bodengrund abgesaugt","note":"Offline erfasst"}
```

Bei Erfolg und Wiederholung: HTTP 200 mit `{"ok":true,"id":123}`. Dieselbe Operations-ID mit anderem normalisiertem Inhalt oder Aquarium liefert 409; ungültige UUID/fehlender Zeitpunkt 400, unpassende Benutzer-ID 403. Auch nach dem Löschen und nach Backup/Restore erzeugt eine Wiederholung keinen neuen Eintrag. Operations-IDs für Messungen und Pflegeeinträge sind getrennt, damit bestehende Offline-Messwerte unverändert synchronisierbar bleiben. Die bestehende Belegtabelle/-Collection `measurement_operations` speichert beide Eintragsarten; eine weitere Datenbankmigration oder ein zusätzlicher Docker-Dienst ist nicht erforderlich.
