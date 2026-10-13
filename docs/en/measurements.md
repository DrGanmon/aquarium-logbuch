# Measurements, timers and test usage

[Manual](README.md) · [Deutsch](../de/measurements.md) · [Project overview](../../README.en.md)

Water tests are stored modularly as **JSON files** in `../../src/config/suites` (or `data/suites/` for custom suites):
- **Default Suite (`jbl-pro-aquatest.json`):** JBL PRO AQUATEST Testlab liquid tests based on official instructions with verified reaction times (e.g., Potassium 90s, Nitrite 5 min, Nitrate 10 min, Ammonium 10 min, Phosphate 10 min, Iron 10 min, Copper 15 min, Silicate 3 min).
- **Consolidated pH Test:** A unified pH test (3.0 to 10.0) replaces fragmented test ranges for clean recording.
- **Extensible:** Additional test sets (e.g., `jbl-easy-7in1.json` test strips) can be added as JSON.
- **User Selection:** Users can choose their preferred test suite and select which specific tests they own/perform in profile settings (`#/profile`) or during measurement (`#/a/:id/messen`).

### JBL drop-test usage and refill reminders

In your profile, **Water test usage & refills** lets you set previous usage and the total capacity of each refill. **New refill / reset counter** resets usage to 0 and enables a new reminder for that test. Existing measurement history is not counted retroactively; enter usage of your current bottle once.

Every newly saved measurement value counts as **one test**, including `0`, CSV imports and measurements across multiple aquariums. Usage belongs to the user recording the measurement, including shared aquariums. Empty, invalid or rejected values are not counted. Deleting a measurement does not replenish reagents. Thermometers and CO₂ calculated from pH/KH do not consume their own reagents. The chosen suite determines which tests are counted; test strips are not counted as individual JBL drop tests.

Approximate manufacturer capacities per kit/refill, researched on 2026-10-12:

| JBL PROAQUATEST | Measurements (approx.) | Source |
|---|---:|---|
| pH 3.0–10.0 | 50 | [JBL test overview](https://www.jbl.de/de/themenwelt/essential_section/132?country=de&cpref=32) |
| pH 6.0–7.6 / 7.4–9.0 | 80 | [JBL pH 6.0–7.6](https://www.jbl.de/de/produkte/detail/8643/jbl-proaquatest-ph-60-76?country=de&cpref=824), [JBL pH 7.4–9.0](https://www.jbl.de/de-de/productsv2/detail/25161373) |
| NH₄, NO₂, PO₄ Sensitive, Fe, Cu, SiO₂ | 50 each | [JBL test overview](https://www.jbl.de/de/themenwelt/essential_section/132?country=de&cpref=32) |
| NO₃ | 40 | [JBL nitrate](https://www.jbl.de/de-de/productsv2/detail/25211652) |
| O₂ | 40 | [JBL oxygen](https://www.jbl.de/de-lu/productsv2/detail/25169665) |
| K | 25 | [JBL potassium](https://www.jbl.de/fr-mg/productsv2/detail/25211514) |
| Mg Fresh water | 60 | [JBL PROAQUATEST catalogue (PDF)](https://pm-aquaristik.de/jbl-pdf/jbl-pro-aquatest-katalog.pdf) |
| KH, GH, Ca, marine Mg-Ca, CO₂ Direct | variable; enter your estimate | [JBL calcium / titration tests](https://www.jbl.de/de/produkte/detail/8682/jbl-proaquatest-ca-calcium?country=de&cpref=736), [JBL CO₂ Direct](https://www.jbl.de/de/produkte/detail/8691/jbl-proaquatest-co2-direct?country=de&cpref=384) |

Capacity remains adjustable for different pack sizes and individual drop consumption. Select the pH/magnesium variant and direct or calculated CO₂ in your profile. At **75% usage**, one email per refill is queued with the test name and estimated remaining capacity, provided reminders are enabled, the email address is verified and SMTP is configured. Thresholds round up to whole tests: test 38 for a capacity of 50, or test 19 for 25. Once SMTP is configured, the reminder scheduler also checks pending reminders every 30 minutes. Templates: `test-refill-reminder.tpl` and `test-refill-reminder.en.tpl`; overrides belong in `../../data/mail-templates`. Usage and reminder status are preserved by backup/restore with both SQLite and MongoDB.

## Reaction times and target values

Test parameters and default values are defined in `../../src/config/suites/jbl-pro-aquatest.json` and `config.js`.

- **Reaction Times:** All default timings are verified against official manufacturer instructions (`verified: true`).
- **Target Ranges:** Guidelines for fresh and saltwater tanks. Verify and adjust according to your specific setup and inhabitant needs. The application does not replace professional veterinary or aquaristic advice.

## Measurement workflow, history and CSV

Select a test suite and the tests you actually use in the profile or measurement form (`#/a/:id/messen`). Values are assessed while typing; decimal commas are accepted. Multiple reaction timers can run simultaneously. Sound, vibration, wake locks and system notifications depend on browser support and permissions. The service worker handles timer messages but does not cache an offline copy of the app; operating systems may suspend background processes. A test notification is available in the profile.

Charts and the measurements table show tank history. Quick filters range from seven days to all records; custom start and end dates are supported. The default is 90 days unless a different profile preference is saved. Out-of-range values produce warnings or critical alarms that can be acknowledged.

CSV export offers semicolons with a UTF-8 BOM for Excel or commas for standard CSV. Export produces CSV files rather than `.xlsx` workbooks. Import provides interactive mapping for dates, time, notes and water parameters. German and ISO date formats and comma/period decimal separators are supported. Imported values undergo threshold checks and contribute to usage for applicable tests.
