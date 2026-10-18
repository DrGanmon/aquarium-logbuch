# Capacitor-Prototyp für Android und iOS

[Projektübersicht](../../README.md) · [English](../en/mobile.md)

Der Prototyp nutzt dieselben Vue-Ansichten und dieselbe browserfähige Fachlogik wie die Web-App. Express und die Datenbank laufen weiterhin auf dem gewählten Aquarium-Server. Das ist ein Entwicklungsstand, noch keine freigegebene mobile App.

## Bauen und starten

Abhängigkeiten mit `npm ci` installieren. `npm run build:mobile` prüft die Frontend-Typen und erzeugt `dist/mobile/index.html`, Icons und sämtliche Browser-Chunks unter `dist/mobile/dist`. Der Web-Build unter `public/dist` bleibt davon getrennt. Backendmodule, Katalogdaten, Handbuch und Service Worker werden nicht in das mobile Paket aufgenommen.

```sh
npm run mobile:sync
npm run mobile:android
# Auf einem Mac mit Xcode:
npm run mobile:ios
```

`mobile:sync` baut die Oberfläche und führt `cap sync` für die eingecheckten Projekte `android/` und `ios/` aus. Danach in Android Studio oder Xcode einen Emulator bzw. ein Gerät auswählen. Ein nativer Build benötigt die Entwicklungswerkzeuge der Plattform; `cap sync` erzeugt allein noch keine APK oder IPA. Die Anforderungen richten sich nach dem installierten Capacitor 8: [Android](https://capacitorjs.com/docs/android), [iOS](https://capacitorjs.com/docs/ios).

Der iOS-Build benötigt macOS und Xcode. Für TestFlight oder den App Store zusätzlich Apple-Developer-Mitgliedschaft, Signing und App Store Connect einrichten. Der vorhandene iOS-Unterbau verwendet Swift Package Manager. Die Kennung `de.aquariumlogbuch.prototype` ist eine Entwicklungskennung; vor einer Veröffentlichung eine eigene Kennung sowie native Versions-/Buildnummern und App-Grafiken festlegen. Signierschlüssel und Provisioning-Dateien nicht ins Repository aufnehmen.

## Server auswählen

Beim Start eine HTTPS-Adresse wie `https://aquarium.example.org/` oder `https://example.org/aquarium/` eingeben und „Verbinden“ wählen. Ein gültiges, vom Gerät akzeptiertes TLS-Zertifikat ist erforderlich. Zugangsdaten, Query-Parameter und Fragmente sind in der Serveradresse nicht erlaubt. Die letzte Adresse wird vorgeschlagen; eine Verbindung beginnt erst nach der Auswahl. Die Browser-Vorschau kann die Auswahl anzeigen, lässt die Verbindung aber nur in der nativen App zu.

![Browser-Vorschau der Serverauswahl mit fiktiver Adresse; keine native Geräteaufnahme](../screenshots/capacitor-serverauswahl.webp)

„Server wechseln“ im Footer lädt die lokale Oberfläche neu und öffnet die Auswahl. Bereits gespeicherte Änderungen bleiben erhalten. Für jeden Server einschließlich Unterpfad verwendet die App eine eigene IndexedDB; innerhalb dieser Datenbank bleibt die bestehende Kontotrennung erhalten. Der Wechsel meldet die Sitzung auf dem bisherigen Server nicht ab. Zum Abmelden dort zuerst „Abmelden“ verwenden.

## Anmeldung, Chat und Offline-Synchronisierung

Capacitors HTTP-/Cookie-Unterstützung ist nur im nativen Paket aktiviert. API-Anfragen werden auf den ausgewählten Server umgeleitet; Cookies bleiben in der nativen Cookie-Verwaltung. Es werden keine Sitzungstokens in localStorage übernommen und weder CORS noch CSRF-Schutz des Backends gelockert. Die lokale Anmeldung ist der vorgesehene Prüfpfad; das plattformspezifische Cookie-Verhalten muss noch auf echten Android-/iOS-Geräten bestätigt werden.

Die native POST-Brücke puffert Antworten. Deshalb fordert der mobile KI-Chat die bestehende JSON-Antwort an und zeigt keine angeblich live eintreffenden Fortschrittsschritte. Die Web-Version behält ihren bisherigen Ereignisstrom. Ein clientseitiger Abbruch verwirft verspätete Antworten; eine bereits laufende native POST-Anfrage kann serverseitig weiterlaufen. Die bestehenden Operations-IDs und die atomare Quittierung der Offline-Warteschlange bleiben erhalten.

Die Oberfläche liegt im App-Paket. Der mobile Start registriert keinen Service Worker und bietet keine Web-Frontend-Updates an. Änderungen an der mobilen Oberfläche erfordern vorerst einen neuen App-Build; Kataloge und Benutzerdaten werden weiterhin separat über die API synchronisiert. Browserinstallation und bestätigte Web-Updates bleiben erhalten.

## Bilder und Sitzungsablauf (zweiter Schritt)

Bildabrufe laufen über denselben ausgewählten Server und dessen native Cookie-Verwaltung. Die Bildansichten verwenden lokale Blob-URLs; beim Entfernen der Ansicht oder Kontowechsel werden diese freigegeben und verspätete Antworten verworfen. Unterpfadinstallationen werden auch bei absoluten Bildadressen berücksichtigt. Vorschauen aus lokalen Dateien bleiben lokal.

Bereits synchronisierte private Bilder liegen weiterhin benutzergetrennt in IndexedDB. Bei einer gültig vorgemerkten Bildänderung wird zuerst das lokale Bild angezeigt. Reine Anzeigeabrufe überschreiben diese Bytes nicht. Nur ein Netzwerkfehler erlaubt den Rückgriff auf den gespeicherten Stand: HTTP 401, 403 oder 404 sowie eine abweichende Benutzerkennung liefern kein altes Bild als Ersatz. Ein abgelaufenes Konto wird auch bei einer 401-Antwort von `/me` aus der Oberfläche entfernt.

Betrachtete öffentliche Arten-/Pflanzenbilder werden je Server begrenzt gespeichert: höchstens 200 Bilder mit jeweils maximal 2 MB. Social-Bilder erhalten keinen Offline-Speicher. Bestehende Bildnachweise und Lizenzangaben in den Katalogansichten bleiben erhalten.

![Offline-Bildanzeige in einer Browser-Demo mit fiktivem Konto und simuliertem nativen Transport; keine Geräteaufnahme](../screenshots/capacitor-bilder-offline.webp)

Demo-Foto im Screenshot: [5snake5, „Sewellia lineolata – Pracht-Flossensauger“](https://commons.wikimedia.org/wiki/File:Sewellia_lineolata_-_Pracht-Flossensauger.jpg), CC0 1.0; Ausschnitt der vorhandenen Katalogdatei.

Der Integrationstest in `test/mobile_session.test.js` prüft lokale Anmeldung, API-Zugriff, Bild-Upload/-Abruf, KI-Chat, Sitzungsablauf und Abmeldung gegen ein echtes lokales Backend. Nur der native Transport samt Cookie-Verwaltung und der externe KI-Anbieter werden simuliert. Das ersetzt weder die TLS-/Cookie-Prüfung auf iOS/Android noch den vollständigen Offline-Durchlauf auf einem Gerät.

## Prüfstand und offene Arbeiten

- Frontend-Typprüfung, mobile Paketgenerierung, `cap sync` sowie automatisierte URL-, Transport-, Abbruch-, Datentrennungs-, Chat-, Offline-, Katalog- und Web-Build-Prüfungen sind möglich. Die Browseraufnahme belegt nur die Darstellung der Serverauswahl.
- Native Anmeldung und ein vollständiger Durchlauf „online anmelden → synchronisieren → offline ändern → App neu starten → online quittieren“ müssen auf Android und iOS noch geprüft werden. Unter Linux kann kein iOS-Gerätetest oder signierter iOS-Build durchgeführt werden.
- OIDC ist im mobilen Prototyp ausgeblendet, bis Systembrowser und sicherer Rücksprung eingerichtet sind. Reine OIDC-Konten nutzen vorerst die Web-App.
- Aquarium-, Bewohner-, Profil-, Social- und Katalogbilder nutzen jetzt einen bedarfsgesteuert geladenen nativen Bildpfad. Die Darstellung wurde im Browser mit simuliertem Transport geprüft; die native Cookie-Verwaltung und Bildanzeige auf echten Geräten bleiben zu prüfen.
- Downloads, CSV-Export, externe Links, Deep Links, Zurücktaste, native Timer-Benachrichtigungen und Wiederaufnahme nach Standby sind noch nicht vollständig angepasst oder auf Geräten geprüft. Es gibt keine Zusage zur Ausführung im Hintergrund.
- Server-Kompatibilitätsprüfung, mobile CI, Signierung, native Release-Versionierung und Store-Veröffentlichung fehlen noch. Native Standardgrafiken sind vor Veröffentlichung zu ersetzen.

Weitere Grundlagen: [Capacitor-Workflow](https://capacitorjs.com/docs/basics/workflow), [native HTTP-Anbindung](https://capacitorjs.com/docs/apis/http).
