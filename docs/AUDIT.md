# Code- und Sicherheitsaudit vom 14.10.2026

Die API-Spezifikation mit Authentifizierung, Berechtigungen und Fehlerantworten steht in [API / Swagger](api/README.md) und [openapi.json](api/openapi.json).

Ausgangsstand: `3dd39c98ce157b4d5e5c41f8b636bbbd406c1cee`. Geprüft wurden Authentifizierung und Sitzungen, OIDC, Aquariumfreigaben, Social- und Pflanzenfunktionen, Uploads, Backups, KI-Schnittstellen, SQLite-/MongoDB-Zugriffe, Sicherheitsheader und die Abhängigkeiten. Die manuelle Prüfung konzentrierte sich auf diese Schnittstellen; sie ist kein vollständiger Penetrationstest oder Nachweis allgemeiner Fehlerfreiheit. Der frühere Audit-Bericht bleibt unten erhalten.

## Bestätigte und behobene Befunde

| Priorität | Befund | Korrektur und Nachweis |
| --- | --- | --- |
| Hoch | Der OIDC-Status enthielt den PKCE-Verifier als lesbaren Base64-JSON-Wert im URL-Parameter. Bei öffentlichen Clients leitete sich der Signaturschlüssel aus der öffentlich bekannten Client-ID ab. Damit war PKCE nicht hinreichend von einem abgefangenen Autorisierungscode getrennt; die Statusintegrität beruhte ohne Client-Secret auf keinem geheimen Schlüssel. | Status mit AES-256-GCM verschlüsseln und authentifizieren; Client-ID nicht als Geheimnis verwenden. `OIDC_STATE_SECRET` ermöglicht einen gemeinsamen geheimen Schlüssel über unabhängige Instanzen. Ohne konfigurierte Secrets entstehen zufällige Schlüssel, die Supervisor-Worker gemeinsam erben. Tests prüfen workerübergreifende Rücksprünge, manipulierte Chiffretexte, fremde Schlüssel, alte mit Client-ID signierte Tokens und verborgene PKCE-Daten. Eine vollständige Kontoübernahme wurde nicht demonstriert. |
| Mittel | Nach einem normalen oder administrativen Passwortwechsel blieben vorhandene Sitzungen gültig. Eine bereits gestohlene Sitzung verlor dadurch ihren Zugriff nicht. | Alle bisherigen Sitzungen bei beiden Wechselpfaden widerrufen. Beim eigenen Wechsel eine neue Sitzung ausstellen und vorhandenen OIDC-Logout-Kontext übernehmen. Tests prüfen zwei alte Sitzungen, die neue Sitzung und administratives Zurücksetzen in SQLite und MongoDB. |
| Mittel | Aktuelle Passwörter konnten beim Passwortwechsel und bei Löschanfragen unbegrenzt geprüft werden. Der Wechsel akzeptierte außerdem neue Passwörter über 200 Zeichen, die die Anmeldung anschließend ablehnte. | Kontobezogene Versuchslimits vor der asynchronen Hashprüfung reservieren; aktuelle Passwörter auf 200 Zeichen und neue auf 8–200 Zeichen begrenzen. Gleichzeitige Fehlversuche werden begrenzt. Bedingte Passwortaktualisierung verhindert das Überschreiben einer inzwischen erfolgten Änderung. |
| Mittel | Abgelaufene Aquarium-Einladungen konnten mit gültiger Sitzung über die Aquarium-ID angenommen werden. Die Token-Annahme prüfte Ablauf und Verwendung nur vor der Datenbankaktualisierung und ignorierte deren Ergebnis. | Beide Adapter aktualisieren nur eine noch ausstehende, nicht abgelaufene Einladung. Wiederholte oder konkurrierende Einlösungen und zwischenzeitlich ersetzte Tokens liefern keinen falschen Erfolg. API- und Repository-Tests prüfen Ablauf, parallele Einlösung und Kontotrennung. |
| Mittel | Backup-Archive enthalten sensible Kontodaten und gegebenenfalls API-Schlüssel, wurden jedoch ohne private Dateirechte erzeugt. Mit üblicher umask konnten andere lokale Konten die Dateien lesen. | Neue und erneut geschriebene Archive auf POSIX-Dateirechte `0600` begrenzen; bei Datenschutzbereinigung neu erzeugte Archive ebenfalls privat schreiben. Tests prüfen neue und bereits vorhandene Archive. Andere, nicht erneut geschriebene alte Archive werden nicht automatisch umgestellt. |
| Niedrig | Wartungskategorien und OIDC-Signaturalgorithmen wurden über normale Objekte nachgeschlagen. Schlüssel wie `constructor` und `__proto__` bestanden dadurch die Existenzprüfung. | Nur eigene Schlüssel zulassen. Tests lehnen diese Kategorien und Algorithmusnamen ausdrücklich ab. Aus dem Algorithmusbefund wurde keine erfolgreiche Signaturumgehung nachgewiesen. |
| Niedrig | Die sitzungsbasierten Freigabeaktionen riefen Authentifizierung mit einem verschachtelten asynchronen Callback auf. Fehler im Callback gingen am äußeren Promise-Fehlerhandler vorbei. | Authentifizierung als reguläre Express-Middleware vor dem abgefangenen Handler ausführen. Tokenbasierte Aktionen bleiben durch Tokenbesitz autorisiert; Aquarium-ID-Aktionen erfordern eine Sitzung. |

