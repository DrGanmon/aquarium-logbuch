# Rechtsseiten und Lizenzen

[Handbuch](README.md) · [English](../en/legal.md) · [Projektübersicht](../../README.md)

## Seiten und Betreiberangaben

Der Footer ist auch ohne Anmeldung erreichbar und verlinkt Impressum (`#/impressum`), AGB (`#/agb`), Datenschutz (`#/datenschutz`), Lizenzen (`#/lizenzen`) und Kontakt (`#/kontakt`). Die Seiten erläutern Konto- und Aquariendaten, Sitzungen, E-Mails, Logs sowie optionale KI-Dienste. Hinweise auf KI-gestützte Entwicklung und den Aquarium-Assistenten sind ebenfalls enthalten.

Betreiberangaben und Kontaktinformationen werden im Admin-Bereich gepflegt. `CONTACT_EMAIL` und `IMPRINT_EMAIL` setzen die jeweiligen Kontaktadressen; ohne eigene Werte greift die konfigurierte Administratoradresse als Fallback. Vor dem öffentlichen Betrieb die Angaben und Texte für die eigene Installation prüfen und vervollständigen.

## Software und Bilder

Die Software steht unter [CC BY-NC-SA 4.0](../../LICENSE). Nicht-kommerzielle Nutzung und Anpassung erfordern Namensnennung und dieselbe Lizenz für abgeleitete Werke. Kommerzielle Nutzung benötigt vorherige schriftliche Genehmigung.

Bibliotheken behalten ihre eigenen Lizenzen. Artenbilder stehen unter den im jeweiligen Bildnachweis angegebenen Lizenzen und fallen nicht pauschal unter die Softwarelizenz. Die Artendetails zeigen Urheber, Quelle, Lizenzlinks und Bearbeitungen; die vollständige Zuordnung liegt in `../../public/species-images/attribution.json`. Mehr dazu im [Artenmodul](species.md).

## AGB und Social-Bilder

Die Registrierung verlangt eine ausdrückliche Zustimmung zur aktuellen AGB-Fassung. Text und Version werden gemeinsam vom Server unter `/api/terms?language=de` bzw. `en` geliefert; die gespeicherte Fassung und der Zustimmungszeitpunkt bilden den Nachweis im Konto. Änderungen der rechtlichen Texte erfordern eine neue `TERMS_VERSION`. Das einfache, unentgeltliche Nutzungsrecht ist auf den App-Betrieb und die gewählte Sichtbarkeit begrenzt; Urheberrechte bleiben beim Nutzer. Werbung außerhalb der App, Verkauf und KI-Training sind ausgeschlossen. Details zu Sichtbarkeit, Bildlöschung und Backup-Aufbewahrung stehen im [Social-Handbuch](social.md). AGB-Zustimmung ersetzt keine Datenschutz-Einwilligung.
