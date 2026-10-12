# Aquarium-Bilddatenbank

Erzeugt für alle Arten aus `data/*.json` (Süßwasser, Buntbarsche, Wirbellose, Meerwasser – 148 eindeutige IDs) je ein Bild aus Wikipedia bzw. Wikimedia Commons, inklusive Urheber- und Lizenzangaben.

## Welche Bilder übernommen werden

Zugelassen sind nur Bilder, die alle drei Nutzungen erlauben: **Weiterverbreitung** (z. B. im GitHub-Repo oder in der App ausgeliefert), **Nutzung in einer App** und **kommerzielle Nutzung**. Pro Art werden alle gefundenen Kandidaten geprüft und in dieser Rangfolge gewählt:

| Rang | Lizenz | Pflichten |
|---|---|---|
| 1 | Gemeinfrei (Public Domain) oder CC0 | keine; Urheber und Quelle werden trotzdem gespeichert |
| 2 | CC BY (alle Versionen) | Namensnennung |
| 3 | CC BY-SA (alle Versionen), abschaltbar mit `--no-sharealike` | Namensnennung; bearbeitete Fassungen unter gleicher Lizenz weitergeben |

Gemeinfreie Bilder werden immer zuerst gesucht: über die Leitbilder der Wikipedia-Artikel und zusätzlich über eine gezielte Commons-Suche nach Dateien mit dem Status „gemeinfrei“ bzw. CC0. Erst wenn keines davon passt, kommen CC BY und danach CC BY-SA zum Zug. Innerhalb einer Stufe wird das Wikipedia-Leitbild einem Suchtreffer vorgezogen.

Abgelehnt werden:

- CC-Lizenzen mit NC (nicht kommerziell) oder ND (keine Bearbeitung)
- GFDL, Free Art License, Fair Use und andere Nicht-CC-Lizenzen
- Bilder, die nur in den USA gemeinfrei sind (Vorlagen wie `PD-US-expired`, `PD-US-no notice`, `PD-1996`). Sie sind in Deutschland bzw. der EU nicht sicher frei.
- Bilder ohne benannten Urheber (fehlend, „unbekannt“, anonym)
- Karten, historische Zeichnungen, SVGs, Bilder unter 400 px Breite und Commons-Suchtreffer unter 800 px

Bei gemeinfreien Bildern wird die PD-Vorlage auf der Dateiseite ausgelesen und als `publicDomainBasis` gespeichert. Weltweit tragfähige Grundlagen wie `PD-self`, `PD-author`, `PD-old` oder `PD-USGov` gelten als geprüft; jede andere Grundlage wird zur Sichtprüfung markiert.

## Voraussetzungen

Python 3.9 oder neuer, keine weiteren Pakete. Der Rechner braucht Zugriff auf `*.wikipedia.org`, `commons.wikimedia.org` und `upload.wikimedia.org`.

## Ausführen

```bash
python3 build_image_db.py --contact admin@example.org --download
```

`--contact` ist Pflicht: Wikimedia verlangt einen aussagekräftigen User-Agent mit Kontaktmöglichkeit. Ein Lauf über alle Arten dauert wenige Minuten (Pause 0,3 s je Anfrage).

| Option | Wirkung |
|---|---|
| `--download` | Vorschaubilder nach `out/images/<id>.jpg` speichern |
| `--width 800` | Breite der Vorschaubilder in Pixeln |
| `--only id1 id2` | nur diese Arten (neu) bearbeiten |
| `--refresh` | auch bereits gefundene Bilder neu suchen |
| `--reject id1 id2` | aktuelles Bild dieser Arten ausschließen und das nächstbeste suchen |
| `--serve` | Review-Server starten (siehe unten), mit `--host` und `--port` (Standard `127.0.0.1:8765`) |
| `--review-only` | nur `review.html` und `attribution.csv` aus dem vorhandenen `out/images.json` neu erzeugen, ohne Anfragen an Wikimedia |
| `--no-sharealike` | CC BY-SA ausschließen |
| `--data`, `--out`, `--overrides` | abweichende Pfade |

Erneute Läufe übernehmen Arten mit Status `ok` oder `manual` aus dem vorhandenen `out/images.json` und bearbeiten nur den Rest.

## Ablauf der Bildsuche

1. Feste Datei aus `overrides.json` (`file`), falls gesetzt
2. Leitbild der Wikipedia-Artikel (englisch, dann deutsch) zu den Titeln aus `overrides.json`, dem wissenschaftlichen Namen und den Synonymen aus der Beschreibung (z. B. „Syn. Corydoras aeneus“)
3. Commons-Suche (`commonsSearch` aus den Overrides oder wissenschaftlicher Name)
4. Leitbild des Gattungsartikels

Treffer aus Schritt 3 und 4 sowie alle Arten mit `"review": true` werden zur Sichtprüfung markiert.

## Ergebnis prüfen

