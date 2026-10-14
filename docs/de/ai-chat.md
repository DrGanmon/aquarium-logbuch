# KI-Chat

[Handbuch](README.md) · [English](../en/ai-chat.md) · [Projektübersicht](../../README.md)

## Einrichtung und Nutzung

Wähle im Profil OpenAI, Google Gemini oder Anthropic Claude, hinterlege einen persönlichen API-Schlüssel und wähle ein Modell. Die Modellliste wird vom Anbieter geladen; ein Modellname kann auch frei eingegeben werden. Je nach Serverkonfiguration stehen globale Schlüssel und Standardmodelle als Fallback bereit. Ein Verbindungstest prüft den Zugang.

Der Chat öffnet sich in der Aquarium-Detailansicht. Schnellfragen helfen beim Einstieg. Auf Mobilgeräten nutzt der Dialog den verfügbaren Bildschirm und berücksichtigt die Bildschirmtastatur.

Gesendete Fragen erscheinen sofort im Verlauf. Während der Bearbeitung zeigt der Chat tatsächliche Server-Schritte und das Warten auf die KI-Antwort an. Diese Statusmeldungen sind keine internen Gedankengänge des Modells. Bei einem Fehler wird die Frage zur erneuten Bearbeitung ins Eingabefeld zurückgesetzt.

## Kontext und Verlauf

Der Server ergänzt die Anfrage um Aquariummaße, Volumen, Wassertyp, Technik, Besatz und die letzten zehn Messungen mit Bewertung und Trends. Der Aquarium-Chat wird pro Becken gespeichert. Ältere Gesprächsteile werden für den Modellkontext zusammengefasst; diese Zusammenfassung kann Details verlieren.

## Datenübertragung und Schlüssel

Eine aktive Chat-Anfrage übermittelt Nachrichten und Beckenkontext an den ausgewählten Anbieter. Persönliche Schlüssel werden mit AES-256-GCM verschlüsselt in SQLite bzw. MongoDB gespeichert. Zur Identifikation werden die ersten und letzten vier Zeichen separat gespeichert und als `abcd...wxyz` angezeigt; sehr kurze Schlüssel erscheinen als `***`. Bestehende Klartextschlüssel werden beim Start automatisch migriert (Datenbankschema 7). Schlüssel können im Profil gelöscht werden; dabei werden auch die Identifikationsfelder entfernt. Der Server entschlüsselt sie erst für Anbieteraufrufe. Neue Backups enthalten verschlüsselte Schlüssel, ältere Klartextbackups werden beim Restore verschlüsselt. Der ursprüngliche Verschlüsselungsschlüssel muss separat gesichert werden; siehe [Installation](installation.md#verschlüsselung-persönlicher-ki-schlüssel). Bereits vorhandene Archive werden nicht nachträglich umgeschrieben. Kosten, verfügbare Modelle und die Verarbeitung beim Anbieter hängen vom jeweiligen Konto und Anbieter ab.

## Chat nach einer Diagnose

Der optionale Chat nach dem Diagnose-Assistenten nutzt zusätzlich Antworten und Verdachtsdiagnosen. Er lädt und speichert keinen Aquarium-Chatverlauf; Nachrichten werden beim Schließen des Dialogs verworfen. Die Speicherregeln des externen Anbieters gelten weiterhin. Details stehen im [Gesundheitsmodul](health.md).
