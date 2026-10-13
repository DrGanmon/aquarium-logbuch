# Species catalog and stocking checks

[Manual](README.md) · [Deutsch](../de/species.md) · [Project overview](../../README.en.md)

Stocking is powered by modular **JSON species catalogs** in `../../src/config/species` (or `data/species/` for custom catalogs):
- **Catalogs:**
  - `freshwater-popular.json`: Common Tetras, Livebearers, Labyrinth fish, Rasboras, Catfish, and Loaches.
  - `cichlids.json`: South American Dwarf Cichlids, Angelfish, Discus, and African Cichlids (Malawi / Tanganyika).
  - `invertebrates.json`: Dwarf shrimp, Atyid filter shrimp, dwarf crayfish, and ornamental snails.
  - `saltwater.json`: Marine fish, Clownfish, Cleaner shrimp, and Hermit crabs.
- **Species View (`#/species`):** Browse and filter species by water type or category and inspect water requirements (temperature, pH, GH, KH), tank size, swimming zone, and temperament.
- **Behavior & Territoriality Checks:**
  - **Betta splendens:** Enforces solitary keeping rules (multiple Bettas trigger critical alarms), protects against fin nippers (Tiger barbs, Serpae tetras), and warns against rivalry with fancy long-finned fish (Guppies).
  - **Minimum Tank Sizes:** Warns when tank volume is below recommended minimums (e.g. Angelfish from 200 L, Discus from 300 L, Clown loaches from 400 L).
  - **Schooling Sizes:** Warns if schooling fish (Neons, Rummy-noses, Zebra danios) are kept below recommended minimum group sizes.
  - **Predator-Prey & Fin Protection:** Warns about dwarf shrimp predation risks from larger cichlids/angelfish, claw-pinching risks from crayfish, and snail-eating predators (Assassin snails, Loaches).
  - **Biotope & Water Chemistry Conflicts:** Detects conflicting requirements (e.g., alkaline African cichlids vs. softwater South Americans, or temperate coldwater fish vs. warm tropical species).

## Catalog data and images

The catalog contains 147 unique species; cichlids are maintained in `cichlids.json`. `symphysodon-spp` remains an alias for `symphysodon-sp`. Cardinal shrimp and Tylomelania use a Sulawesi profile derived from the supplied catalog ranges. Derived KH ranges and general marine ranges are guidelines rather than independently verified species-specific danger limits.

Optional `salinity` ranges use `min`, `max`, `idealMin` and `idealMax` in **‰**. Values appear in species details and structured AI context when present. The supplied catalogs do not include salinity ranges; this schema does not add a test method or change measurement limits.

146 species have local WebP images; the supplied mapping lacks an image for `nannostomus-beckfordi`. `../../public/species-images/manifest.json` maps images and credits; `attribution.json` retains the supplied attribution data. The camera button in species details opens author, source, license and editing notes. Each image retains its own license, including any ShareAlike requirements, independently of the software license.

Images are loaded locally, resized without cropping to at most 768 × 768 pixels and encoded as WebP at quality 74. Reimport with Python 3 and Pillow using `python3 scripts/import-species-images.py "/path/to/out"`; attribution is retained and compression is documented.

## Add residents from the catalog

Use the species card or detail dialog to select a compatible aquarium with write access and enter a count. Optional name fields allow individual residents; unnamed animals are stored as a group. Known residents also open catalog details from the tank view, including with read-only access. Custom species without a match display an explanatory note.
