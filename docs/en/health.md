# Diseases and diagnosis assistant

[Manual](README.md) · [Deutsch](../de/health.md) · [Project overview](../../README.en.md)

**Health** (`#/health`) contains 38 freshwater/saltwater disease descriptions associated with 147 canonical species. Filter by water type, species, name, synonyms or symptoms. Start the assistant from this page, an aquarium or a resident; aquarium and resident selections can be prefilled.

The versioned bilingual JSON database in `../../src/config/health` is copied into the compiled backend and Docker images. Supplied species data are merged into the shared catalog in `src/config/species/`; the Discus alias `symphysodon-spp` resolves to `symphysodon-sp`.

The server obtains the selected aquarium, species and latest readings for each parameter. Measurements no older than 24 hours can answer questions automatically; missing or older values are not treated as normal. Empty species bounds are ignored. A known positive condition can determine a composite “yes”; “no” requires all necessary readings. A normal copper reading does not establish whether medication was recently used. Equipment questions remain manual when explicit equipment data are unavailable.

Decision trees guide the initial questions. Unknown answers and inconclusive paths use the supplied matrices, species priors and information gain to choose remaining questions, with at most 13 manual questions and any smaller species limit preserved. Results show likely causes, species-specific signs, confirmation guidance and source references. Percentages are estimated model weights, not clinically validated diagnostic accuracy. The app does not prescribe medication or calculate doses.

Read access to an owned or accepted shared aquarium is required; residents must belong to that aquarium. Client-supplied water values cannot override stored readings. Answers are not permanently stored and no AI provider or API key is needed. Run `npm test -- test/health.test.js` for catalog, complete question-path and SQLite/MongoDB access/context regression tests.

After completing the health wizard, an optional chat uses the AI provider selected in the profile, provided an API key and effective model are available for it. As in the profile, personal or server-configured keys and default models are supported. Older profiles without an explicit provider selection infer the provider from their saved keys. The server includes aquarium/resident data, latest readings, answered questions (including automatic answers) and recalculated suspected diagnoses. This chat neither loads nor saves aquarium chat history; messages exist only while its dialog is open and are discarded on closing. This is stated before opening and within the dialog. Sending transfers the messages and diagnosis context to the selected AI provider, whose retention policies still apply. Changes to relevant measurements may require restarting the wizard.

## Data structure

The source file layout and fields are documented in the [database description](../../src/config/health/README.md).

## Medications and supplies

The **Medications & supplies** tab contains 20 medicines/treatment agents and four supplies from the supplied dataset. Filter by water type, disease or legal status and search by name, active substance or product. Details include substances, product examples, disease associations, cautions, source-provided use guidance, home-pharmacy ratings and references. Medication details link to diseases, and disease details link to the associated agents.

Roles and ratings are source information rather than a treatment plan derived automatically from a diagnosis. Legal status refers to Germany/EU according to the source. Badges distinguish individually documented from undocumented claims in that dataset; the project does not independently confirm their legal status. Invertebrate compatibility warnings are shown separately. There is no dose calculation; consult a veterinarian and current product instructions.

## Updated data and shared species catalog

The catalog contains 25 freshwater and 13 marine diseases, including fish lice, anchor worms, tapeworms, capillariasis and ammonia/nitrite poisoning. Both languages share the same disease, medication and species IDs.

All 147 unique species are defined only in `src/config/species/`; the former `src/config/health/species/` folder is removed. Localized health documents store disease and diagnosis associations by species ID, without copying species names or water requirements. The shared species service supplies names and ranges to the catalog, stocking checks and health module. The Discus alias remains supported. Merging it leaves 116 freshwater/invertebrate and 31 marine profiles.

Authenticated endpoints `GET /api/health/medications` and `GET /api/health/medications/:id` provide the catalog and details. `GET /api/health/diseases/:id` includes resolved treatment agents. Run `npm test -- test/health.test.js test/health_medications.test.js` to check diagnosis paths, sources, associations, shared species values and API access for SQLite and MongoDB.
