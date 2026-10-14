# API / Swagger

Die vollständige [OpenAPI-Spezifikation](openapi.json) beschreibt **124 Pfade mit 187 Operationen** des Repository-Standes vom 15.10.2026, Version `0.1.7-2-ALPHA`. Sie verwendet [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html) und lässt sich in Swagger UI oder Swagger Editor importieren. Enthalten sind Konten, Kataloge, Aquarien, Bilder, Besatz, Messungen, Pflege, Dünger, Freigaben, Diagnose, KI-Chat, Social, Administration und OIDC.

## In Swagger ansehen

In einer lokalen Swagger-Editor-Installation `docs/api/openapi.json` über **File → Import file** öffnen. Alternativ eine eigene Swagger UI auf diese Datei konfigurieren. Die Datei gehört zur Dokumentation; die Anwendung stellt keinen zusätzlichen `/swagger`-Endpunkt bereit.

Die `servers`-URL ist standardmäßig `http://localhost:3000`. Für die eigene Installation auf die öffentliche `APP_URL` setzen, etwa `https://example.org/aquarium`. Der Unterpfad gehört in die Server-URL; `/api` ist bereits in den dokumentierten Pfaden enthalten. Statische Frontend-, Katalogbild- und Service-Worker-Dateien gehören nicht zu dieser API.

Swagger beschreibt Cookie-Authentifizierung; das Browserwerkzeug kann ein HttpOnly-Cookie nicht über den Authorize-Dialog setzen. Für ausführbare Anfragen eine gültige Sitzung derselben Anwendung verwenden oder die folgenden curl-Beispiele nutzen. Das Backend stellt keine allgemeine CORS-Freigabe für eine getrennt gehostete Swagger UI bereit.

## Anmeldung und Anfrageformat

- Authentifizierung erfolgt über das Cookie `session`, nicht über Bearer-Token oder Basic Auth. Lokale Anmeldung setzt es mit `Set-Cookie`; OIDC erzeugt es nach dem Callback. Cookie-Laufzeit: 30 Tage, `HttpOnly`, `SameSite=Lax`, `Secure` abhängig von der Konfiguration.
- Jeder schreibende `/api`-Aufruf benötigt `X-Requested-With`, auch ohne Body. Das Frontend verwendet `XMLHttpRequest` als Wert. Ohne Header: `403`.
- Ein Body muss `Content-Type: application/json` haben und ein JSON-Objekt enthalten. Andere Inhaltstypen: `415`; Arrays oder primitive JSON-Werte: `400`. Es gibt keine Multipart-Uploads. Das globale JSON-Limit ist 50 MiB; vorgeschaltete Proxys können kleinere Limits setzen.
- Aquarium-Rollen: `view`, `write`, `owner`; höhere Rollen schließen niedrigere ein. Die Anforderungen stehen an jeder Operation. Die Variable `ownAquarium` im Backend verlangt tatsächlich **Leserechte**. Unzugängliche Aquarien liefern `404`, unzureichende Rollen `403`.
- Administrator-Routen benötigen eine Sitzung mit verifizierter E-Mail aus `ADMIN_EMAILS`.
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

## AGB und Social-Bilder

`GET /api/terms?language=de` liefert `{version, terms}`. Registrierung und `POST /api/me/terms` verlangen `{acceptTerms:true, termsVersion:"VERSION_AUS_GET_TERMS"}`. Für den OIDC-Einstieg mit Zustimmung gibt es `POST /api/oidc/login`; dessen Antwort enthält die Weiterleitungs-URL. Social-Beiträge, Likes und neue Kommentare verlangen aktuelle Zustimmung, sonst `428`.

Social-Bilder werden in `image` als `data:image/jpeg;base64,...` bzw. PNG, WebP oder GIF übertragen. Erlaubt sind **10 MiB dekodierte Bilddaten**, höchstens 40 Megapixel und maximal 14 MiB für den Data-URL-String. Der Server speichert ein WebP mit höchstens 1600 Pixeln Kantenlänge, korrigierter Orientierung und ohne Vergrößerung. Andere Bild-Uploads (Profil, Aquarium, Bewohner) erlauben 5 MiB. Ungültige oder zu große Bilder liefern `400`; `413` betrifft das HTTP-Body-Limit oder den vorgeschalteten Proxy.

Ein neuer Beitrag verwendet `{image, text, isPublic}`. `text` darf bis 2200 Zeichen enthalten; `isPublic` ist standardmäßig `false`. Interne Beiträge sind für angemeldete Mitglieder sichtbar. Die öffentliche Feed-Abfrage enthält ausschließlich öffentliche Beiträge.

`GET /api/social/posts/{id}` liefert Gästen bei einem internen Beitrag `403` mit `code:"MEMBERS_ONLY"`, ohne Beitragsdaten. Direkte Bild- und Kommentaraufrufe liefern weiterhin `404`. Das Frontend nutzt den Fehlercode für den Mitgliederhinweis am Teilen-Link.

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

## Chat-Antworten

Ohne Streaming antwortet `/api/aquariums/{id}/chat` als JSON mit `ok`, `reply`, `provider`, `model` und gegebenenfalls `usage`. Der Diagnose-Chat liefert `reply`, `provider` und `model`.

`progress=true` aktiviert `application/x-ndjson`: eine JSON-Nachricht pro Zeile, kein JSON-Array. Statusereignisse melden Arbeitsschritte, keine interne Modellbegründung.

```jsonl
{"type":"status","stage":"generating"}
{"type":"done","reply":"Antworttext"}
```

Fehler nach Streambeginn werden als `{"type":"error","error":"Fehlermeldung"}` bei bereits gesendetem HTTP `200` übertragen. Beim Aquarium-Chat aktiviert `stream=true` ohne `progress=true` stattdessen `text/event-stream`; dieses SSE-Format wird vom KI-Anbieter durchgereicht. `progress=true` hat Vorrang.

## Fehler und Wartung

Normale Fehlerantworten sind JSON mit `error`, teilweise zusätzlich `code` oder weiteren Hinweisen. Typische Statuscodes: `400` Eingabe/Token, `401` Sitzung, `403` Berechtigung/CSRF, `404` fehlende oder verborgene Ressource, `409` Konflikt, `413` Body-Limit, `415` Inhaltstyp, `428` AGB, `429` Aktionslimit, `500` interner Fehler. OIDC-Routen unter `/auth` leiten stattdessen weiter; bei deaktiviertem OIDC können sie eine leere `404`-Antwort liefern. Auch ein Proxy kann einen anderen Fehlertyp zurückgeben.

Bei Routenänderungen die Spezifikation mitpflegen und aus dem Repository-Root prüfen:

```sh
node scripts/check-api-docs.js
npm run lint
```

Die Prüfung liest die tatsächlichen Router-Mounts und Routen mit dem TypeScript-Parser. Sie erkennt fehlende/veraltete Operationen, Alias-Pfade, `router.all`, doppelte Operation-IDs, fehlerhafte Referenzen und Pfadparameter sowie fehlenden Sitzungsschutz oder Schreib-Header. Sie ersetzt keine fachliche Kontrolle der Schemas. Die Datei wurde zusätzlich mit `@apidevtools/swagger-parser` gegen OpenAPI 3.0.3 validiert.

Sicherheitsbefunde und Betriebsgrenzen: [Audit](../AUDIT.md). Die Versionsangabe ist ein dokumentierter Repository-Stand und wird beim Aktualisieren der API-Dokumentation an `node scripts/version.js` angepasst.
