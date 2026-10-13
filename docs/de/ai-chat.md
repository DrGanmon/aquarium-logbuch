# KI-Chat

[Handbuch](README.md) · [English](../en/ai-chat.md) · [Projektübersicht](../../README.md)

## Einrichtung und Nutzung

Wähle im Profil OpenAI, Google Gemini oder Anthropic Claude, hinterlege einen persönlichen API-Schlüssel und wähle ein Modell. Die Modellliste wird vom Anbieter geladen; ein Modellname kann auch frei eingegeben werden. Je nach Serverkonfiguration stehen globale Schlüssel und Standardmodelle als Fallback bereit. Ein Verbindungstest prüft den Zugang.

Der Chat öffnet sich in der Aquarium-Detailansicht. Schnellfragen helfen beim Einstieg. Auf Mobilgeräten nutzt der Dialog den verfügbaren Bildschirm und berücksichtigt die Bildschirmtastatur.

## Kontext und Verlauf

Der Server ergänzt die Anfrage um Aquariummaße, Volumen, Wassertyp, Technik, Besatz und die letzten zehn Messungen mit Bewertung und Trends. Der Aquarium-Chat wird pro Becken gespeichert. Ältere Gesprächsteile werden für den Modellkontext zusammengefasst; diese Zusammenfassung kann Details verlieren.

## Datenübertragung und Schlüssel

Eine aktive Chat-Anfrage übermittelt Nachrichten und Beckenkontext an den ausgewählten Anbieter. Die Schlüssel werden in der Datenbank gespeichert und in der Oberfläche maskiert; sie können im Profil gelöscht werden. Maskierung ist keine Verschlüsselung der Datenbank. Die Konfiguration und Sicherungen müssen entsprechend geschützt werden. Kosten, verfügbare Modelle und die Verarbeitung beim Anbieter hängen vom jeweiligen Konto und Anbieter ab.

## Chat nach einer Diagnose

Der optionale Chat nach dem Diagnose-Assistenten nutzt zusätzlich Antworten und Verdachtsdiagnosen. Er lädt und speichert keinen Aquarium-Chatverlauf; Nachrichten werden beim Schließen des Dialogs verworfen. Die Speicherregeln des externen Anbieters gelten weiterhin. Details stehen im [Gesundheitsmodul](health.md).
