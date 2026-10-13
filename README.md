<p align="center">
  <img src="public/icon-192.png" alt="Aquarium-Logbuch Logo" width="96" height="96">
</p>

# Aquarium-Logbuch

Aquarium-Logbuch ist eine selbst gehostete Web-App für Wasserwerte, Besatz und Aquarienpflege. Sie verbindet Messverläufe, Pflegeprotokolle und Erinnerungen und unterstützt mehrere Benutzer mit getrennten oder geteilten Aquarien. Ein Artenkatalog, ein Diagnose-Assistent und ein optionaler KI-Chat ergänzen die Verwaltung von Süß- und Meerwasserbecken.

**Deutsch** · [English](README.en.md) · [Handbuch](docs/de/README.md)

## Transparenzhinweis: KI-generierte Software

**Diese App wurde mithilfe generativer KI geschrieben und weiterentwickelt.** Quellcode und Dokumentation enthalten KI-generierte Inhalte. Dieser Hinweis dient der freiwilligen Transparenz in Anlehnung an [Artikel 50 des EU AI Act (Verordnung (EU) 2024/1689)](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50); er ist keine Erklärung vollständiger Rechtskonformität. Aus der KI-gestützten Entwicklung allein folgt keine pauschale Kennzeichnungspflicht für jede Software.

Im optionalen KI-Chat interagierst du mit einem KI-System; dessen Antworten sind automatisch generiert und können fehlerhaft oder unvollständig sein. Prüfe Empfehlungen vor der Anwendung. Wasserwertbewertungen und Verdachtsdiagnosen ersetzen keine fachliche oder tierärztliche Untersuchung. Beim Absenden einer Chat-Anfrage werden Nachrichten und Aquariumkontext an den ausgewählten KI-Anbieter übermittelt; Details stehen im [KI-Handbuch](docs/de/ai-chat.md).

## Features für Benutzer

- **Aquarien verwalten:** Stammdaten, Einrichtung, Fotos, Galerie und benannte Bewohner mit Porträts.
- **Wasserwerte erfassen:** 15 Parameter, frei kombinierbare Tests aus mehreren Suiten, Live-Bewertung und mehrere Reaktionstimer.
- **Verlauf auswerten:** Diagramme mit freier Zeitraumauswahl, Warnungen und bestätigbare Alarme.
- **Pflege dokumentieren:** Logbuch für Wasserwechsel, Filterpflege, Pflanzen, Düngung und weitere Aktivitäten.
- **Pflege planen:** Unabhängige Mess- und Düngzyklen mit optionalen E-Mail-Erinnerungen; Dosierpumpenpläne mit manueller Protokollierung.
- **Wassertest-Verbrauch verfolgen:** Automatische Zählung, korrigierbare Füllmengen und Nachkauferinnerung ab 75 % Verbrauch.
- **Besatz prüfen:** Artenkatalog mit Haltungsanforderungen, Bildern und Hinweisen zu Gruppen, Beckengröße und Verträglichkeit.
- **Gesundheit einschätzen:** Krankheitskatalog, Diagnose-Assistent und Medikamente/Hilfsmittel mit Quellen, Rechtsstatus und Warnhinweisen.
- **KI-Assistent nutzen:** Optionaler Aquarium-Chat mit OpenAI, Google Gemini oder Anthropic Claude und persönlichem API-Schlüssel.
- **Daten mitnehmen und teilen:** CSV-Import mit Spaltenzuordnung, Excel-kompatibler CSV-Export und Aquariumfreigaben mit Lese- oder Schreibzugriff.
- **Konto anpassen:** Profil, Avatar, Passwortverwaltung, lokale Anmeldung oder Pocket ID/OIDC und Einladungen.
- **Mobil verwenden:** Deutsch/Englisch, helles/dunkles/systemabhängiges Design, Homescreen-Installation und Timer-Benachrichtigungen.
- **Aktuell bleiben:** Popup bei neuerer Frontend-Version mit Angebot zum Neuladen.

## Technische Features

- Vue 3, Vite und TypeScript im Frontend; Express und TypeScript im Backend.
- Node.js ab **22.12** oder Bun ab **1.4.3**; SQLite oder MongoDB.
- Web Worker für rechenintensive Frontend-Aufgaben, Backend-Threadpool und optional mehrere Serverprozesse mit Supervisor.
- Abschnittsweises Nachladen von Aquariumdetails und abbrechbare Datenanfragen.
- Gemeinsamer Artenkatalog für Besatz und Gesundheit; JSON-Daten für Krankheiten, Medikamente und Testsuiten; deutsche und englische Sprachdateien.
- SMTP-Warteschlange mit anpassbaren E-Mail-Vorlagen und Testversand.
- Admin-Bereich für Benutzer, Registrierung, Einstellungen, Backups und Logs.
- Datenbankmigrationen, manuelle/automatische Sicherungen und Wiederherstellung inklusive Uploads.
- Docker-Images für AMD64/ARM64; Compose-Vorlagen für SQLite und MongoDB.
- Automatische Versionsberechnung aus Commit-Typen, Typprüfung und Tests für beide Datenbankadapter und Runtimes.

## Schnellstart

Mit Node.js und SQLite:

```bash
npm ci
npm run dist
npm start
```

Die App läuft unter `http://localhost:3000`. Für Entwicklung mit Hot Reload zusätzlich `npm run dev` in einem zweiten Terminal starten. Bun, Docker, SMTP, OIDC und alle Umgebungsvariablen sind unter [Installation und Konfiguration](docs/de/installation.md) beschrieben. [example.env](example.env) dient als Konfigurationsvorlage; passe insbesondere öffentliche URL, Administratoradresse und Datenbankzugang an.

Mit Docker Compose und MongoDB:

```bash
docker compose pull
docker compose up -d
```

Für SQLite stattdessen `docker compose -f docker-compose.sqlite.yml up -d` verwenden. Vorher die jeweilige Compose-Konfiguration anpassen.

## Dokumentation

- [Handbuch und Modulübersicht](docs/de/README.md): Bedienung, Funktionsweisen und Konfiguration.
- [Entwicklung und Architektur](docs/de/architecture.md): Quellstruktur, Build, Worker und Tests.
- [Versionen und Commit-Standard](docs/de/versioning.md): `feat(bereich): …` erhöht die Revision, `fix(bereich): …` den Patch; andere Typen verändern die Version nicht.
- [Administration und Backups](docs/de/administration.md): Benutzerverwaltung, SMTP, Sicherungen und Wiederherstellung.
- [Codeprüfung und Betriebsgrenzen](AUDIT.md).

## Grenzen und Ausblick

Grenzwerte und Verdachtsdiagnosen sind Orientierungshilfen und ersetzen keine fachliche Untersuchung. Timer-Benachrichtigungen hängen von Browser und Betriebssystem ab; die App bietet keinen vollständigen Offline-Modus. Dosierpumpenpläne steuern keine Hardware. Automatische E-Mails bei kritischen Grenzwert-Alarmen und ein Social-Bereich sind geplant.

## Lizenz

[CC BY-NC-SA 4.0](LICENSE): nicht-kommerzielle Nutzung mit Namensnennung; abgeleitete Werke unter derselben Lizenz. Kommerzielle Nutzung benötigt die vorherige schriftliche Genehmigung des Urhebers. Bibliotheken und Artenbilder behalten ihre eigenen Lizenzen und Bildnachweise.
