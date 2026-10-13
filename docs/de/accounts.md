# Konten, Anmeldung und Einladungen

[Handbuch](README.md) · [English](../en/accounts.md) · [Projektübersicht](../../README.md)

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

## Registrierung und Darstellung

Die Administration wählt zwischen offener Registrierung, Einladungen nur durch Administratoren, Einladungen durch alle Benutzer und geschlossener Registrierung. `ALLOW_REGISTRATION=false` sperrt neue Konten auch beim ersten OIDC-Login. Einladungscodes haben eine Gültigkeitsdauer und ein Verwendungslimit; E-Mail-Einladungen sind zeitlich begrenzt. SMTP muss für Bestätigung, Passwort-Reset und E-Mail-Einladungen eingerichtet sein.

Sprache und Erscheinungsbild lassen sich in der Kopfzeile und im Profil ändern. Deutsch und Englisch sowie helles, dunkles und systemabhängiges Farbschema stehen zur Verfügung; Diagramme passen sich an das aktive Farbschema an.

Neue Konten benötigen eine ausdrückliche AGB-Zustimmung, auch bei der ersten OIDC-Anmeldung. Die Checkbox ist nicht vorausgewählt; AGB und Datenschutz sind öffentlich im Footer verlinkt. Bestehende Konten behalten ihren Zugang und akzeptieren die aktuellen Bedingungen vor dem ersten neuen Social-Beitrag. Kontolöschung bereinigt zusätzlich Social-Inhalte und zugehörige Bilder in lokalen JSON-Backups; externe Sicherungen sind durch den Betreiber gesondert zu verwalten. [Details](social.md).
