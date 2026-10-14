# Changelog

Features, Fehlerbehebungen und weitere Änderungen für jede Revision des Aquarium-Logbuchs. Neueste Einträge stehen zuerst.

Die bisherige Historie wurde aus den Commit-Beschreibungen übernommen; ältere Einträge bleiben in ihrer ursprünglichen Sprache. Die Versionszuordnung ist anhand der zum jeweiligen Zeitpunkt geltenden Versionsbasis und der Regeln in `scripts/version.js` rekonstruiert und belegt keine Veröffentlichung: `feat` erhöht die Revision und setzt den Patch zurück, `fix` erhöht den Patch. Andere Commit-Typen behalten die Version bei. Im Changelog werden alle Patches unter der jeweiligen Revision zusammengefasst; eigene Patch-Abschnitte entfallen. Jede Änderung ist über ihre Commit-ID nachvollziehbar.

## Unveröffentlicht

- Logbucheinträge und Messungen über einen Bestätigungsdialog in der Anwendung löschen, unabhängig von Browserbestätigungen; Fehler im Dialog anzeigen, doppelte Anfragen verhindern und gelöschte Einträge sofort aus Logbuch und Messwerttabelle entfernen. Regressionstests für Bestätigung, Abbruch, API-Zuordnung, Fehlerfälle und Berechtigungen ergänzen.

## 0.1.3-ALPHA