`out/review.html` im Browser öffnen (nicht `templates/review.html`, das ist nur die leere Vorlage). Die Karten stehen direkt im HTML und sind auch ohne JavaScript sichtbar; JavaScript wird nur für die Filter gebraucht. Die Galerie zeigt alle Arten mit Fotograf, Quelle, Lizenz und Suchprotokoll, filterbar nach Status, Sammlung und Name. `out/attribution.csv` enthält alle Arten mit Urheber, Lizenz, Quelle und fertiger Namensnennung, z. B. für ein Impressum oder eine Bildnachweis-Seite.

Status:

- `ok` – Leitbild eines passenden Wikipedia-Artikels, Lizenz eindeutig
- `manual` – feste Datei aus `overrides.json`
- `review` – bitte ansehen; der Grund steht in `reviewReasons` (z. B. Commons-Suchtreffer, ungewöhnliche PD-Grundlage, Zuchtform)
- `missing` – kein passendes Bild gefunden; die Ablehnungsgründe stehen im Suchprotokoll

Weil gemeinfreie Bilder Vorrang haben, ersetzt ein gemeinfreier Suchtreffer ein CC-lizenziertes Leitbild. Solche Treffer stehen immer auf `review`, da Suchergebnisse auch die falsche Art zeigen können. Gefällt dir in einem solchen Fall das CC-Leitbild besser, trage es als `file` in `overrides.json` ein.

### Review-Server: Bilder im Browser auswählen

```bash
python3 build_image_db.py --contact admin@example.org --serve
```

Dann `http://localhost:8765/` öffnen. Jede Karte hat drei Knöpfe:

- **Alternativen:** zeigt alle zulässigen Bilder der Art mit Vorschau, Lizenzstufe, Lizenz, Fotograf und Quelle, sortiert nach Lizenz (gemeinfrei zuerst). Abgelehnte Kandidaten stehen mit Grund darunter. Über das Suchfeld im Dialog lässt sich eine eigene Commons-Suche starten, z. B. „black molly“. „Dieses Bild wählen“ übernimmt ein Bild.
- **Neues Bild:** verwirft das aktuelle Bild und wählt automatisch das nächstbeste (wie `--reject`).
- **Passt:** bestätigt das aktuelle Bild.

Jede Aktion prüft das Bild erneut gegen die Lizenzregeln, speichert die Wahl in `overrides.json` (`file` bzw. `exclude`), lädt das lokale Vorschaubild und aktualisiert sofort `images.json`, `attribution.csv` und die statische `review.html`. Ausgeschlossene Bilder erscheinen in den Alternativen markiert und lassen sich mit „Trotzdem wählen“ zurückholen.

Arten, die noch nie gesucht wurden, erscheinen ebenfalls und lassen sich über „Alternativen“ befüllen. Eine Suche dauert je nach Anzahl der Kandidaten einige Sekunden.

Der Server lauscht standardmäßig nur auf `127.0.0.1` und hat keine Anmeldung. Läuft das Skript auf einem anderen Rechner, besser per SSH-Tunnel zugreifen statt `--host 0.0.0.0`:

```bash
ssh -L 8765:localhost:8765 user@server
```

### Ein anderes Bild suchen lassen

Ein erneuter Lauf allein liefert dasselbe Bild, weil die Suche deterministisch ist. Für ein anderes Bild gibt es drei Wege:

**1. Aktuelles Bild verwerfen, nächstbestes nehmen** (der übliche Weg):

```bash
python3 build_image_db.py --contact admin@example.org --download --reject betta-splendens
```

Das trägt die aktuelle Datei in `overrides.json` unter `exclude` ein und sucht diese Art neu. Mehrere IDs gehen auf einmal (`--reject id1 id2`), wiederholtes Verwerfen geht die Kandidaten der Reihe nach durch. Das nächstbeste Bild kann eine schwächere Lizenzstufe haben; gibt es keinen Kandidaten mehr, steht die Art auf `missing`.

**2. Andere Suchbegriffe vorgeben**, wenn die Kandidaten generell schlecht sind, z. B. nur Wildform statt Zuchtform:

```json
"poecilia-sphenops": { "commonsSearch": "black molly aquarium", "titles": ["Black molly"] }
```

**3. Eine bestimmte Datei festlegen**, die du auf Commons gefunden hast:

```json
"poecilia-sphenops": { "file": "File:Beispiel Black Molly.jpg" }
```

Bei Weg 2 und 3 danach nur diese Art neu suchen:

```bash
python3 build_image_db.py --contact admin@example.org --download --only poecilia-sphenops --refresh
```

Auch eine festgelegte Datei muss die Lizenzregeln erfüllen, sonst wird sie abgelehnt und im Suchprotokoll begründet. Ausschlüsse entfernst du, indem du die Datei aus der `exclude`-Liste in `overrides.json` löschst.

## Ausgabeformat `out/images.json`

