<p align="center">
  <img src="public/icon-192.png" alt="Aquarium-Logbuch Logo" width="96" height="96">
</p>

# Aquarium-Logbuch

Aquarium-Logbuch is a self-hosted web app for water parameters, residents and aquarium care. It combines measurement history, care logs and reminders, supporting multiple users with separate or shared tanks. A species catalog, diagnosis assistant and optional AI chat complement freshwater and saltwater tank management.

[Deutsch](README.md) · **English** · [Manual](docs/en/README.md) · [Changelog](CHANGELOG.md)

## Transparency notice: AI-generated software

**This app was written and is developed with the help of generative AI.** Its source code and documentation contain AI-generated content. This voluntary disclosure follows the transparency approach of [Article 50 of the EU AI Act (Regulation (EU) 2024/1689)](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50); it is not a declaration of full legal compliance. AI-assisted development alone does not create a blanket labeling obligation for all software.

In the optional AI chat, you interact with an AI system; its responses are automatically generated and may be incorrect or incomplete. Check recommendations before acting on them. Water assessments and suspected diagnoses do not replace professional or veterinary examination. Sending a chat request transfers messages and aquarium context to the selected AI provider; see the [AI manual](docs/en/ai-chat.md) for details.

## Features for users

- **Manage aquariums:** Tank details, equipment, photos, galleries and named residents with portraits.
- **Record water parameters:** 15 parameters, freely combined tests from multiple suites, live assessments and simultaneous reaction timers.
- **Review history:** Charts with custom date ranges, warnings and alarms you can acknowledge.
- **Document care:** Logbook for water changes, filter maintenance, plants, fertilization and other activities.
- **Plan maintenance:** Measurement cycles with optional email reminders; a fertilizer area with individual reminders for manual fertilizers and scheduled automatic logbook entries for dosing pumps.
- **Track test usage:** Automatic counting, adjustable refill capacities and refill reminders at 75% usage.
- **Check stocking:** Species catalog with care requirements, images and guidance on groups, tank size and compatibility.
- **Assess health:** Disease catalog, diagnosis assistant and medications/supplies with references, legal status and cautions.
- **Use AI assistance:** Optional aquarium chat with OpenAI, Google Gemini or Anthropic Claude and personal API keys.
- **Transfer and share data:** CSV import with column mapping, Excel-compatible CSV export and tank sharing with read or write access.
- **Customize accounts:** Profiles, avatars, password management, local or Pocket ID/OIDC login and invitations.
- **Use on mobile:** German/English, light/dark/system themes, home-screen installation and timer notifications.
- **Stay up to date:** A popup offers to reload when a newer frontend version is available.

- **Social community:** Photo feed with public or server-only visibility, captions, avatars, likes, comments and share links; uploads are resized server-side to 1600 pixels. [Details](docs/en/social.md).

## Technical features

- Vue 3, Vite and TypeScript frontend; Express and TypeScript backend.
- Node.js **22.12+** or Bun **1.4.3+**; SQLite or MongoDB.
- Web worker for demanding frontend tasks, backend thread pool and optional multiple server processes with a supervisor.
- Section-based loading of tank details and cancellable data requests.
- Shared species catalog for stocking and health; JSON data for diseases, medications and test suites; German and English translation files.
- SMTP queue with customizable email templates and test delivery.
- Admin panel for users, registration, settings, backups and logs.
- Database migrations, manual/automated backups and restore including uploads.
- AMD64/ARM64 Docker images; Compose configurations for SQLite and MongoDB.
- Commit-based version calculation, type checking and parallel isolated tests for both database adapters and runtimes.

## Quick start

With Node.js and SQLite:

```bash
npm ci
npm run dist
npm start
```

Run `npm run lint` to check the code; `npm run lint:fix` applies automatic fixes. ESLint checks TypeScript, Vue components, JavaScript scripts and tests.

Open `http://localhost:3000`. For development with hot reload, also run `npm run dev` in a second terminal. [Installation and configuration](docs/en/installation.md) covers Bun, Docker, SMTP, OIDC and all environment variables. Use [example.env](docker/example.env) as a configuration template; adjust the public URL, administrator email and database credentials for your installation.

With Docker Compose and MongoDB:

```bash
docker compose --project-directory . -f docker/docker-compose.yml pull
docker compose --project-directory . -f docker/docker-compose.yml up -d
```

For SQLite, use `docker compose --project-directory . -f docker/docker-compose.sqlite.yml up -d` instead. Adjust the selected Compose configuration before starting.

## Documentation

- [Manual and module overview](docs/en/README.md): Usage, workflows and configuration.
- [Development and architecture](docs/en/architecture.md): Source layout, builds, workers and tests.
- [Versions and commit convention](docs/en/versioning.md): `feat(scope): …` increments the revision, `fix(scope): …` the patch; other types leave the version unchanged.
- [Administration and backups](docs/en/administration.md): User management, SMTP, backups and restore.
- [Audit and operational limits](docs/AUDIT.md).

## Limits and roadmap

Target ranges and suspected diagnoses provide guidance and do not replace professional examination. Timer notifications depend on browser and operating system behavior; the app does not offer a complete offline mode. Dosing pump plans do not control hardware. Automatic emails for critical threshold alarms are planned.

## License

[CC BY-NC-SA 4.0](LICENSE): non-commercial use with attribution; derivatives must use the same license. Commercial use requires prior written permission from the author. Libraries and species images retain their own licenses and attribution requirements.
