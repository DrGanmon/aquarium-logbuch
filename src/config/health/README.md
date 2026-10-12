# Aquarium Health Data – Deutsch / English

```
de/        Krankheiten und Diagnose-Fragebäume (Deutsch)
en/        Diseases and diagnosis question trees (English)
species/   Artenlisten (Deutsch) – von beiden Sprachfassungen über die Art-ID referenziert
           Species lists (German) – referenced by both language versions via species ID
```

## Deutsch

| Datei | Inhalt |
|---|---|
| `diseases-freshwater.json` | 20 Krankheiten, 117 Arten (Süßwasserfische, Buntbarsche, Wirbellose) |
| `diseases-saltwater.json` | 12 Krankheiten, 31 Meerwasserarten |
| `diagnosis-freshwater.json` | Fragebaum pro Art, höchstens 13 Ja/Nein-Fragen |
| `diagnosis-saltwater.json` | Fragebaum pro Meerwasserart |

Messbare Fragen haben ein Feld `measurable` mit Bedingungen (`conditions`) und Kurzform (`expression`), z. B.
`gh < species.gh.min || gh > species.gh.max`. Verweise `species.*` beziehen sich auf die Werte der Art in `species/`.
Parameter und Einheiten stehen im Block `parameters`, die Auswertungsregeln unter `usage.measurable`.

Messbare Fragen: `water_bad`, `temp_low`, `params_out_of_range` (Temperatur, pH, GH, KH gegen Min/Max der Art), `after_med` (Kupfer), `carbon` (Ausstattung).

## English

Same structure and content as the German files; IDs, species mapping, question trees and matrices are identical. Species `name` fields use English common names.
Value translations: `gering/mittel/hoch/sehr hoch` → `low/medium/high/very high`, `Träger möglich (…)` → `possible carrier (…)`, `ja/bedingt/nein` → `yes/conditional/no`, certainty `hoch/mittel/niedrig` → `high/medium/low`.

Measurable questions carry a `measurable` field with `conditions` and a short `expression`; `species.*` references point to the species values in `species/`. See `parameters` and `usage.measurable`.

## Hinweis / Note

Keine tierärztliche Diagnose. Not a veterinary diagnosis. The yes-probabilities in the matrices are expert estimates derived from the cited sources, not measured values.
