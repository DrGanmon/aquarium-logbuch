# Diseases and diagnosis assistant

[Manual](README.md) · [Deutsch](../de/health.md) · [Project overview](../../README.en.md)

**Health** (`#/health`) contains 32 freshwater/saltwater disease descriptions associated with 147 canonical species. Filter by water type, species, name, synonyms or symptoms. Start the assistant from this page, an aquarium or a resident; aquarium and resident selections can be prefilled.

The versioned bilingual JSON database in `../../src/config/health` is copied into the compiled backend and Docker images. Existing species data remain unchanged; the Discus alias `symphysodon-spp` resolves to `symphysodon-sp`.

The server obtains the selected aquarium, species and latest readings for each parameter. Measurements no older than 24 hours can answer questions automatically; missing or older values are not treated as normal. Empty species bounds are ignored. A known positive condition can determine a composite “yes”; “no” requires all necessary readings. A normal copper reading does not establish whether medication was recently used. Equipment questions remain manual when explicit equipment data are unavailable.

Decision trees guide the initial questions. Unknown answers and inconclusive paths use the supplied matrices, species priors and information gain to choose remaining questions, with at most 13 manual questions and any smaller species limit preserved. Results show likely causes, species-specific signs, confirmation guidance and source references. Percentages are estimated model weights, not clinically validated diagnostic accuracy. The app does not prescribe medication or calculate doses.

Read access to an owned or accepted shared aquarium is required; residents must belong to that aquarium. Client-supplied water values cannot override stored readings. Answers are not permanently stored and no AI provider or API key is needed. Run `npm test -- test/health.test.js` for catalog, complete question-path and SQLite/MongoDB access/context regression tests.

After completing the health wizard, an optional chat uses the AI provider selected in the profile, provided an API key and effective model are available for it. As in the profile, personal or server-configured keys and default models are supported. Older profiles without an explicit provider selection infer the provider from their saved keys. The server includes aquarium/resident data, latest readings, answered questions (including automatic answers) and recalculated suspected diagnoses. This chat neither loads nor saves aquarium chat history; messages exist only while its dialog is open and are discarded on closing. This is stated before opening and within the dialog. Sending transfers the messages and diagnosis context to the selected AI provider, whose retention policies still apply. Changes to relevant measurements may require restarting the wizard.

## Data structure

The source file layout and fields are documented in the [database description](../../src/config/health/README.md).