## Prüfungen

- `npm audit --json`: **0 bekannte Schwachstellen**, 347 erfasste Abhängigkeiten; Momentaufnahme des beim Lauf verfügbaren Advisory-Bestands.
- Neue Regressionstests: `test/security_audit_20261014.test.js`, mit SQLite und MongoDB sowie kontrolliertem OIDC-Provider-Mock.
- Vollständige Testsuite mit finalem Quellstand: **305 von 305 Tests bestanden** unter Node 24.19.0 und **305 von 305 unter Bun 1.4.3**, einschließlich SQLite, MongoDB, OIDC-Mock und realem Supervisor.
- Builds mit Backend-/Frontend-Typprüfung unter Node und Bun erfolgreich; `npm run lint` ohne Fehler oder Warnungen. `git diff --check` erfolgreich.

## Verbleibende Risiken und Prüflücken

- Rate-Limits bleiben pro Prozess. Mehrere Worker oder unabhängige Instanzen brauchen ein gemeinsam gespeichertes oder am Reverse Proxy durchgesetztes Limit. Der neue Passwortschutz ist keine verteilte Sperre.
- Persönliche KI-Schlüssel liegen weiterhin im Klartext in der Datenbank; Backups enthalten entsprechende Daten. Datenvolume und Backup-Ablage müssen vor fremdem Zugriff geschützt werden. `0600` verschlüsselt keine Archive und behebt keine schon extern kopierten Sicherungen.
- Öffentliche OIDC-Clients mit mehreren unabhängigen Instanzen benötigen denselben `OIDC_STATE_SECRET`. Ohne festen Schlüssel werden noch laufende Anmeldungen nach Neustart ungültig. Bereits gestartete Anmeldungen mit dem alten Statusformat müssen nach dem Update neu begonnen werden.
- Die bisherigen nicht atomaren Gesamtoperationen über MongoDB-Collections und die instanzlokalen Backup-/Restore-Sperren bleiben bestehen. Wiederherstellungen brauchen weiterhin ein Wartungsfenster ohne konkurrierende Schreibzugriffe.
- Aquarium-, Bewohner- und Avatarbilder werden weiterhin nach Dateisignatur und Byte-Limit geprüft; anders als Social-Bilder werden sie nicht serverseitig vollständig dekodiert oder von Metadaten befreit. Standortdaten in EXIF und eine ungünstige Pixelzahl bleiben daher mögliche Datenschutz-/Ressourcenrisiken.
- Angemeldete Nutzer können konfigurierte serverseitige KI-Schlüssel verwenden. Ein zentraler Kosten-/Nutzungsquotenschutz und ein produktionsnaher Lasttest waren nicht Teil dieser Korrekturen.
- Keine produktive Installation, Reverse-Proxy-Konfiguration oder realer externer OIDC-/SMTP-Anbieter wurde angegriffen. Docker-Images wurden mangels verfügbarer Docker-CLI nicht gebaut. Die automatischen Prüfungen ersetzen diese Betriebsprüfungen nicht.

---

# Codeprüfung vom 12.10.2026

Geprüft wurden Backend, Frontend, SQLite-/MongoDB-Zugriffe, Hintergrunddienste sowie Build-, Test- und Versionsskripte. Schwerpunkt waren Rechtevergabe, untrusted JSON, parallele Schreibzugriffe, asynchrone Lebenszyklen und Speicherverbrauch. Die automatisierten Prüfungen ergänzen die manuelle Durchsicht; sie beweisen keine vollständige Fehlerfreiheit.

## Behobene Probleme

