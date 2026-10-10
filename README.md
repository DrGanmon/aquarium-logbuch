# Aquarium-Logbuch

Mehrbenutzer-Webanwendung für Aquarien-Wasserwerte. Node.js (ab Version 22), Express und SQLite.
Anmeldung wahlweise lokal mit Passwort oder per OAuth 2.0 / OpenID Connect gegen [Pocket ID](https://pocket-id.org).

## Funktionen

- Anmeldung über Pocket ID (OIDC) oder lokal mit Registrierung
- Benutzerprofil zur Pflege von Profilbild (Avatar), Vorname, Nachname, Benutzername und „Über mich“-Bio sowie Passwortverwaltung und OIDC-Verknüpfung
- Admin-Bereich mit Benutzerverwaltung für Administratoren (festgelegt anhand der E-Mail-Adresse in der Konfiguration)
- Aquarien anlegen (Name, Süß- oder Meerwasser, Volumen, Erinnerungsintervall, Notizen)
- Bild vom Aquarium hochladen (PNG, JPG, WebP, GIF), das in der Aquarienliste und auf der Detailseite dargestellt wird
- Aquarien mit anderen registrierten Benutzern teilen mit flexiblen Berechtigungen:
  - **Lesen (view):** Wasserwerte, Verlaufsgraphen, Besatz und Alarme einsehen.
  - **Schreiben (write):** Messwerte erfassen/löschen, Besatz verwalten, Alarme bestätigen und Bilder bearbeiten.
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

## Wartezeiten und Grenzwerte prüfen

Alles steht in `config.js`.

- **Wartezeiten:** Nur Kalium (30 s schwenken + 1 min stehen lassen = 90 s) wurde gegen die JBL-Anleitung
  geprüft. Alle anderen Zeiten sind Startwerte und in der App mit einem Hinweis markiert.
  Bitte mit der Packungsbeilage deiner Tests abgleichen und `wait` (Sekunden) anpassen,
  danach `verified: true` setzen.
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
