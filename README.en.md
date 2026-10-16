<p align="center">
  <img src="public/icon-192.png" alt="Aquarium-Logbuch Logo" width="96" height="96">
</p>

# Aquarium-Logbuch

Aquarium-Logbuch is a self-hosted web app for water parameters, residents and aquarium care. It combines measurement history, care logs and reminders, supporting multiple users with separate or shared tanks. A species catalog, diagnosis assistant and optional AI chat complement freshwater and saltwater tank management.

[Deutsch](README.md) · **English** · [📖 User guide with screenshots](https://aquarium-logbuch.de/handbuch/en/) · [Technical documentation](docs/en/README.md) · [Changelog](CHANGELOG.md)

**Getting started?** Open the public **[User guide](https://aquarium-logbuch.de/handbuch/en/)** from the app footer or at `<app-address>/handbuch/en/`. It explains all areas with step-by-step instructions and demo screenshots, is available in English and German, requires no login and loads its images only when reading. [Maintenance and standalone hosting](docs/user-guide/README.md).

## Transparency notice: AI-generated software

**This app was written and is developed with the help of generative AI.** Its source code and documentation contain AI-generated content. This voluntary disclosure follows the transparency approach of [Article 50 of the EU AI Act (Regulation (EU) 2024/1689)](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50); it is not a declaration of full legal compliance. AI-assisted development alone does not create a blanket labeling obligation for all software.

In the optional AI chat, you interact with an AI system; its responses are automatically generated and may be incorrect or incomplete. Check recommendations before acting on them. Water assessments and suspected diagnoses do not replace professional or veterinary examination. Sending a chat request transfers messages and aquarium context to the selected AI provider; see the [AI manual](docs/en/ai-chat.md) for details.

## A look inside the app

Actual app views with fictional demo data: two in light mode and two in dark mode. Click an image to open it at full size. The screenshots show the German interface; the app also supports English.

| Aquarium overview · light | Aquarium details with measurement history · dark |
| --- | --- |
| [![Aquarium overview in light mode with eight demo aquariums and their status](docs/screenshots/aquarien-light.webp)](docs/screenshots/aquarien-light.webp) | [![Aquarium details in dark mode with eight water-parameter charts and daily measurements over two months](docs/screenshots/messwerte-dark.webp)](docs/screenshots/messwerte-dark.webp) |
| **Plant overview · light** | **Fish and species catalog · dark** |
| [![Plant catalog in light mode with search, filters and plant descriptions](docs/screenshots/pflanzen-light.webp)](docs/screenshots/pflanzen-light.webp) | [![Species catalog in dark mode with fish, invertebrates and care requirements](docs/screenshots/fische-dark.webp)](docs/screenshots/fische-dark.webp) |

Find more views and step-by-step instructions in the [public user guide](https://aquarium-logbuch.de/handbuch/en/).

## Features for users

- **Manage aquariums:** Tank details, equipment, photos, galleries and named residents with portraits.
- **Record water parameters:** 18 parameters, freely combined tests from JBL, Amtra, sera and Tetra suites, live assessments and simultaneous reaction timers.
- **Review history:** Charts with custom date ranges, warnings and alarms you can acknowledge.
- **Document care:** Logbook for water changes, filter maintenance, plants, fertilization and other activities.
- **Plan maintenance:** Measurement cycles with optional email reminders; a fertilizer area with individual reminders for manual fertilizers and scheduled automatic logbook entries for dosing pumps.
- **Track test usage:** Automatic counting, adjustable refill capacities and refill reminders at 75% usage.
- **Check stocking:** Species catalog with care requirements, images and guidance on groups, tank size and compatibility.
- **Manage plants:** Bilingual plant catalog with care requirements and images, plus per-aquarium plant stock with quantities.
- **Assess health:** Disease catalog, diagnosis assistant and medications/supplies with references, legal status and cautions.
- **Use AI assistance:** Optional aquarium chat with OpenAI, Google Gemini or Anthropic Claude and encrypted personal API keys.
- **Transfer and share data:** CSV import with column mapping, Excel-compatible CSV export and tank sharing with read or write access.
- **Customize accounts:** Profiles, avatars, password management, local or Pocket ID/OIDC login and invitations.
- **Use on mobile:** German/English, light/dark/system themes, home-screen installation and timer notifications.
- **Work offline:** Use previously synchronized aquariums, measurements, care logs, stock, plants and images locally; retain pending changes and synchronize when connected. Conflicts between devices are presented for review.
- **Use catalogs offline:** Search downloaded species, plant and health catalogs and view their details. Diagnostic calculations, compatibility checks and CSV processing run locally; AI chat still requires a connection.
- **Stay up to date:** Updates are offered only when frontend content changes; activation and reload require confirmation. Backend-only or catalog-data-only changes do not trigger frontend update prompts.
- **Social community:** Photo feed with public or server-only visibility, captions, avatars, likes, comments and share links; uploads are resized server-side to 1600 pixels. [Details](docs/en/social.md).
- **Centralize notifications:** A central area with a counter for likes and comments on your posts and open water-parameter warnings from all accessible aquariums.

## Technical features

- Vue 3, Vite and TypeScript frontend; Express and TypeScript backend.
- Node.js **22.12+** or Bun **1.4.3+**; SQLite or MongoDB.
- Web worker for demanding frontend tasks, backend thread pool and optional multiple server processes with a supervisor.
- Section-based loading of tank details and cancellable data requests.
- Shared species and plant catalogs; JSON data for diseases, medications and test suites; German and English translation files.
- SMTP queue with customizable email templates and test delivery.
- Database-backed administrator roles for multiple users; admin panel for users, registration modes, settings, anonymous usage metrics, backups and logs.
- Bilingual initial-setup wizard for the first administrator account, SMTP, automated backups and registration mode; the rest of the application stays locked until setup is complete.
- Database migrations, encrypted manual/automated backups and password-protected restore including uploads.
- AMD64/ARM64 Docker images; Compose configurations for SQLite and MongoDB.
- GitHub builds and publishes Docker images only when the app, server or shipped resources change; README-only and screenshot-only changes do not trigger a new version. [Build and versioning rules](docs/en/versioning.md#build-only-when-relevant-files-change).
- Commit-based version calculation, type checking and parallel isolated tests for both database adapters and runtimes.

## Offline use and separate updates

The app separates three versions: the overall app version, the frontend file content hash and independent content versions for species, plant and health catalogs. At startup, every five minutes in visible tabs, when returning to the tab and when reconnecting, the frontend checks only a small version file. Hashes are generated during the build. Unchanged files are reused from the previous service-worker cache; other open tabs can continue using their existing build. See [Versions and updates](docs/en/versioning.md).

Aquarium data and pending changes are stored per user in IndexedDB. After a successful initial online synchronization, data can be recorded and edited offline. The server rechecks sessions and permissions during synchronization; operation IDs prevent duplicate entries on retries. Concurrent changes are shown as conflicts rather than silently overwritten. Pending changes exist only on the device that recorded them and are not included in server backups.

Reference catalogs are downloaded and versioned separately. Existing offline catalogs are normally checked at most every twelve hours. Data-only changes to species, plants, diseases, diagnostic questions, medications and catalog images do not require a frontend update. Changes to views or browser logic still produce a new frontend build.

Service workers and offline restarts require HTTPS; localhost is the exception for local development. An HTTP LAN address is insufficient on a phone. Browsers and operating systems may remove local data; home-screen installation does not replace backups. Authentication, account security, AI, sharing, social features and administration still require a server connection.

## Quick start

With Node.js and SQLite:

```bash
npm ci
npm run dist
npm start
```

Run `npm run lint` to check the code; `npm run lint:fix` applies automatic fixes. ESLint checks TypeScript, Vue components, JavaScript scripts and tests.

Open `http://localhost:3000`. On an empty installation, the initial setup wizard first collects the administrator, SMTP, backup and registration settings. For development with hot reload, also run `npm run dev` in a second terminal. [Installation and configuration](docs/en/installation.md) covers Bun, Docker, SMTP, OIDC and all environment variables. Use [example.env](docker/example.env) as a configuration template; adjust the public URL and database credentials for your installation.

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

Target ranges and suspected diagnoses provide guidance and do not replace professional examination. Timer notifications and background execution depend on browser and operating system behavior. Offline use covers previously synchronized data and supported local operations; features that require the server remain online. Dosing pump plans do not control hardware. Automatic emails for critical threshold alarms are planned.

## License

[CC BY-NC-SA 4.0](LICENSE): non-commercial use with attribution; derivatives must use the same license. Commercial use requires prior written permission from the author. Libraries and species images retain their own licenses and attribution requirements.