| Bereich | Problem und Änderung |
| --- | --- |
| Administratorrechte | Registrierung mit einer behaupteten Admin-Adresse sowie nachträgliches Ändern der Profiladresse konnten Rechte ohne Besitznachweis vergeben. Registrierung und Login verlangen Bestätigung; Adresswechsel setzen den Bestätigungsstatus zurück und versenden einen neuen Link. Auch bestehende Sessions und Einladungsberechtigungen berücksichtigen den aktuellen Bestätigungsstatus. |
| E-Mail-Einladungen | Einladende kennen den Einladungscode selbst. Deshalb gelten nur passende E-Mail-Einladungen eines bestätigten Administrators als ausdrückliche Kontofreigabe; Einladungen anderer Nutzer ersetzen keinen E-Mail-Besitznachweis. |
| OIDC | Automatische Kontoverknüpfungen verlangen eine bestätigte, passende Provider-Adresse. Nicht bestätigte Claims überschreiben keine bestehende Adresse. Manipulierte Link-Cookies reichen nicht mehr zur Kontoübernahme: Der Callback verlangt die gültige Sitzung des betreffenden Kontos. Subject und zusätzliche Audience-Zuordnung werden strenger geprüft. Neue OIDC-Konten umgehen keine geschlossene oder einladungsgebundene Registrierung. |
| Einmalige Tokens | Verifizierung und Passwort-Reset aktualisieren nur, solange der betreffende Token noch aktuell ist. Parallele Einlösung und inzwischen ersetzte Tokens werden abgewiesen. Auch konkurrierende OIDC-Verknüpfungen verwenden eine bedingte Aktualisierung. |
| Einladungszähler | Verwendung und Kapazitätsprüfung erfolgen atomar in beiden Datenbanken vor der Kontoanlage. Fehlschlagende Kontoanlagen geben die Reservierung zurück; gleichzeitige Namens-/Adresskonflikte ergeben HTTP 409. |
| Eingaben und Cookies | Nicht objektförmige API-Bodies werden abgelehnt. Fehlerhaft kodierte Cookies verursachen keinen Serverfehler. Unbekannte Testsuiten werden nicht auf die Standardsuite umgebogen; damit werden auch gefährliche Objekt-Schlüssel abgewehrt. |
| Missbrauchsschutz | Loginversuche werden vor asynchroner Passwortprüfung gezählt. Überlange Login-Passwörter werden früh abgewiesen; Login per längerer E-Mail-Adresse funktioniert. Registrierung ist zusätzlich begrenzt. Rate-Limit-Einträge werden bereinigt und ihre Anzahl begrenzt. |
| SMTP | Deaktivierte Konfigurationen versenden keine Queue-Mails. Angefordertes TLS wird auch bei fehlendem STARTTLS erzwungen. Header-Zeilenumbrüche und ungültige Envelope-Adressen werden abgewiesen; Antwortpuffer sind begrenzt. Queue-Verarbeitung gibt ihren Status auch bei Fehlern frei. |
| Warteschlangen und Worker | Mail-Queue: maximal 1.000 wartende Nachrichten je Prozess. Backend-Worker: maximal 1.024 wartende Aufgaben; beendete Pools lehnen neue Aufgaben ab. Unerwartete Worker-Exits, einschließlich Exit-Code 0, weisen laufende Aufgaben zurück. Fehlerhafte Nachrichten und nicht klonbare Payloads lassen keine hängenden Einträge zurück; wiederholt abstürzende Slots werden begrenzt neu gestartet. Automatische Threadzahlen berücksichtigen die Anzahl der Serverprozesse. Browser-Worker räumen fehlgeschlagene Aufträge auf und werden bei Zeitüberschreitung beendet. |
| Scheduler und Supervisor | Initiale Reminder-Timer, Neustart-Timer, Kill-Timer und Signal-Handler werden abgeräumt. Gleichzeitige Stop-/Restart-Aufrufe werden gebündelt; alte Prozessgenerationen starten keine Ersatzprozesse. Reminder-Prüfungen überlappen innerhalb einer Serviceinstanz nicht. Datenbankgestützte Reservierungen verhindern doppelte Zyklus-Mails auch zwischen Instanzen; fehlgeschlagenes Einreihen gibt die Reservierung zurück. |
| Frontend-Lebenszyklen | Lazy Loading bleibt nach synchronen Fehlern wiederholbar und lädt nach Unmount nicht weiter. Messansichten installieren nach Unmount keine Timer oder Listener; verspätet erworbene Wake Locks werden freigegeben. KI-Modelle, Admin-Daten und Artenanfragen werden bei Ablösung/Unmount abgebrochen. Chat-Laden, Senden und Löschen kollidieren nicht mehr innerhalb des Dialogs. |
| KI-Chat | Begrenzte Historien enthalten die neuesten Nachrichten in chronologischer Reihenfolge. Das konfigurierte Zeichenbudget wird eingehalten, neue Nachrichten haben Vorrang. Abgebrochene Client-Verbindungen brechen Provider-Anfragen ab; Streamfehler und Disconnects werden über eine Pipeline behandelt. Provider-Fallbacks teilen sich eine Gesamtlaufzeitbegrenzung. |
| Bilder und Löschungen | Löschen eines Nutzers entfernt keine Fotos fremder, freigegebener Aquarien mehr. Aquarium-Löschungen räumen Hauptbild, Galerie und Bewohnerbilder in beiden Adaptern auf; MongoDB-Cascades laufen für unabhängige Collections parallel. |
| Konfiguration und Backups | JSON-Konfigurationen werden über atomaren Dateiaustausch mit Dateirechten 0600 geschrieben. Andere Prozesse lesen keine halbfertigen Dateien. Backups starten innerhalb einer Instanz nicht während Restore; GZIP-Entpackung ist auf 256 MiB begrenzt. |
| Große Datenmengen | Logs lesen höchstens die letzten 4 MiB statt die gesamte Datei. Graphen und Statistiken vermeiden große Spread-Argumentlisten. Worker-Statistiken benötigen einen Durchlauf je Parameter ohne Sortieren oder Wertarrays. Graphen behandeln leere/ungültige Daten und sortieren Messpunkte chronologisch. |
| Browser-Schutz | CSP entfernt Inline-JavaScript-Freigabe und sperrt eingebettete Objekte sowie fremde Basis-URLs. Sicherheitsheader werden auch vor fehlerhaften JSON-Bodies gesetzt. |
| MongoDB-Initialisierung | Fehler beim Aufbau erforderlicher Eindeutigkeitsindizes werden nicht mehr verschluckt. Fehlgeschlagene Initialisierung schließt die Verbindung, bevor ein neuer Versuch möglich ist. |

