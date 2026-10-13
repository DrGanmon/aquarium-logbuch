# Aquarien, Pflege und Freigaben

[Handbuch](README.md) · [English](../en/aquariums.md) · [Projektübersicht](../../README.md)

## Aquarium anlegen und organisieren

In der Übersicht sind eigene und angenommene geteilte Aquarien getrennt. Ein Aquarium besitzt Name, Motto, Beschreibung, Wassertyp, Volumen, Notizen und Angaben zur Einrichtung. Bilder bis 5 MB (PNG, JPG, WebP, GIF) lassen sich hochladen, beschriften und als Titelbild auswählen; die Galerie bietet eine Großansicht.

Bewohner werden als Einzeltiere oder Gruppen mit Anzahl erfasst. Eigene Namen und Porträtfotos sind möglich. Arten aus dem Katalog bringen ihre Haltungsanforderungen mit; freie Einträge können ohne Katalogzuordnung angelegt werden.

## Pflegezyklen und Logbuch

Messung und Düngung haben getrennte Intervalle in Tagen oder Wochen, optional mit festem Wochentag. Übersicht und Detailansicht zeigen fällige und überfällige Aktivitäten. Bei aktivierten Erinnerungen und eingerichtetem SMTP versendet die App Erinnerungs-E-Mails mit Aktionslink.

Wasserwechsel, Filterreinigung, Filtermedienwechsel, Pflanzenschnitt, neue Pflanzen, Scheiben- und Bodengrundpflege, Düngung und Spezialfütterung werden im Logbuch erfasst. Die Timeline verbindet Aktivitäten mit Messungen und lässt sich nach Kategorie filtern. Weitere Einträge werden in Gruppen von 25 geladen.

## Dosierpumpen und Kanäle

Pro Pumpe oder Kanal werden Name, Flüssigkeit, Menge in ml, Tagesintervall und optionale Uhrzeit gespeichert. Pläne lassen sich aktivieren oder pausieren. Eine Dosierung wird manuell bestätigt und zum aktuellen Zeitpunkt als Logbucheintrag gespeichert. Es gibt keine Hardwaresteuerung. Beim Löschen einer Pumpe bleiben ihre bisherigen Logbucheinträge erhalten.

## Aquarium teilen

Freigaben richten sich an registrierte Benutzer. Die Einladung wird per E-Mail oder in „Mit mir geteilte Aquarien“ angenommen; erst danach ist der Zugriff möglich.

| Berechtigung | Möglichkeiten |
|---|---|
| Lesen (`view`) | Messungen, Diagramme, Bewohner, Logbuch, Bilder und Alarme ansehen |
| Schreiben (`write`) | Zusätzlich Messungen und Pflegeaktivitäten bearbeiten, Besatz und Bilder verwalten sowie Alarme bestätigen |

Eigentümer verwalten die Freigaben. Der Server prüft die Berechtigungen auch für einzelne nachgeladene Bereiche.

## Laden der Detailansicht

Beim Öffnen eines Aquariums werden Stammdaten, Pflegezyklen, aktuelle Messwerte und Warnungen sofort geladen. Galerie, Verlauf, Bewohner, Dosierpumpen und Logbuch werden nachgeladen, sobald ihr Abschnitt beim Scrollen in die Nähe des sichtbaren Bereichs kommt. Verlauf und Messwerttabelle teilen ihre Datenabfrage. Bereits geladene Abschnitte bleiben verfügbar; nach Änderungen werden die Übersicht und die bereits aktivierten Bereiche aktualisiert.

Dosierpumpen werden pro Pumpe oder Kanal mit Flüssigkeit, Menge pro Dosierung, Tagesintervall und optionaler Uhrzeit eingerichtet. Der Plan kann aktiv oder pausiert sein. „Dosierung eintragen“ bestätigt eine bereits erfolgte Dosierung und speichert sie zum aktuellen Zeitpunkt im Logbuch; die App steuert keine Hardware. Beim Löschen einer Pumpe bleiben vorhandene Logbucheinträge erhalten.

- Fehlgeschlagene Abschnitte lassen sich einzeln erneut laden. Überholte Anfragen, etwa nach einem Zeitraumwechsel, und Anfragen beim Verlassen der Ansicht werden abgebrochen.
- Das Logbuch lädt weiterhin jeweils 25 Einträge über „Weitere laden“ nach.
- Bei bekannten Bewohnerarten öffnet **Artendetails** die Katalogansicht mit Bild, Wasseranforderungen, Haltung und Bildnachweis direkt als Modal. Die Schaltfläche ist auch mit reinem Lesezugriff verfügbar. Freie Arten ohne Katalogtreffer erhalten einen entsprechenden Hinweis.
- Die API unterstützt eine kompakte Übersicht über `GET /api/aquariums/:id?summary=true` und das getrennte Nachladen über `GET /api/aquariums/:id/stock`. Ohne `summary=true` bleibt die bisherige vollständige Detailantwort erhalten. Die bisherigen Zugriffsrechte gelten auch für die neuen Abfragen.
- Browser ohne `IntersectionObserver` laden die Bereiche automatisch ohne Scroll-Erkennung.
