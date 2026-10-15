# Social-Bereich

[Handbuch](README.md) · [English](../en/social.md)

Der Benachrichtigungsbereich in der Kopfzeile meldet Herzen und Kommentare anderer Mitglieder zu eigenen Beiträgen. Dort erscheinen zusätzlich offene Wasserwertwarnungen aus allen zugänglichen Aquarien. Social-Hinweise können als gelesen markiert, Wasserwertwarnungen direkt quittiert werden.

## Öffentlicher und serverinterner Feed

Unter `#/social` sehen Besucher ohne Konto nur öffentliche Beiträge. Angemeldete Nutzer sehen zusätzlich Beiträge für alle angemeldeten Nutzer dieser Serverinstanz. Ein Beitrag enthält ein Bild und bis zu 2200 Zeichen Text. Der Feed zeigt die neuesten Beiträge zuerst und lädt jeweils 20 weitere. Einzelne Beiträge haben einen Link unter `#/social/:id`.

Benutzername und aktuelles Profilbild erscheinen an Beiträgen und Kommentaren. Neue Beiträge sind standardmäßig serverintern. Die Checkbox „Im öffentlichen Feed anzeigen“ muss für öffentliche Sichtbarkeit ausdrücklich aktiviert werden. Das Formular erläutert die gewählte Sichtbarkeit. Private Aquariumfotos werden dadurch nicht automatisch öffentlich; Social-Bilder sind separate Uploads.

## Veröffentlichen und interagieren

Angemeldete Nutzer können Bilder hochladen, Beiträge liken und Kommentare bis 1000 Zeichen schreiben. Ein Like pro Benutzer und Beitrag ist erlaubt und lässt sich zurücknehmen. Kommentare werden in Seiten zu 20 Einträgen geladen. Autoren können ihre eigenen Beiträge und Kommentare löschen; Administratoren können alle löschen. Beim Löschen eines Beitrags verschwinden auch Bilddatei, Likes und Kommentare. Beim Löschen eines Kontos werden dessen Social-Beiträge, Kommentare, Likes und Bilder entfernt.

„Teilen“ verwendet den Teilen-Dialog des Geräts, kopiert alternativ den Beitragslink oder zeigt ihn zum manuellen Kopieren an. Für serverinterne Beiträge ist auch bei direkten Bild-, Kommentar- und Teilen-Links eine Anmeldung erforderlich.

## Bilder

JPG, PNG, WebP und GIF bis 10 MB werden akzeptiert. Der Server prüft und dekodiert die Bilddaten, begrenzt die Eingabe auf 40 Megapixel und skaliert proportional auf maximal 1600 × 1600 Pixel ohne Vergrößern oder Beschneiden. Die längste Seite bleibt also höchstens 1600 Pixel groß. Bilder werden als WebP mit Qualität 82 gespeichert; Metadaten werden nicht übernommen und GIFs als Standbild verarbeitet. Die Verarbeitung verwendet [sharp](https://sharp.pixelplumbing.com/api-resize/).

Bilder liegen als `social_*.webp` im vorhandenen Upload-Ordner. Öffentlich erreichbar sind nur Bilder vorhandener Beiträge und Profilbilder von Nutzern mit öffentlich sichtbaren Beiträgen oder Kommentaren. Angemeldete Nutzer können außerdem interne Beiträge und deren Autoren sehen. E-Mail-Adressen, API-Schlüssel und interne Dateinamen werden nicht im öffentlichen Feed ausgegeben.

## Datenbank und Backup

Migration **003_social** hebt SQLite und MongoDB automatisch auf Schema-Version 3 und legt `social_posts`, `social_comments` und `social_likes` mit Indizes an. Bestehende Daten bleiben erhalten; vor Migrationen greift die vorhandene Sicherung.

Social-Daten werden exportiert und wiederhergestellt; Bilder sind bei aktivierter Dateisicherung (`includeFiles=true`) enthalten. Alte Backups ohne Social-Daten ergeben einen leeren Feed. Diese Erweiterung behebt nicht die separat festgestellten Verluste anderer Kontoeinstellungen bei der bestehenden Wiederherstellung.

Die API unter `/api/social` bietet nach Sichtbarkeit gefilterte GET-Endpunkte für Beiträge, Bilder, Profilbilder und Kommentare. Schreiboperationen erfordern Sitzung und CSRF-Header. Neue Beiträge, Kommentare und Likes besitzen zusätzliche Ratenlimits. `npm test -- test/social.test.js` prüft Bildgrößen, öffentliche Ansichten, Rechte, Likes, Kommentare, Kontolöschung und Backup/Restore bei beiden Datenbanken.

## AGB, Nutzungsrecht und Datenschutz

Die öffentlich erreichbaren Seiten `#/agb` und `#/datenschutz` beschreiben die Nutzung in Deutsch und Englisch. Registrierung erfordert `acceptTerms=true` und die aktuelle `termsVersion` aus `/api/registration` oder `/api/terms`. Version und Zeitpunkt werden im Konto gespeichert. Neue OIDC-Konten benötigen die gleiche Zustimmung; der CSRF-geschützte Start über `POST /api/oidc/login` bindet sie an den signierten Anmeldestatus. Bestehende Konten können sich weiterhin anmelden. Die AGB werden einmalig bei der Registrierung akzeptiert. Beim Veröffentlichen oder Hochladen wird keine erneute Zustimmung verlangt, auch nicht für Bestandskonten.

Das einfache, unentgeltliche Nutzungsrecht umfasst nur Speicherung, Bildverarbeitung, Sicherungen und Anzeige für den App-Betrieb entsprechend der Sichtbarkeit. Urheberrechte bleiben beim Nutzer; Werbenutzung außerhalb der App, Verkauf und KI-Training sind ausgeschlossen.

Migration **004_social_privacy_terms** hebt beide Datenbanken auf Version 4, ergänzt `is_public`, `terms_version` und `terms_accepted_at`. Frühere Beiträge bleiben öffentlich; Bestandskonten bekommen keine erfundene Zustimmung. Backups erhalten Sichtbarkeit und Zustimmungsnachweis. Bei wesentlichen Änderungen der AGB-Texte in `public/locales` muss `TERMS_VERSION` in `src/services/terms-service.ts` erhöht werden.

Bei Kontolöschung werden Profil-, Aquarium-, Galerie-, Besatz- und Social-Bilder entfernt. Lokale `.json.gz`-Sicherungen in `DATA_DIR/backups` werden vor der Kontolöschung von diesen Bilddaten und den zugehörigen Social-Inhalten bereinigt. Dateilöschfehler brechen die Kontolöschung ab; während laufender Sicherung oder Wiederherstellung muss sie wiederholt werden. Andere Kontodaten bleiben in Sicherungen gemäß dem Löschkonzept des Betreibers; externe oder heruntergeladene Backups muss dieser selbst bereinigen. Rohdatenbank-Sicherungen enthalten keine eingebetteten Bilddateien.

Der Betreiber muss Impressum, eingesetzte Dienstleister, etwaige Drittlandübermittlungen und konkrete Aufbewahrungsregeln an seine Instanz anpassen. Grundlage der Formulierung sind [§ 31 UrhG](https://www.gesetze-im-internet.de/urhg/__31.html), [§ 305 BGB](https://www.gesetze-im-internet.de/bgb/__305.html) und [Art. 13 DSGVO](https://www.datenschutz.sachsen.de/informationspflichten.html).