## Prüfungen

Die zusätzlichen Regressionstests prüfen unter anderem parallele Einladungen, Verifizierung und Passwort-Resets für SQLite und MongoDB, Adminrechte bei Adresswechsel, gefälschte OIDC-Link-Cookies, SMTP ohne erforderliches TLS, Provider-Abbruch, Worker-Exit-Code 0, Queue-Grenzen, Bildlöschungen, Konfigurationsfehler sowie Graphen und Statistiken mit 150.000 Messpunkten.

- Vollständige Testserien: jeweils **229 von 229 Tests bestanden** unter Node 24.19.0 und Bun 1.4.3 (einschließlich SQLite, MongoDB und realem Supervisor mit zwei HTTP-Workern).
- Strikte TypeScript-Prüfung für Backend und Frontend erfolgreich.
- Produktionsbuild einschließlich TypeScript-Prüfung unter Node und Bun erfolgreich.
- `npm audit`: 0 bekannte Schwachstellen in 199 erfassten Abhängigkeiten.
- Docker-Images konnten hier nicht gebaut werden, da keine Docker-CLI verfügbar ist.

## Verbleibende Betriebsgrenzen

- Login-/Registrierungslimits und Aquarium-Doppelklickschutz sind pro Prozess. Mehrere Worker oder Instanzen benötigen für ein globales Limit eine gemeinsame Speicherung oder Begrenzung am Reverse Proxy. Die lokale Deduplizierung vergleicht alle normalisierten Aquariumdaten und bündelt gleichzeitig laufende Anlageanfragen; sie ist kein verteilter Idempotenzschlüssel.
- Mail-Queues liegen im Arbeitsspeicher. Neustarts verlieren wartende Mails; eine Datenbankreservierung garantiert keine tatsächliche SMTP-Zustellung. Dauerhafte Zustellung benötigt eine persistente Outbox mit Zustellstatus und Wiederholungen.
- Backup-/Restore-Sperren koordinieren nur eine Serviceinstanz. Bei mehreren Prozessen muss Restore in einem Wartungsfenster ohne parallele Schreibzugriffe erfolgen. MongoDB-Cascades und Exporte über mehrere Collections sind ohne Replica-Set-Transaktionen keine atomaren Gesamtsnapshots. Der GZIP-Grenzwert begrenzt das entpackte JSON, nicht den gesamten zusätzlichen Speicherbedarf beim Parsen und Importieren.
- Der Backend-Workerpool hat eine Queue-Grenze, aber keine individuelle Laufzeitgrenze für einen weiterhin lebenden, blockierten Thread. Die vorhandenen Aufgaben sind lokale, kontrollierte Hash-, Bildformat- und Statistikfunktionen. Ein späterer Task mit externen Abhängigkeiten braucht eine Deadline und Abbruchbehandlung.
- Service-Worker-Timer sind nicht dauerhaft zuverlässig: Browser können Hintergrundprozesse beenden. Verlässliche Benachrichtigungen bei geschlossener App brauchen serverseitige Planung und Web Push.
- Keine Langzeit-Heapmessung über mehrere Tage und kein produktionsnaher Belastungstest wurden durchgeführt. Die beseitigten Ressourcenprobleme beruhen auf konkreten Lebenszyklusfehlern und Regressionstests, nicht auf einer Garantie für alle Laufzeitbedingungen.
