# Aquarium-Logbuch

Mehrbenutzer-Webanwendung für Aquarien-Wasserwerte. Node.js (ab Version 22), Express und SQLite, ohne externe Dienste.

## Funktionen

- Registrierung und Anmeldung, jeder Benutzer sieht nur seine eigenen Aquarien
- Aquarien anlegen (Name, Süß- oder Meerwasser, Volumen, Erinnerungsintervall)
- Besatz pro Becken eintragen. Die Fischarten bestimmen die Grenzwerte
  (Weichwasser, Hartwasser, Garnelen und Wirbellose). Passt der Besatz bei einem Wert nicht zusammen,
  zeigt die App einen Hinweis.
- Messmaske für 15 Parameter mit Timer pro Test (mehrere gleichzeitig, Ton und Vibration bei Ablauf,
  Bildschirm bleibt während der Timer an, wenn der Browser das erlaubt)
- Live-Bewertung beim Tippen, Eingabe mit Komma möglich
- Graphen pro Parameter (7 Tage bis alles) mit Zielbereich und kritischen Grenzen
- Warnungen (auffällig) und Alarme (kritisch) mit Handlungshinweis, zum Abhaken
- Erinnerung, wenn die letzte Messung länger her ist als eingestellt

## Starten

```bash
npm ci --omit=dev    # braucht Node 22 oder neuer, es wird nichts kompiliert
npm start            # http://localhost:3000
```

Oder mit Docker:

```bash
docker compose up -d --build
```

Die Datenbank liegt in `data/aquarium.db` (Docker: Volume `/data`).

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | 3000 | Port |
| `DATA_DIR` | `./data` | Ordner der SQLite-Datei |
| `ALLOW_REGISTRATION` | true | `false` sperrt neue Konten |
| `COOKIE_SECURE` | false | `true`, wenn die App hinter HTTPS läuft |
| `TRUST_PROXY` | (aus) | `1`, wenn genau ein Reverse Proxy davorsteht |

## Wartezeiten und Grenzwerte prüfen

Alles steht in `config.js`.

- **Wartezeiten:** Nur Kalium (30 s schwenken + 1 min stehen lassen = 90 s) wurde gegen die JBL-Anleitung
  geprüft. Alle anderen Zeiten sind Startwerte und in der App mit einem Hinweis markiert.
  Bitte mit der Packungsbeilage deiner Tests abgleichen und `wait` (Sekunden) anpassen,
  danach `verified: true` setzen.
- **Grenzwerte:** Richtwerte für Süß- und Meerwasser. Prüfe sie für dein Becken und passe sie an.
  Die App ersetzt keine Beratung durch Fachleute.

## Betrieb

- **HTTPS:** Hinter einen Reverse Proxy (Caddy, nginx, Traefik) stellen und `COOKIE_SECURE=true` sowie `TRUST_PROXY=1` setzen.
- **Backup:** `sqlite3 data/aquarium.db ".backup backup.db"` (die Datenbank läuft im WAL-Modus,
  daher nicht einfach nur die .db-Datei kopieren).
- **Passwörter** werden mit scrypt gehasht, Sitzungen als Hash in der Datenbank gespeichert.

## Bekannte Grenzen

- Alarme erscheinen in der App. E-Mail oder Push-Benachrichtigungen gibt es noch nicht.
- Kein Passwort-Zurücksetzen per E-Mail. Ein vergessenes Passwort lässt sich nur direkt in der Datenbank ersetzen.
