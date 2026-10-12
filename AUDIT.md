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
