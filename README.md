# Aquarium-Logbuch

Mehrbenutzer-Webanwendung für Aquarien-Wasserwerte. Node.js (ab Version 22), Express und SQLite.
Anmeldung wahlweise lokal mit Passwort oder per OAuth 2.0 / OpenID Connect gegen [Pocket ID](https://pocket-id.org).

## Funktionen

- Anmeldung über Pocket ID (OIDC) oder lokal mit Registrierung
- Benutzerprofil zur Pflege von Profilbild (Avatar), Vorname, Nachname, Benutzername und „Über mich“-Bio sowie Passwortverwaltung und OIDC-Verknüpfung
- Admin-Bereich mit Benutzerverwaltung für Administratoren (festgelegt anhand der E-Mail-Adresse in der Konfiguration)
- Aquarien anlegen (Name, Süß- oder Meerwasser, Volumen, Erinnerungsintervall, Notizen)
- Bild vom Aquarium hochladen (PNG, JPG, WebP, GIF), das in der Aquarienliste und auf der Detailseite dargestellt wird
- **Aquarium-Logbuch & Aktivitäten-Timeline:** Lückenloses, chronologisches Protokoll über alle Arbeiten und Ereignisse am Aquarium:
  - **Wasserwechsel:** Erfassung mit prozentualer Angabe (z. B. 30 %, 50 %) und Details zur Wasseraufbereitung.
  - **Filterpflege:** Filterwechsel (mit Angabe der getauschten Medien wie Filtervlies, Aktivkohle, Schwämme) und Filterreinigung.
  - **Pflanzen & Gärtnern:** Dokumentation von Pflanzenschnitten/Rückschnitt sowie neu eingesetzten Pflanzenarten.
  - **Pflege & Düngung:** Erfassung von Scheibenreinigung, Bodengrundpflege, Düngedosierungen und Spezialfütterungen.
  - **Kombinierte Timeline:** Anzeige aller Pflegemaßnahmen und Wassermessungen in einer gefilterten Übersicht (Alle, Wasserwechsel, Pflege & Filter, Pflanzen, Messungen).
- Aquarien mit anderen registrierten Benutzern teilen mit flexiblen Berechtigungen:
  - **Lesen (view):** Wasserwerte, Verlaufsgraphen, Besatz, Logbuch und Alarme einsehen.
  - **Schreiben (write):** Messwerte und Pflegeaktivitäten erfassen/bearbeiten/löschen, Besatz verwalten, Alarme bestätigen und Bilder bearbeiten.
- Besatz pro Becken eintragen. Die Fischarten bestimmen die optimalen Grenzwerte
  (Weichwasser, Hartwasser, Garnelen und Wirbellose).
- **Artenkatalog & Besatzprüfung:** Umfassende Datenbank aller gängigen Aquarienbewohner in Deutschland (Salmler, Lebendgebärende, Labyrinthfische/Kampffische, Buntbarsche, Welse, Bärblinge, Garnelen, Schnecken, Meerwasser) mit Wasserwerten, Mindestbeckenvolumen, Sozialverhalten und Territorialregeln.
- **Verhaltens- & Territorialitäts-Prüfung:** Automatische Erkennung von Vergesellschaftungs- und Verhaltenskonflikten (z. B. Einzelhaltung bei Siamesischen Kampffischen, Flossenbeißer vs. Langflosser, Räuber vs. Zwerggarnelen, Krebse vs. Bodenfische, Mindestgruppengrößen bei Schwarmfischen und Temperatur-/pH-Inkompatibilitäten).
- Messmaske für 15 Parameter mit Timer pro Test (mehrere gleichzeitig, Ton und Vibration bei Ablauf,
  Bildschirm bleibt während der Timer an, wenn der Browser das erlaubt)
- Live-Bewertung beim Tippen, Eingabe mit Komma möglich
- Graphen pro Parameter (7 Tage bis alles) mit Zielbereich und kritischen Grenzen
- Warnungen (auffällig) und Alarme (kritisch) mit Handlungshinweis, zum Abhaken
- Erinnerung, wenn die letzte Messung länger her ist als eingestellt

## Starten

```bash
npm ci --omit=dev    # braucht Node 22 oder neuer, es wird nichts kompiliert
npm test             # führt alle automatisierten Tests aus
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
| `APP_URL` | (leer) | Öffentliche Adresse der App, z. B. `https://aquarium.example.com` oder `https://example.com/aquarium`. Pflicht für OIDC |
| `ALLOW_REGISTRATION` | true | `false` sperrt neue Konten (lokal und beim ersten OIDC-Login) |
| `COOKIE_SECURE` | automatisch | `true`, wenn die App hinter HTTPS läuft. Standard: `true`, wenn `APP_URL` mit `https://` beginnt |
| `TRUST_PROXY` | (aus) | `1`, wenn genau ein Reverse Proxy davorsteht |
| `OIDC_ISSUER` | (leer) | URL des Pocket-ID-Servers, z. B. `https://id.example.com`. Gesetzt = OIDC aktiv |
| `OIDC_CLIENT_ID` | (leer) | Client-ID aus Pocket ID |
| `OIDC_CLIENT_SECRET` | (leer) | Client-Secret aus Pocket ID (leer lassen bei einem öffentlichen Client) |
| `OIDC_SCOPES` | `openid profile email` | Angeforderte Scopes |
| `OIDC_PROVIDER_NAME` | `Pocket ID` | Beschriftung des Anmelde-Buttons |
| `LOCAL_LOGIN` | automatisch | Lokale Anmeldung mit Passwort. Standard: aus, wenn OIDC aktiv ist, sonst an |
| `OIDC_LINK_BY_USERNAME` | false | `true` verknüpft beim ersten OIDC-Login ein vorhandenes lokales Konto mit gleichem Benutzernamen |
| `ADMIN_EMAIL` | (leer) | E-Mail-Adresse des Administrators (oder mehrere durch Komma getrennt) für den Admin-Bereich / Benutzerverwaltung |

## Benutzerprofil und Kontoverwaltung

Jeder angemeldete Benutzer kann über die Kopfzeile auf sein **Benutzerprofil** (`#/profile`) zugreifen:
- **Profilbild (Avatar):** Hochladen (JPG, PNG, WebP, GIF bis 5 MB) oder Löschen des eigenen Profilbilds.
- **Persönliche Angaben:** Pflege von Vorname, Nachname, Benutzername, „Über mich“-Bio und E-Mail-Adresse.
- **Passwortverwaltung:** Ändern des aktuellen Passworts (bei lokaler Anmeldung).
- **OIDC-Verknüpfung:** Direktes Verknüpfen oder Entkoppeln des Kontos mit Pocket ID / OpenID Connect.

## Admin-Bereich und Benutzerverwaltung

Der Administrator wird anhand der E-Mail-Adresse festgelegt. Dazu entweder in `config.js` oder über die Umgebungsvariable `ADMIN_EMAIL` die gewünschte E-Mail-Adresse hinterlegen (z. B. `ADMIN_EMAIL=admin@example.com` bzw. kommagetrennt für mehrere).

- Benutzer, deren E-Mail-Adresse (aus OIDC/Pocket ID oder lokaler Registrierung) mit `ADMIN_EMAIL` übereinstimmt, erhalten Administrator-Rechte.
- Im Header erscheint der Button **Benutzerverwaltung** (`#/admin`).
- Administratoren können alle registrierten Benutzer einsehen, neue Benutzer anlegen, bestehende Benutzer bearbeiten (Benutzername, E-Mail, Passwort ändern) und Benutzer samt deren Daten löschen.

## Anmeldung mit Pocket ID (OIDC)

1. In Pocket ID unter *OIDC Clients* einen neuen Client anlegen:
   - **Callback URL:** `<APP_URL>/auth/callback`, z. B. `https://aquarium.example.com/auth/callback`
   - **Logout Callback URL:** `<APP_URL>/`, z. B. `https://aquarium.example.com/`
   - Optional: Zugriff über *Allowed User Groups* auf bestimmte Gruppen beschränken.
2. Client-ID und Client-Secret übernehmen und die App starten, z. B.:

```bash
APP_URL=https://aquarium.example.com \
OIDC_ISSUER=https://id.example.com \
OIDC_CLIENT_ID=... OIDC_CLIENT_SECRET=... \
TRUST_PROXY=1 npm start
```

Die App nutzt den Authorization Code Flow mit PKCE, prüft die Signatur des ID-Tokens über die JWKS des Servers
sowie `iss`, `aud`, `exp` und `nonce`. Beim ersten Login wird automatisch ein Konto angelegt
(Benutzername aus `preferred_username`), die Zuordnung erfolgt dauerhaft über die `sub` des Benutzers.
"Abmelden" beendet auch die Sitzung bei Pocket ID.

**Umstieg und nachträgliche Zuordnung von lokalen Konten:**
- **Selbstverknüpfung:** Angemeldete Benutzer können ihr Konto in der Kopfzeile über „Mit Pocket ID verknüpfen“ direkt mit Pocket ID verbinden.
- **Automatisch per E-Mail:** Stimmt die im lokalen Konto hinterlegte E-Mail-Adresse mit der E-Mail-Adresse aus Pocket ID überein, wird das Konto beim OIDC-Login automatisch zugeordnet.
- **Admin-Benutzerverwaltung:** Administratoren können in der Benutzerverwaltung die OIDC-Benutzer-ID (`sub`) für jedes Konto direkt eintragen, ändern oder löschen.
- **Per Benutzername:** Mit `OIDC_LINK_BY_USERNAME=true` wird ein vorhandenes Konto beim ersten Pocket-ID-Login übernommen, wenn der Pocket-ID-Benutzername übereinstimmt (nur aktivieren, wenn Benutzer sich in Pocket ID keine beliebigen Namen vergeben können).

**App unter einem Unterpfad:** `APP_URL` darf einen Pfad enthalten (z. B. `https://example.com/aquarium`).
Der Reverse Proxy muss diesen Präfix dann entfernen, bevor er an die App weiterleitet
(Caddy: `handle_path /aquarium/* { reverse_proxy localhost:3000 }`).

## Wassertests und Testsuiten (JSON-konfigurierbar)

Die Wassertests sind modular als **JSON-Dateien** unter `src/config/suites/` (bzw. für eigene Erweiterungen unter `data/suites/`) abgelegt:
- **Standard-Suite (`jbl-pro-aquatest.json`):** JBL PRO AQUATEST Testlab Tropfentests nach offizieller Gebrauchsanweisung mit verifizierten Reaktionszeiten (z. B. Kalium 90 s, Nitrit 5 min, Nitrat 10 min, Ammonium 10 min, Phosphat 10 min, Eisen 10 min, Kupfer 15 min, Silikat 3 min).
- **Konsolidierter pH-Wert:** Statt unübersichtlicher Einzeltests für verschiedene pH-Bereiche existiert ein einheitlicher pH-Test (3,0 bis 10,0), bei dem der Messwert direkt erfasst wird.
- **Weitere Suiten:** Beliebig erweiterbar (z. B. `jbl-easy-7in1.json` für Teststreifen).
- **Benutzerauswahl:** Jeder Anwender kann sowohl im Profil (`#/profile`) als auch direkt bei der Messung (`#/a/:id/messen`) auswählen, welche Testsuite er nutzt und welche Tests er besitzt/durchführen möchte. Die Auswahl wird dauerhaft im Benutzerkonto und im Browser gespeichert.

## Artenkatalog und Besatz-Kompatibilitätsprüfung

Der Besatz wird über modulare **JSON-Artenkataloge** unter `src/config/species/` (bzw. für eigene Erweiterungen unter `data/species/`) gesteuert:
- **Kataloge:**
  - `freshwater-popular.json`: Gängige Salmler, Lebendgebärende, Labyrinthfische, Bärblinge, Welse und Schmerlen.
  - `cichlids.json`: Südamerikanische Zwergbuntbarsche, Skalare, Diskusfische sowie ostafrikanische Buntbarsche (Malawi / Tanganjika).
  - `invertebrates.json`: Zwerggarnelen, Fächergarnelen, Zwergflusskrebse und Zierschnecken.
  - `saltwater.json`: Meerwasserfische, Anemonenfische, Putzergarnelen und Einsiedlerkrebse.
- **Artenkatalog-Ansicht (`#/species`):** Durchsuche und filtere alle Bewohner nach Wassertyp oder Kategorie und sieh dir Wasseranforderungen (Temperatur, pH, GH, KH), Mindestbeckenvolumen, Schwimmzone und Wesen an.
- **Verhaltens- & Territorialitäts-Prüfung:**
  - **Kampffische (*Betta splendens*):** Prüfung auf strikte Einzelhaltung (mehrere Kampffische in einem Becken lösen kritische Alarme aus), Schutz vor Flossenbeißern (Sumatrabarbe, Blutsalmler) und Rivalitätswarnung bei bunten Schleierfischen (Guppys).
  - **Mindestbeckengrößen:** Warnung, wenn das Aquarium kleiner ist als das empfohlene Mindestvolumen einer Art (z. B. Skalare ab 200 L, Diskus ab 300 L, Prachtschmerlen ab 400 L).
  - **Schwarmgrößen:** Warnung bei Schwarmfischen (Neonsalmler, Rotkopfsalmler, Zebrabärblinge), wenn weniger als die empfohlene Mindestanzahl gehalten wird.
  - **Räuber-Beute & Flossenschutz:** Warnungen vor Zwerggarnelen-Verlusten bei größeren Raubfischen (Skalare/Buntbarsche), Zwickgefahren bei Krebsen und Schneckenfressern (Raubschnecke Helena, Prachtschmerle) bei Zierschnecken.
  - **Biotop- und Wasserwertkonflikte:** Automatische Erkennung unvereinbarer Ansprüche (z. B. alkalische Malawi-/Tanganjika-Buntbarsche vs. Weichwasser-Südamerikaner oder Kaltwasserfische wie Kardinalfische vs. wärmebedürftige Tropenfische).

## Wartezeiten und Grenzwerte prüfen

Die Testparameter und Standardwerte liegen in `src/config/suites/jbl-pro-aquatest.json` und `config.js`.

- **Wartezeiten:** Alle Zeiten im Standard-Set basieren auf der JBL Testlab-Gebrauchsanweisung (`verified: true`). Eigene Testsuiten können jederzeit als JSON ergänzt werden.
- **Grenzwerte:** Richtwerte für Süß- und Meerwasser. Prüfe sie für dein Becken und passe sie an.
  Die App ersetzt keine Beratung durch Fachleute.

## Betrieb

- **HTTPS:** Hinter einen Reverse Proxy (Caddy, nginx, Traefik) stellen, `APP_URL=https://...` (oder `COOKIE_SECURE=true`) sowie `TRUST_PROXY=1` setzen.
- **Backup:** `sqlite3 data/aquarium.db ".backup backup.db"` (die Datenbank läuft im WAL-Modus,
  daher nicht einfach nur die .db-Datei kopieren).
- **Passwörter** (nur lokale Anmeldung) werden mit scrypt gehasht, Sitzungen als Hash in der Datenbank gespeichert.

## Bekannte Grenzen

- Alarme erscheinen in der App. E-Mail oder Push-Benachrichtigungen gibt es noch nicht.
- Kein Passwort-Zurücksetzen per E-Mail bei lokaler Anmeldung. Ein vergessenes Passwort lässt sich nur direkt in der Datenbank ersetzen
  (mit Pocket ID entfällt das).
- Laufende OIDC-Anmeldungen (die wenigen Sekunden zwischen Weiterleitung und Rücksprung) liegen im Arbeitsspeicher.
  Die App ist daher für den Betrieb als ein einzelner Prozess gedacht.
