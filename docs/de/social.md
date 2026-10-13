# Social-Bereich

[Handbuch](README.md) · [English](../en/social.md)

## Öffentlicher Feed

Unter `#/social` können alle Besucher Beiträge ansehen – auch ohne Konto. Ein Beitrag enthält ein Bild und bis zu 2200 Zeichen Text. Der Feed zeigt die neuesten Beiträge zuerst und lädt jeweils 20 weitere. Einzelne Beiträge haben einen öffentlichen Link unter `#/social/:id`.

Benutzername und aktuelles Profilbild erscheinen an Beiträgen und Kommentaren. Vor dem Veröffentlichen weist das Formular auf die öffentliche Sichtbarkeit hin. Private Aquariumfotos werden dadurch nicht automatisch öffentlich; Social-Bilder sind separate Uploads.

## Veröffentlichen und interagieren

Angemeldete Nutzer können Bilder hochladen, Beiträge liken und Kommentare bis 1000 Zeichen schreiben. Ein Like pro Benutzer und Beitrag ist erlaubt und lässt sich zurücknehmen. Kommentare werden in Seiten zu 20 Einträgen geladen. Autoren können ihre eigenen Beiträge und Kommentare löschen; Administratoren können alle löschen. Beim Löschen eines Beitrags verschwinden auch Bilddatei, Likes und Kommentare. Beim Löschen eines Kontos werden dessen Social-Beiträge, Kommentare, Likes und Bilder entfernt.

„Teilen“ verwendet den Teilen-Dialog des Geräts, kopiert alternativ den öffentlichen Link oder zeigt ihn zum manuellen Kopieren an. Besucher können diesen Link ohne Anmeldung öffnen.

## Bilder

JPG, PNG, WebP und GIF bis 5 MB werden akzeptiert. Der Server prüft und dekodiert die Bilddaten, begrenzt die Eingabe auf 40 Megapixel und skaliert proportional auf maximal 1600 × 1600 Pixel ohne Vergrößern oder Beschneiden. Die längste Seite bleibt also höchstens 1600 Pixel groß. Bilder werden als WebP mit Qualität 82 gespeichert; Metadaten werden nicht übernommen und GIFs als Standbild verarbeitet. Die Verarbeitung verwendet [sharp](https://sharp.pixelplumbing.com/api-resize/).

Bilder liegen als `social_*.webp` im vorhandenen Upload-Ordner. Öffentlich erreichbar sind nur Bilder vorhandener Beiträge und Profilbilder von Nutzern mit Social-Aktivität. E-Mail-Adressen, API-Schlüssel und interne Dateinamen werden nicht im öffentlichen Feed ausgegeben.

## Datenbank und Backup

Migration **003_social** hebt SQLite und MongoDB automatisch auf Schema-Version 3 und legt `social_posts`, `social_comments` und `social_likes` mit Indizes an. Bestehende Daten bleiben erhalten; vor Migrationen greift die vorhandene Sicherung.

Social-Daten werden exportiert und wiederhergestellt; Bilder sind bei aktivierter Dateisicherung (`includeFiles=true`) enthalten. Alte Backups ohne Social-Daten ergeben einen leeren Feed. Diese Erweiterung behebt nicht die separat festgestellten Verluste anderer Kontoeinstellungen bei der bestehenden Wiederherstellung.

Die API unter `/api/social` bietet öffentliche GET-Endpunkte für Beiträge, Bilder, Profilbilder und Kommentare. Schreiboperationen erfordern Sitzung und CSRF-Header. Neue Beiträge, Kommentare und Likes besitzen zusätzliche Ratenlimits. `npm test -- test/social.test.js` prüft Bildgrößen, öffentliche Ansichten, Rechte, Likes, Kommentare, Kontolöschung und Backup/Restore bei beiden Datenbanken.