```json
{
  "generated": "2026-10-12T10:00:00+00:00",
  "source": "Wikipedia/Wikimedia Commons",
  "licensePolicy": "Rangfolge: gemeinfrei/CC0 > CC BY > CC BY-SA; nur Lizenzen mit Weiterverbreitung, App-Nutzung und kommerzieller Nutzung",
  "count": 148,
  "images": [
    {
      "id": "betta-splendens",
      "name": "Siamesischer Kampffisch",
      "scientificName": "Betta splendens",
      "collections": ["freshwater-popular"],
      "status": "ok",
      "matchedVia": "Wikipedia en: Betta splendens",
      "file": "File:….jpg",
      "title": "…",
      "author": "Name des Fotografen",
      "authorUrl": "https://commons.wikimedia.org/wiki/User:…",
      "requiredAttribution": "",
      "source": "Wikimedia Commons",
      "sourceUrl": "https://commons.wikimedia.org/wiki/File:….jpg",
      "originalSource": "Own work",
      "originalSourceUrl": "",
      "license": "CC BY-SA 4.0",
      "licenseCode": "cc-by-sa-4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
      "licenseTier": "cc-by-sa",
      "publicDomainBasis": "nur bei gemeinfreien Bildern, z. B. PD-self",
      "shareAlike": true,
      "usage": { "redistribution": true, "appUse": true, "commercialUse": true },
      "reviewReasons": [],
      "modifications": "verkleinert auf 800 px Breite",
      "attribution": "„…“ von Name des Fotografen, Quelle: Wikimedia Commons (https://commons.wikimedia.org/wiki/File:….jpg), Lizenz: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); verkleinert auf 800 px Breite",
      "attributionHtml": "<a href=\"…\">„…“</a> von <a href=\"…\">Name des Fotografen</a>, Quelle: Wikimedia Commons, Lizenz: <a href=\"…\">CC BY-SA 4.0</a>; verkleinert auf 800 px Breite",
      "imageUrl": "https://upload.wikimedia.org/…",
      "thumbUrl": "https://upload.wikimedia.org/…/800px-….jpg",
      "width": 3000,
      "height": 2000,
      "localPath": "images/betta-splendens.jpg",
      "log": []
    }
  ]
}
```

Felder zur Herkunft:

- `author`, `authorUrl`: wer das Foto gemacht hat (Link meist auf die Commons-Benutzerseite oder Flickr)
- `requiredAttribution`: vom Urheber ausdrücklich gewünschte Namensnennung; hat Vorrang vor `author`
- `source`, `sourceUrl`: woher das Bild stammt (Dateiseite auf Wikimedia Commons)
- `originalSource`, `originalSourceUrl`: ursprüngliche Quelle laut Commons, z. B. „Own work“ oder ein Flickr-Link
- `attribution`, `attributionHtml`: fertige Namensnennung nach dem TASL-Schema (Titel, Urheber, Quelle, Lizenz) inklusive Hinweis auf die Verkleinerung; bei gemeinfreien Bildern mit PD-Grundlage
- `licenseTier`: `public-domain`, `cc-by` oder `cc-by-sa`; in der Galerie gibt es dafür einen Filter

```

Die Verknüpfung zu den Artendateien läuft über `id`. Arten, die in mehreren Dateien vorkommen (z. B. Skalar in `freshwater-popular` und `cichlids`), erhalten einen gemeinsamen Eintrag mit beiden Sammlungen in `collections`.

## Lizenzen in der App und im Repository

- **Gemeinfrei/CC0:** keine Pflichten. Die gespeicherte Namensnennung trotzdem anzeigen ist guter Stil und hilft bei Rückfragen.
- **CC BY:** In der App bzw. im Repo zu jedem Bild `attribution` anzeigen (Bildunterschrift, Info-Dialog oder Bildnachweis-Seite). Für das Repo reicht eine Datei wie `attribution.csv` oder eine daraus erzeugte `CREDITS.md` neben den Bildern.
- **CC BY-SA:** wie CC BY. Zusätzlich müssen bearbeitete Fassungen (Zuschnitt, Filter, Montage) wieder unter CC BY-SA stehen. Der restliche App-Code ist davon nicht betroffen. Wer das ganz vermeiden will, baut mit `--no-sharealike`; dann fehlen mehr Arten.
- **Prüfen vor Veröffentlichung:** Die Lizenzangaben stammen aus den Commons-Metadaten. Vor einem Release lohnt ein Stichproben-Abgleich mit den Dateiseiten, vor allem bei Einträgen mit `reviewReasons` oder `restrictions` (z. B. Persönlichkeitsrechte).
- **Lokal ausliefern:** Die Kopien aus `--download` gehören ins Repo bzw. die App, statt direkt auf `upload.wikimedia.org` zu verlinken.

Ein `out/images.json` aus einer älteren Version ohne Lizenzrangfolge wird beim nächsten Lauf automatisch neu geprüft.
