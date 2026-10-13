# Legal pages and licenses

[Manual](README.md) · [Deutsch](../de/legal.md) · [Project overview](../../README.en.md)

## Pages and operator details

The footer remains accessible without login and links to the imprint (`#/impressum`), terms (`#/terms`), privacy page (`#/datenschutz`), licenses (`#/lizenzen`) and contact (`#/kontakt`). These pages describe account and aquarium data, sessions, emails, logs and optional AI services. They also disclose AI-assisted development and the aquarium assistant.

Manage operator and contact details in the admin panel. `CONTACT_EMAIL` and `IMPRINT_EMAIL` set the respective contact addresses; the configured administrator address is the fallback. Review and complete operator details and page content for your installation before public operation.

## Software and images

The software uses [CC BY-NC-SA 4.0](../../LICENSE). Non-commercial use and modifications require attribution and the same license for derivatives. Commercial use requires prior written permission.

Libraries retain their own licenses. Species images use the licenses specified in their individual credits rather than automatically adopting the software license. Species details display authors, sources, license links and edits; the full mapping is retained in `../../public/species-images/attribution.json`. See the [species module](species.md).

## Terms and Social images

Registration requires explicit acceptance of the current terms. Text and version are served together at `/api/terms?language=de` or `en`; the accepted version and timestamp provide account-level evidence. Material changes require increasing `TERMS_VERSION`. The royalty-free, non-exclusive content licence is limited to app operation and the chosen visibility. Copyright remains with users; advertising outside the app, sales and AI training are excluded. See the [Social manual](social.md) for visibility, image deletion and backup retention. Acceptance of terms does not replace data protection consent.
