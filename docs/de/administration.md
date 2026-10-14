# Administration, E-Mail und Backups

[Handbuch](README.md) · [English](../en/administration.md) · [Projektübersicht](../../README.md)

Die Admin-Ansicht ist in fünf Tabs gegliedert: **Userverwaltung**, **Einladung & Registrierung** (Registrierungsmodi, Gültigkeiten, Einladungscodes und E-Mail-Einladungen), **Einstellungen** (Rechtliches sowie E-Mail/SMTP inklusive Testmail und Warteschlange), **Backups** und **Logs**.

Für die erste lokale Administratorregistrierung muss der Mailversand bereits über `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` und `SMTP_FROM` eingerichtet sein, damit die Adresse bestätigt werden kann. Bei bestehenden unbestätigten Konten lässt sich der Bestätigungslink erneut anfordern.

Der Administrator wird anhand der bestätigten E-Mail-Adresse festgelegt. Dazu entweder in `../../config.ts` oder über die Umgebungsvariable `ADMIN_EMAIL` die gewünschte E-Mail-Adresse hinterlegen (z. B. `ADMIN_EMAIL=admin@example.com` bzw. kommagetrennt für mehrere).

- Benutzer erhalten Administratorrechte erst mit einer bestätigten E-Mail-Adresse, die mit `ADMIN_EMAIL` übereinstimmt. Das gilt auch nach Änderungen der Profiladresse. OIDC muss dafür `email_verified: true` liefern. E-Mail-Einladungen eines bereits bestätigten Administrators gelten als ausdrücklich freigegebene Konten; Einladungen anderer Benutzer erfordern eine zusätzliche E-Mail-Bestätigung.
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
- **System-Logbuch:** Die neuesten 200 Zeilen erscheinen zunächst am unteren Ende. Die Anzahl pro Ladeabschnitt ist zwischen 10 und 1000 einstellbar. Ältere Einträge werden beim Hochscrollen oder per Schaltfläche nachgeladen; die Leseposition bleibt erhalten. Level- und Suchfilter gelten serverseitig über den gesamten Verlauf. Automatische Aktualisierung erfolgt nur am unteren Ende. Bereinigung der Server- und Fehlerprotokolle (`../../data/aquarium.log`).

## E-Mail-Vorlagen und Versand

Die Standardvorlagen liegen unter `../../src/templates/mail` und werden in den Backend-Build kopiert. Eigene Vorlagen liegen unter `data/mail-templates/`. Deutsch und Englisch verwenden getrennte `.tpl`-Dateien. Platzhalter wie `{{username}}`, `{{verifyUrl}}` und `{{resetUrl}}` werden beim Versand ersetzt.

Eine FIFO-Warteschlange begrenzt den Versand über `SMTP_RATE_LIMIT_MS`. SMTP lässt sich über Umgebungsvariablen oder die Admin-Oberfläche einrichten; dort sind auch Testversand und Warteschlangenstatus verfügbar.

Backups enthalten sensible Konto- und Konfigurationsdaten sowie Uploads und gehören in einen geschützten Speicher. Vor einer Wiederherstellung ein aktuelles Backup anlegen. Die Wiederherstellung ersetzt den Datenbestand; ältere Sicherungen werden auf das aktuelle Schema angepasst. Automatische Sicherungen bleiben lokal und ersetzen keine externe Sicherung.

Bei Kontolöschung werden Bilddaten und zugehörige Social-Inhalte aus den verwalteten lokalen `.json.gz`-Backups entfernt. Während Backup/Restore wird die Kontolöschung mit einem Hinweis auf erneute Bestätigung zurückgestellt. Für sonstige Sicherungsdaten sowie externe oder heruntergeladene Backups ist ein eigenes Aufbewahrungs- und Löschkonzept erforderlich. [Details](social.md).
