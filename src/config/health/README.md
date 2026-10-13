# Aquarium Health Data – Deutsch / English

Gesundheitsdaten aus der gelieferten Sammlung (Version 2026-10-13), ergänzt um projektinterne Referenzen auf den gemeinsamen Artenkatalog.
Health data from the supplied dataset (version 2026-10-13), adapted to reference the shared species catalog.

```text
de/    Krankheiten, Diagnose-Fragebäume und Arznei-/Behandlungsmittel (Deutsch)
en/    Diseases, diagnosis question trees and medications/treatment agents (English)
```

## Gemeinsame Artenquelle / Shared species source

Alle 147 Arten und ihre Wasseranforderungen liegen ausschließlich unter `src/config/species/`. Es gibt keinen separaten `health/species/`-Katalog. Health speichert nur artspezifische Krankheitszuordnungen, Vorsichtsmaßnahmen, Fragebäume und Ausgangsgewichte. Namen und wissenschaftliche Bezeichnungen werden vom gemeinsamen `SpeciesCatalog` in der angefragten Sprache ergänzt; Messwertregeln beziehen ihre Grenzwerte aus derselben Quelle wie der Artenkatalog und der Besatz.

All 147 species and their water requirements are defined only in `src/config/species/`. Health stores disease associations, cautions, question trees and priors keyed by species ID, rather than duplicating names or water requirements. The shared `SpeciesCatalog` supplies localized names and ranges at runtime.

`symphysodon-spp` bleibt ein Alias für `symphysodon-sp`; gespeicherte Zuordnungen verwenden die kanonische ID. Nach dem Zusammenführen des Alias enthalten die Gesundheitsdaten 116 Süßwasser-/Wirbellosenprofile und 31 Meerwasserprofile.
`symphysodon-spp` remains an alias for `symphysodon-sp`. After merging that alias, the health data contains 116 freshwater/invertebrate profiles and 31 marine profiles.

## Dateien / Files

| Datei / File | Inhalt / Content |
|---|---|
| `diseases-freshwater.json` | 25 Krankheiten / diseases; `recommendedMedications` verlinkt Behandlungsmittel / references treatment agents |
| `diseases-saltwater.json` | 13 Krankheiten / diseases; ebenfalls mit Medikamentenzuordnungen / also includes medication associations |
| `diagnosis-freshwater.json` | Artenbezogene Fragen und Matrizen, höchstens 13 manuelle Fragen / species-specific trees and matrices, at most 13 manual questions |
| `diagnosis-saltwater.json` | Entsprechende Meerwasser-Diagnosedaten / corresponding marine diagnosis data |
| `medications.json` | 20 Arznei-/Behandlungsmittel und 4 Hilfsmittel / 20 medicines/treatment agents and 4 supplies |

Hinzugekommen sind Karpfenläuse, Ankerwürmer, Bandwürmer, Haarwürmer und Ammoniak-/Nitritvergiftungen (Süß- und Meerwasser).
New entries cover fish lice, anchor worms, tapeworms, capillariasis and ammonia/nitrite poisoning in fresh and salt water.

## Medikamente / Medications

`legalStatus`: `otc`, `rx`, `not_a_medicine`. Der Status betrifft Deutschland/EU laut Datenquelle. `legalStatusVerified` unterscheidet dort einzeln belegte von nicht einzeln belegten Angaben. Diese Kennzeichnung ist keine zusätzliche Prüfung durch das Projekt.
`legalStatus` refers to Germany/EU according to the dataset. `legalStatusVerified` records the source's evidence status, rather than independent verification by this project.

`role`: `first_choice`, `alternative`, `supportive`, `vet_only`, `euthanasia`. Die Rollen und Hausapotheke-Bewertungen werden als Angaben der Datenquelle angezeigt. Warnungen zu Wirbellosen, Produktbeispiele und Quellen bleiben erhalten. Die App berechnet keine Dosierung und leitet keine Therapie aus einer Diagnose ab.
Roles and home-pharmacy ratings are displayed as source information. Invertebrate cautions, product examples and references are retained. The app does not calculate doses or derive a treatment plan from a diagnosis.

## Messbare Fragen / Measurable questions

`measurable.conditions` und `expression` beschreiben messbare Fragen; `species.*` verweist auf den zentralen Artenkatalog. Parameter und Einheiten stehen unter `parameters`. Aktuelle gespeicherte Werte können Antworten liefern; fehlende oder veraltete Werte gelten nicht als normal. Die Wahrscheinlichkeiten in den Matrizen sind Quellenschätzungen, keine klinisch gemessenen Wahrscheinlichkeiten.
`measurable.conditions` and `expression` describe measurable questions; `species.*` references the shared catalog. Parameters and units are defined in `parameters`. Recent stored readings may supply answers; missing or stale values are not considered normal. Matrix probabilities are source estimates, not clinically measured probabilities.

Keine tierärztliche Diagnose. Keine Dosierungsangaben. / Not a veterinary diagnosis. No dose information.