- 2026-10-14 · Tests: Erwartete Datenbankschemaversion im Social-Test aktualisiert ([`98c9495`](https://github.com/DrGanmon/aquarium-logbuch/commit/98c949550b144bb434a301d196b1ff25b5bc269b)).
- 2026-10-14 · Bilddatenbank-Werkzeug: Bildsuche um Pflanzenkataloge, strukturierte Synonyme und zusätzliche Commons-Suchen mit Aquariumbezug erweitern; Herbarbelege aussortieren und automatisch gefundene Pflanzen-Zuchtformen sowie Sammelbezeichnungen zur Sichtprüfung markieren ([`bd099de`](https://github.com/DrGanmon/aquarium-logbuch/commit/bd099dea5a41c659018c9f3a676229d51c6eb0e8)).
- 2026-10-14 · Bilddatenbank-Werkzeug: Tiere und Pflanzen mit `kind` kennzeichnen, über `--kind` gezielt verarbeiten und in der Review-Galerie filtern; Dokumentation entsprechend ergänzen ([`bd099de`](https://github.com/DrGanmon/aquarium-logbuch/commit/bd099dea5a41c659018c9f3a676229d51c6eb0e8)).
- 2026-10-14 · Bilddatenbank-Werkzeug: Datenverzeichnis mit Platzhalter sowie artspezifische Suchvorgaben und Prüfhilfen in `tools/overrides.json` hinzufügen ([`bd099de`](https://github.com/DrGanmon/aquarium-logbuch/commit/bd099dea5a41c659018c9f3a676229d51c6eb0e8)).

## 0.1.2-ALPHA

- 2026-10-14 · Pflanzenbestand: Pflanzen mit Anzahl zu Aquarien hinzufügen, unter dem Tierbesatz anzeigen, Details öffnen sowie Bestände bearbeiten und entfernen. Aquariumvorauswahl, deutsche und englische Oberfläche, Prüfung von Schreibrechten und Wasserart, Speicherung in SQLite und MongoDB, Löschbereinigung, Backup/Restore, Tests und Dokumentation ergänzt ([`1c4dcad`](https://github.com/DrGanmon/aquarium-logbuch/commit/1c4dcad11832275798e6bc02ec2e7ce9694a6b54)).

## 0.1.1-ALPHA

- 2026-10-14 · Pflanzenkatalog: Zweisprachige Datenbank mit 149 Pflanzen, Navigation, Suche, Filtern, Seitennavigation und Details einschließlich Pflegehinweisen, Wasserwerten und Quellen integriert; authentifizierte API, Build-Integration, Tests und Dokumentation ergänzt. Gelieferte Dateien nach `src/config/plants/` verschoben, `pants.json` korrigiert und `new` entfernt ([`9c90b57`](https://github.com/DrGanmon/aquarium-logbuch/commit/9c90b571ab66e4d6bdaa26433038268e952ef864)).

## 0.1.0-ALPHA

- 2026-10-14 · Build-Performance: Frontend-Typprüfung und Backend-Kompilierung unter Node und Bun parallelisiert, Bundles erst nach erfolgreichen Prüfungen erzeugt und Prozessabbrüche weitergereicht; Docker-Build-Kontext um generierte Bundles, Tests, Dokumentation und lokale Entwicklungsdateien verkleinert ([`5968224`](https://github.com/DrGanmon/aquarium-logbuch/commit/5968224dbe1dc49a71c4f351e0582f497d070f18)).
- 2026-10-14 · Build-Performance: Native Docker-Build-Stufe und npm-/Bun-Paket-Caches eingeführt sowie zwei doppelte Vite-Testbuilds entfernt ([`799c572`](https://github.com/DrGanmon/aquarium-logbuch/commit/799c57291dac4864027a2fa48ba42765cdfdd776)).
- 2026-10-14 · Projektstruktur: Anwendungskonfiguration und OIDC-Client nach `src` verschoben, JavaScript-Wrapper entfernt und Imports, Build, Tests, Dockerfiles sowie Dokumentation angepasst ([`624a6fa`](https://github.com/DrGanmon/aquarium-logbuch/commit/624a6fab470b8d95aeda5cc51603d77280401c7f)).
- 2026-10-14 · Projektstruktur: Docker-Dateien unter `docker/` gebündelt, Prüfbericht nach `docs/AUDIT.md` verschoben und CI sowie Anleitungen angepasst ([`731c899`](https://github.com/DrGanmon/aquarium-logbuch/commit/731c89940e77a476de11e43aea918fdd5e273b97)).
- 2026-10-14 · Versionierung: Minor-Version auf 0.1.0-ALPHA erhöht und Revision sowie Patch zurückgesetzt ([`40868a3`](https://github.com/DrGanmon/aquarium-logbuch/commit/40868a33973d127d233cdae58b4a6b196973159c)).

## 0.0.14-ALPHA

- 2026-10-14 · Dokumentation (changelog): vollständige Änderungshistorie nach Revisionen gebündelt, in beiden READMEs verlinkt und laufende Pflege festgelegt ([`66bd756`](https://github.com/DrGanmon/aquarium-logbuch/commit/66bd756edaf4fbb641d0a96c3d7896afac86bf33)).
- 2026-10-14 · Fehlerbehebung (ci): Diagrammtests, Backup-Cleanup und Bun-Buildtimeout korrigieren ([`2210402`](https://github.com/DrGanmon/aquarium-logbuch/commit/22104026f14a997c17e245231c57390433a06692))
- 2026-10-14 · Dokumentation (workflow): verpflichtende Commit-Messages im bestehenden Schema festhalten ([`ad03f39`](https://github.com/DrGanmon/aquarium-logbuch/commit/ad03f39926f98869c0048aa897f2ce4a1c49289a))
- 2026-10-14 · Fehlerbehebung (frontend): IDE-Fehler und Codeanalyse-Warnungen beheben ([`0c4bcfc`](https://github.com/DrGanmon/aquarium-logbuch/commit/0c4bcfc7fe70414155d549939d54deec06ef4a16))
- 2026-10-14 · Performance (frontend): Startlast reduzieren und Inhalte bei Bedarf laden ([`916144f`](https://github.com/DrGanmon/aquarium-logbuch/commit/916144f10902b38095361f302537fe3fa06ce6e3))
- 2026-10-14 · Feature (admin): Serverlogs begrenzen und ältere Einträge nachladen ([`e148e21`](https://github.com/DrGanmon/aquarium-logbuch/commit/e148e21efa7a6068a5978680793cae586b4a89c2))

## 0.0.13-ALPHA

- 2026-10-14 · Feature (chat): Fragen sofort anzeigen und Bearbeitungsstatus übertragen ([`6e6ff50`](https://github.com/DrGanmon/aquarium-logbuch/commit/6e6ff50013c3e5ecb66f1c9d30db6e80937c07db))

## 0.0.12-ALPHA

- 2026-10-14 · Fehlerbehebung (legal): eigene Lizenz vor Bibliothekslizenzen anzeigen ([`d70bb9f`](https://github.com/DrGanmon/aquarium-logbuch/commit/d70bb9fd46424d1f5d42c25c5cb04738f874b86a))
- 2026-10-14 · Fehlerbehebung (footer): Emoji vor dem AGB-Link ergänzen ([`473c668`](https://github.com/DrGanmon/aquarium-logbuch/commit/473c668b15b6cd8884085f13749801ec1aca4a85))
- 2026-10-14 · Fehlerbehebung (social): AGB-Zustimmung auf Registrierung beschränken ([`d78c94d`](https://github.com/DrGanmon/aquarium-logbuch/commit/d78c94dd18da7dc907e3b39ccb9f2c942920fd45))
- 2026-10-13 · Fehlerbehebung (measure): NH4-Testbeschreibung auf 15 Minuten korrigieren ([`fc43926`](https://github.com/DrGanmon/aquarium-logbuch/commit/fc43926907bc224cd3cde7bfa0e42ad9c832d833))
- 2026-10-13 · Fehlerbehebung (ci): MongoDB-Cachepfad im Workflow-Schritt initialisieren ([`9b1f4fd`](https://github.com/DrGanmon/aquarium-logbuch/commit/9b1f4fd6e04b380bcfa8d7992fba382838355327))
- 2026-10-13 · Performance (test): isolierte Testdateien parallel ausführen ([`5ce2a48`](https://github.com/DrGanmon/aquarium-logbuch/commit/5ce2a4848a76283c13e84363293c4a3c4348a772))
- 2026-10-13 · Feature (species): Artenkatalog seitenweise laden und globale Suche erhalten ([`3943fae`](https://github.com/DrGanmon/aquarium-logbuch/commit/3943fae3bf6f54537211c870655d552f585a6a15))

## 0.0.11-ALPHA

- 2026-10-13 · Feature (social): Sichtbarkeit und verpflichtende AGB-Zustimmung ergänzen ([`8828238`](https://github.com/DrGanmon/aquarium-logbuch/commit/88282380a44c837c9d2bb1241c3132bb99f5fc5b))

## 0.0.10-ALPHA

- 2026-10-13 · Feature (social): öffentlichen Bilderfeed mit Likes und Kommentaren einführen ([`ecf7f1a`](https://github.com/DrGanmon/aquarium-logbuch/commit/ecf7f1af061d330fc3611f9d34da600a5d8c974b))

## 0.0.9-ALPHA

- 2026-10-13 · Fehlerbehebung (measure): Testbeschreibung unter dem Messfeld über die gesamte Breite anzeigen ([`e5fbbd3`](https://github.com/DrGanmon/aquarium-logbuch/commit/e5fbbd3d08f8661f7f42b78ca2af1a8fa9bb6179))
- 2026-10-13 · Feature (health): Medikamente integrieren und Artenkatalog zentralisieren ([`a26e63f`](https://github.com/DrGanmon/aquarium-logbuch/commit/a26e63f4bb78de8b046d09f1f6b3de295eb93255))

## 0.0.8-ALPHA

- 2026-10-13 · Feature (tests): Testauswahl aus mehreren Suiten ermöglichen ([`af6acc7`](https://github.com/DrGanmon/aquarium-logbuch/commit/af6acc7720da11784df25e58ef7340f3082b6f1e))

## 0.0.7-ALPHA

- 2026-10-13 · Korrektur NH4 ([`5f01a7f`](https://github.com/DrGanmon/aquarium-logbuch/commit/5f01a7f9d6129d5dacf3573f6ffd45163223b2da))
- 2026-10-13 · Dokumentation: KI-Transparenzhinweis ergänzen und App-Logo an den README-Anfang verschieben ([`ae96497`](https://github.com/DrGanmon/aquarium-logbuch/commit/ae96497a58be862f59002a323534ed4f1081da7c))
- 2026-10-13 · Dokumentation: READMEs kompakter gestalten und Modulbeschreibungen in zweisprachiges Handbuch auslagern ([`507cfdc`](https://github.com/DrGanmon/aquarium-logbuch/commit/507cfdc498a74d09c63bef69cc7df572028560e9))
- 2026-10-13 · Feature (frontend): neue Versionen automatisch prüfen und Update-Popup anzeigen ([`6dc752a`](https://github.com/DrGanmon/aquarium-logbuch/commit/6dc752afc43a1662d9f28aeffd1ebe866cf0ec66))

## 0.0.6-ALPHA

- 2026-10-12 · Fehlerbehebung: wirksame KI-Konfiguration im Diagnose-Wizard erkennen ([`e9a93eb`](https://github.com/DrGanmon/aquarium-logbuch/commit/e9a93eb5c916c7330c517e838f393573af0ca205))
- 2026-10-12 · Feature: temporären KI-Chat mit Diagnosekontext am Wizard-Ende hinzufügen ([`0ad9b0a`](https://github.com/DrGanmon/aquarium-logbuch/commit/0ad9b0a76d0cd41738f39d9d885d467792483152))

## 0.0.5-ALPHA

- 2026-10-12 · Fehlerbehebung: Diagnose-Wizard mit schrittweiser Auswahl und Antwortübersicht überarbeiten ([`acd9abe`](https://github.com/DrGanmon/aquarium-logbuch/commit/acd9abe58805c2d673c386361820b290fb5d860d))
- 2026-10-12 · Feature: Krankheitskatalog und Diagnose-Wizard mit Aquariumdaten hinzufügen ([`7332573`](https://github.com/DrGanmon/aquarium-logbuch/commit/733257302edc3a4dc6bdf9fdab49ab1034a5bfe3))

## 0.0.4-ALPHA

- 2026-10-12 · Fehlerbehebung: Sicherheitslücken, Race Conditions und Ressourcenlecks beheben ([`aba7eb5`](https://github.com/DrGanmon/aquarium-logbuch/commit/aba7eb5d5c170ea76ed575e1d3c7afa171ecb260))
- 2026-10-12 · Fehlerbehebung: Backend-Typisierung und Service-Lebenszyklen absichern ([`ca6317c`](https://github.com/DrGanmon/aquarium-logbuch/commit/ca6317ce18809683b3d6bd80f8274bcd78daddb4))
- 2026-10-12 · Feature: TypeScript für das Express-Backend einführen ([`1ef5fda`](https://github.com/DrGanmon/aquarium-logbuch/commit/1ef5fdaea582bbd34e49b34dfe722a8c3941d5b9))

## 0.0.3-ALPHA

- 2026-10-12 · Fehlerbehebung: Dosierpumpen-Verwaltung korrigieren und Oberfläche vereinfachen ([`adc2b60`](https://github.com/DrGanmon/aquarium-logbuch/commit/adc2b60c0c119a54095ceae526b3f8f7d199f24e))
- 2026-10-12 · Feature: Arten aus dem Katalog zu Aquarien hinzufügen ([`2f1f0f7`](https://github.com/DrGanmon/aquarium-logbuch/commit/2f1f0f72b468e7fd575a050ce47a8234e9cf55ec))

## 0.0.2-ALPHA

- 2026-10-12 · Feature: Werkzeug zur Erstellung und Prüfung der Artenbilddatenbank hinzufügen ([`a6f6663`](https://github.com/DrGanmon/aquarium-logbuch/commit/a6f666368750e009e05e95c3b785ed5ce891b010))

## 0.0.1-ALPHA

- 2026-10-12 · Fehlerbehebung: Major-Startwert der ALPHA-Version auf 0 setzen ([`5ea8c05`](https://github.com/DrGanmon/aquarium-logbuch/commit/5ea8c056f6c324235c24abd400411311c9a54c27))
- 2026-10-12 · Feature: automatische ALPHA-Versionierung und Docker-Versionstags ergänzen ([`e85e70b`](https://github.com/DrGanmon/aquarium-logbuch/commit/e85e70be00991cf26eddc4e73fb7b21368d6cf55))

## 0.0.0-ALPHA

- 2026-10-12 · Feature: KI-Chat mobil bildschirmfüllend darstellen ([`f36e67b`](https://github.com/DrGanmon/aquarium-logbuch/commit/f36e67b5b7320bdfcf4f2616aa308c3e5a601562))

## Frühere Historie vor der Versionsbasis

Diese Commits liegen vor der aktuellen Versionsbasis; ihnen wird keine nachträgliche ALPHA-Versionsnummer zugewiesen.

- 2026-10-12 · Feature: Aquariumdaten bei Bedarf laden und Bewohner-Artendetails öffnen ([`68f81d6`](https://github.com/DrGanmon/aquarium-logbuch/commit/68f81d6455d25c2962f9d58c94b3faf340bdf604))
- 2026-10-12 · Feature: vollständige Bun-Unterstützung bei erhaltener Node-Kompatibilität ([`81e9458`](https://github.com/DrGanmon/aquarium-logbuch/commit/81e9458887feea487356be27868a97c59484fdd6))
- 2026-10-12 · Feature: Artenkatalog erweitern und mobile Artendetails mit Bildern ergänzen ([`899df2c`](https://github.com/DrGanmon/aquarium-logbuch/commit/899df2ce5c344ec6c7a1a3f02a4d01c050fa1c40))
- 2026-10-12 · Better Species Kataloge ([`c621eac`](https://github.com/DrGanmon/aquarium-logbuch/commit/c621eacc906423e0ac4f22d3f9855cf99ddba641))
- 2026-10-12 · Add tabbed navigation to profile view with keyboard support and dynamic invite visibility ([`9bb3a3d`](https://github.com/DrGanmon/aquarium-logbuch/commit/9bb3a3dd5a9bf0bb58d7cbf2aa8c623b613bf904))
- 2026-10-12 · Add test inventory tracking system with database migration, service implementation, and UI support: Introduced inventory tracking for consumables, including database migration (`002_test_inventory`), service logic, and Vue.js UI components. Added email reminders for low inventory levels with multilingual HTML templates. Updated automated tests to ensure proper tracking and migration validation for SQLite and MongoDB. ([`3d16dfc`](https://github.com/DrGanmon/aquarium-logbuch/commit/3d16dfc747e1fa4bca627a37d2cec007a2b4a5f1))
- 2026-10-12 · Add custom test runner, detailed progress indicator, and enhanced legal test coverage ([`5112f31`](https://github.com/DrGanmon/aquarium-logbuch/commit/5112f311020127bfb9ef98c5b5aa79312a9dd0eb))
- 2026-10-12 · Add tabbed navigation to admin panel with keyboard support and localized labels ([`4e8a9b0`](https://github.com/DrGanmon/aquarium-logbuch/commit/4e8a9b050dc35d7ef0ea09f319cd2b9946502302))
- 2026-10-12 · Enhance chat layout responsiveness and add detailed multilingual legal notices: Improve chat message container styles with flexible height limits, overflow handling, and refined scroll behavior for better responsiveness. Introduce extensive updates to multilingual legal notices, including GDPR compliance, AI transparency details, and hosting-specific information for German and English locales. ([`9346465`](https://github.com/DrGanmon/aquarium-logbuch/commit/93464650a06d23d58e1156a1bbb139cc0823814f))
- 2026-10-12 · Add multi-architecture Docker image builds for amd64 and arm64: Update GitHub Actions workflow to support building and publishing Docker images for both `linux/amd64` and `linux/arm64` using QEMU and Docker Buildx. Enhance documentation to clarify architecture compatibility and workflow behavior, including pull request validation and automatic architecture selection during pulls. ([`85d3089`](https://github.com/DrGanmon/aquarium-logbuch/commit/85d308911d2efdcf27f1301e032ae5d318626a05))
- 2026-10-12 · Switch Docker setup to use prebuilt image and clarify documentation ([`afdbe3b`](https://github.com/DrGanmon/aquarium-logbuch/commit/afdbe3b33d4e7b4e03a033649b96ca3c309de5a5))
- 2026-10-12 · Switch frontend to vue.js ([`298f349`](https://github.com/DrGanmon/aquarium-logbuch/commit/298f349a93b8ff34a9d6b7093ca6a5bfd70f2d25))
- 2026-10-12 · Add mandatory pre-migration backups and detailed logging for migrations: Introduce pre-migration backups for SQLite and MongoDB through the integrated backup service. Expand migration logging for better transparency, including version checks, execution progress, and summaries. Update backup handling and database adapter behavior to improve reliability. ([`5afb8ea`](https://github.com/DrGanmon/aquarium-logbuch/commit/5afb8ea0ae5d5a595005d96ef3562931b355900c))
- 2026-10-12 · Add GitHub Actions workflow to build and publish Docker images ([`109d888`](https://github.com/DrGanmon/aquarium-logbuch/commit/109d88801847fd5fd5b070f1904b69c422fead70))
- 2026-10-12 · Initialize base database schema and add migration for dosing pumps, including SQLite and MongoDB support. ([`ec6727a`](https://github.com/DrGanmon/aquarium-logbuch/commit/ec6727af8741405137bc49c4705e0d8bcdb4c008))
- 2026-10-11 · Add dosing pump support with APIs, UI, and tests: Introduce dosing pump management for aquariums, including RESTful API endpoints, detailed UI components, input validation, and database migration support. Add lazy loading for logs and improve test coverage for dosing interactions. ([`2841060`](https://github.com/DrGanmon/aquarium-logbuch/commit/2841060c8223916563c33463cac5e297afb01017))
- 2026-10-11 · Prevent duplicate aquarium creation and improve form submission UX: Add deduplication logic to prevent parallel or rapid double-submit errors during aquarium creation. Enhance form submission behavior with "in progress" states, disable buttons during processing, and update text feedback for better user experience. Expand tests to validate deduplication and UI improvements. ([`8fb7606`](https://github.com/DrGanmon/aquarium-logbuch/commit/8fb7606bfff0e7610a625118ec9984d195734fb6))
- 2026-10-11 · Improve aquarium detail handling and chart rendering: Add robust error handling and fallback defaults for aquarium data fetching, including alerts, measurements, logs, and images. Enhance charting utility with better data validation, more resilient range calculation, and improved support for missing or non-finite values. Update associated tests for consistent formatting and frontend functionality. ([`47a08bd`](https://github.com/DrGanmon/aquarium-logbuch/commit/47a08bd70630992895be34d3652f3460242452ad))
- 2026-10-11 · Handle fallback for unsupported parameters in OpenAI proxies: Extract reasoning model detection into a utility, add retries with robust parameter removal for `temperature` and `max_completion_tokens` on 400 errors, and expand test coverage. ([`81861d9`](https://github.com/DrGanmon/aquarium-logbuch/commit/81861d9e491a21b22bcfed8831cb91192362cca3))
- 2026-10-11 · Improve OpenAI compatibility: Add `max_completion_tokens` handling, fallback to `max_tokens` for legacy proxies, and refine reasoning model detection logic. Update tests. ([`39b28bb`](https://github.com/DrGanmon/aquarium-logbuch/commit/39b28bbd8a8ee7fda1e71d2225a2af45d6efd7a1))
- 2026-10-11 · Add user avatar support in chat UI: Enhance chat UI with user avatar display, including fallback for missing avatars, CSS updates for styling, and integration of avatar URL. Update mail configuration and add test coverage for avatar functionality. ([`dca447c`](https://github.com/DrGanmon/aquarium-logbuch/commit/dca447cf3ff5a44b4af293167862aee5172614f9))
- 2026-10-11 · Add GitHub repository link to footer with localization and tests ([`657b707`](https://github.com/DrGanmon/aquarium-logbuch/commit/657b70773f7a380eb8948b5800e8101a96d9e84a))
- 2026-10-11 · Add persistent chat history with smart context compression for aquarium chats: Implement chat history persistence in SQLite and MongoDB, enable intelligent context compression to optimize AI interactions, add API endpoints to fetch or delete history, and update UI to include chat history restoration across sessions. Add tests for compression logic, persistence, and deletion. ([`39eee3a`](https://github.com/DrGanmon/aquarium-logbuch/commit/39eee3a5c9ef08340c51acb0b5cc7f6e02af434e))
- 2026-10-11 · Remove deprecated temperature parameter from Claude API payload and update tests accordingly ([`db7c1ee`](https://github.com/DrGanmon/aquarium-logbuch/commit/db7c1ee5627032da59588831165af7ad29782c0c))
- 2026-10-11 · Add dynamic model fetching support for OpenAI, Google Gemini, and Anthropic Claude in the profile UI with on-demand queries, custom model input, and localized strings; update backend APIs and tests. ([`1ac69d4`](https://github.com/DrGanmon/aquarium-logbuch/commit/1ac69d4203d84043cb4d6b556875d89d2284b73a))
- 2026-10-11 · Add parallel timer support with multi-timer dock, cancel/reset actions, localized strings, UI updates, and tests ([`69f7ff0`](https://github.com/DrGanmon/aquarium-logbuch/commit/69f7ff0f164562bb9bfc01b5e91e048357be55ae))
- 2026-10-11 · Enhance Anthropic Claude support: add Claude 3.7 Sonnet, improve message processing, refine error handling, and expand tests. ([`fbd7a31`](https://github.com/DrGanmon/aquarium-logbuch/commit/fbd7a318a4cd80d687617d49eb8098342b59009f))
- 2026-10-11 · Add support for GPT-6 models (gpt-6, gpt-6-mini, gpt-5) in UI, backend logic, documentation, and tests ([`422b012`](https://github.com/DrGanmon/aquarium-logbuch/commit/422b012e4e29a1bc15366bd39d7972a160d8bc49))
- 2026-10-11 · Update "User Management" button text to "Admin" in UI, translations, and documentation. ([`af04df6`](https://github.com/DrGanmon/aquarium-logbuch/commit/af04df6af97b5c6d12b9f7ced14f7023e77b5990))
- 2026-10-11 · Add multilingual support for email templates and corresponding tests in English and German ([`272ca01`](https://github.com/DrGanmon/aquarium-logbuch/commit/272ca013ee34327243bb16544e8274cba68696a8))
- 2026-10-11 · Add multilingual support for email templates and corresponding tests in English and German ([`868f9f9`](https://github.com/DrGanmon/aquarium-logbuch/commit/868f9f91955ea65772b2b42511434cfe11672957))
- 2026-10-11 · Add multilingual support with German and English translations for all UI components and features. ([`d47443d`](https://github.com/DrGanmon/aquarium-logbuch/commit/d47443dabd21142de675d485124e844e2bd3b1c8))
- 2026-10-11 · Add tests and worker support for parallelized frontend tasks: CSV parsing, species search, compatibility checks, stats computation, and image processing. ([`2e550b7`](https://github.com/DrGanmon/aquarium-logbuch/commit/2e550b78bee408581961b819c893f3eb8ff12770))
- 2026-10-11 · Add dynamic bundling support for frontend builds with minified/unminified modes; update server asset detection, build scripts, tests, Dockerfile, and README. ([`73e7911`](https://github.com/DrGanmon/aquarium-logbuch/commit/73e7911253a8d47ab0d4fe47a4fb942961da0030))
- 2026-10-11 · Add build script for bundling and minifying frontend assets with `esbuild`; update server logic for dynamic asset loading, test cases, Dockerfile, and README ([`8d999cb`](https://github.com/DrGanmon/aquarium-logbuch/commit/8d999cbde54ec6fab6369c9d0f2a2991010095c4))
- 2026-10-11 · Add comprehensive admin panel with user management, registration settings, invitation workflows, backups, logs, and SMTP configuration. ([`bb3a3c6`](https://github.com/DrGanmon/aquarium-logbuch/commit/bb3a3c6bc09d03caa59d7ccdf0e9094f0123710f))
- 2026-10-11 · Add multi-provider AI chat support, including OpenAI, Google Gemini, and Anthropic Claude integration. ([`2c3eea0`](https://github.com/DrGanmon/aquarium-logbuch/commit/2c3eea033153f3861893acdd210d6131bd727ce2))
- 2026-10-11 · Add AI-powered chat support for aquariums, including system prompt generation, OpenAI integration, detailed context setup, endpoints, and browser UI enhancements. ([`657d4ad`](https://github.com/DrGanmon/aquarium-logbuch/commit/657d4ad4d3eaae18fc3d6b4ef60e939603e2e4d0))
- 2026-10-11 · Add CSS rules for checkbox and radio button styling, including improved picker formatting and tests for validation ([`f07b167`](https://github.com/DrGanmon/aquarium-logbuch/commit/f07b167c8323a3987c8dd7e879a3c8af352af231))
- 2026-10-11 · Add legal configuration service with support for emails, license metadata, EU AI Act compliance, and footer links. ([`c0d8453`](https://github.com/DrGanmon/aquarium-logbuch/commit/c0d8453d12a352d2f2606e73d538883502c44e50))
- 2026-10-11 · Add CSV export and import support with auto-detection, parsing, mapping, tests, and endpoints for measurements ([`461b98b`](https://github.com/DrGanmon/aquarium-logbuch/commit/461b98be916c124576ac45d0db6aee9c5e8fd177))
- 2026-10-11 · Add tests for cycle calculations, email templates, and reminder workflows. Include measure and fertilize templates, API validations, and the ReminderService implementation. ([`249e1ae`](https://github.com/DrGanmon/aquarium-logbuch/commit/249e1ae34122dd2590507ed8dc4d2d37586cb16f))
- 2026-10-11 · Add support for aquarium sharing invites with email notifications, token-based acceptance, pending/decline workflows, and shared tabs. ([`7bdb0c6`](https://github.com/DrGanmon/aquarium-logbuch/commit/7bdb0c6cb604f181adf31d69ea5e5688ccbf460d))
- 2026-10-11 · Add comprehensive PWA and icon support with optimized manifest, multi-resolution icons, mobile shortcuts, HTML email branding, and updated tests. ([`60303d8`](https://github.com/DrGanmon/aquarium-logbuch/commit/60303d8d861a5e8e830055b90512a0f55d649305))
- 2026-10-11 · Add invitation-only registration mode with customizable options including expiry periods, admin control, and enhanced invite workflows. ([`dc2d881`](https://github.com/DrGanmon/aquarium-logbuch/commit/dc2d8814a705ae16666b92d7ef6477aac1c51ca3))
- 2026-10-11 · Add support for configurable graph ranges including custom date filters, user profile defaults, and enhanced UI with date picker integration. ([`5563386`](https://github.com/DrGanmon/aquarium-logbuch/commit/5563386ee97888f1f83c9cc25702d618d8b61083))
- 2026-10-11 · Add two-step account deletion process with email confirmation, cascading data cleanup, and template support. ([`b742029`](https://github.com/DrGanmon/aquarium-logbuch/commit/b742029abff5fbeedb21ad7159c110f3dbe634df))
- 2026-10-11 · Add modular HTML email templates with dynamic token support and .tpl rendering functions for verification, password reset, and test emails. Update documentation and add tests. ([`9dbcc75`](https://github.com/DrGanmon/aquarium-logbuch/commit/9dbcc7533445f24a830bd0474c48c90a6d847ec6))
- 2026-10-11 · Add SMTP mail service with configuration, queueing, rate-limiting, templated emails, and testing support ([`88e0daa`](https://github.com/DrGanmon/aquarium-logbuch/commit/88e0daa3375760f6ed54bdd34347a6bbf8dea243))
- 2026-10-11 · Add .gitkeep files to ensure version control for empty directories ([`f3017c1`](https://github.com/DrGanmon/aquarium-logbuch/commit/f3017c1365306146bba72db92a6c7aca93e14ba3))
- 2026-10-11 · Add comprehensive test coverage for aquarium features including gallery management, inhabitants, and backup/restore functionality. Extend API and UI to support multi-image handling, captions, primary image designation, and advanced aquarium metadata. ([`aa9b170`](https://github.com/DrGanmon/aquarium-logbuch/commit/aa9b170a028c07fa8398fbd64f1831094de44af9))
- 2026-10-11 · Add backup limit support with auto-deletion of oldest backups and improved UI labels ([`6c675a1`](https://github.com/DrGanmon/aquarium-logbuch/commit/6c675a1b43378693be1280875037c58e7a7fe864))
- 2026-10-11 · Add backup limit support with auto-deletion of oldest backups and improved UI labels ([`386dea2`](https://github.com/DrGanmon/aquarium-logbuch/commit/386dea2337037b0b5596dd434f4b6df33381c7b4))
- 2026-10-11 · Add backup and restore functionality with manual backups, automated scheduling, import/export support, and admin UI integration. ([`957d2b6`](https://github.com/DrGanmon/aquarium-logbuch/commit/957d2b6eba9e79152d75ecfb4599ddae367c10bf))
- 2026-10-11 · Add multithreading support with worker-thread pool, async crypto tasks, and multi-worker clustering configuration ([`21f485f`](https://github.com/DrGanmon/aquarium-logbuch/commit/21f485f0db6ca5e5daf930a44cba6ddd547051da))
- 2026-10-10 · Add Docker Compose support for SQLite and MongoDB with example environment configuration and MongoDB adapter implementation ([`d79f272`](https://github.com/DrGanmon/aquarium-logbuch/commit/d79f27252242101fce19e8d0bf316e1063fa0265))
- 2026-10-10 · Add push notifications and background timers with service worker, manifest support, and UI configurations. ([`520d9ba`](https://github.com/DrGanmon/aquarium-logbuch/commit/520d9badeedd0060671222a8f51ca53c60cffe22))
- 2026-10-10 · Add logging and supervision support with a monitored process, structured logs, and admin log management. ([`110d9df`](https://github.com/DrGanmon/aquarium-logbuch/commit/110d9df35b9c33a7fbdbcbc33b5b2552bde5b94c))
- 2026-10-10 · Add theme support with light, dark, and system modes, including UI integration, testing, and dynamic styling updates. ([`c1b4eb3`](https://github.com/DrGanmon/aquarium-logbuch/commit/c1b4eb3d397d3cb53cff017d64f391481c8cb636))
- 2026-10-10 · Add maintenance logs with CRUD operations, timeline support, and UI integration ([`998d27f`](https://github.com/DrGanmon/aquarium-logbuch/commit/998d27fc52a6790210e6548cac9d4db55da612e7))
- 2026-10-10 · Add freshwater species configurations for cichlids and popular fish ([`c01243b`](https://github.com/DrGanmon/aquarium-logbuch/commit/c01243b749cceb0791ea950d75a4c07a47c84c9f))
- 2026-10-10 · Add suite-service for handling test configurations and related tests ([`25307f9`](https://github.com/DrGanmon/aquarium-logbuch/commit/25307f99888e0d4af3cc773c319661ee16a5882f))
- 2026-10-10 · Add support for configurable water test suites and profiles ([`5e8c6ae`](https://github.com/DrGanmon/aquarium-logbuch/commit/5e8c6aec9dfba387de4d395356df279227afe114))
- 2026-10-10 · Add user profile support with avatar upload, profile updates, and validation ([`90887c6`](https://github.com/DrGanmon/aquarium-logbuch/commit/90887c67f967a5383a2208585f82c8c695f35623))
- 2026-10-10 · Enable image upload, viewing, and deletion for aquariums. Add owner-based aquarium sharing with role-based permissions. Include related tests and UI updates. ([`3495175`](https://github.com/DrGanmon/aquarium-logbuch/commit/3495175452bdc78b41a17f77f929ae7c8b9748a3))
- 2026-10-10 · add admin and aquarium routes with supporting services and middleware ([`dfa98fa`](https://github.com/DrGanmon/aquarium-logbuch/commit/dfa98faa75471abd12b0ab1ef2540acff29a899a))
- 2026-10-10 · add testing ([`dbaa3bf`](https://github.com/DrGanmon/aquarium-logbuch/commit/dbaa3bf1a109fef7ae863102245dc8a260068ca6))
- 2026-10-10 · add oidc connection after user is already created ([`39da329`](https://github.com/DrGanmon/aquarium-logbuch/commit/39da32998e41db46123712c455cc8051995a3ee7))
- 2026-10-10 · add admin menu ([`1081570`](https://github.com/DrGanmon/aquarium-logbuch/commit/108157033d1d1eb81c7ac71682b99fd3f881c1d9))
- 2026-10-10 · add oidc ([`ded8c29`](https://github.com/DrGanmon/aquarium-logbuch/commit/ded8c299347537ecfbfbf23123a5da2c96b5406e))
- 2026-10-10 · initialer commit ([`5d2f8bf`](https://github.com/DrGanmon/aquarium-logbuch/commit/5d2f8bfde5f79230cf34f7dc9447e0f5cf9ac6d3))
