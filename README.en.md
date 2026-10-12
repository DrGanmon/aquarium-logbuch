<p align="center">
  <img src="public/icon-192.png" alt="Aquarium-Logbuch Logo" width="128" height="128" style="border-radius: 24px;">
</p>

# Aquarium Logbook

<p align="center">
  <a href="README.md">🇩🇪 Deutsch</a> &nbsp;|&nbsp; <strong>🇬🇧 English</strong>
</p>

Multi-user web application for aquarium water parameters and maintenance.
Login optionally local with password or via OAuth 2.0 / OpenID Connect against [Pocket ID](https://pocket-id.org).

## App Features

- Login via Pocket ID (OIDC) or local credentials with registration.
- **4 Registration & Invitation Modes:**
  - **🟢 Open:** Any visitor can register directly.
  - **🔒 Invitation (Admin):** Only administrators can generate invitation codes or send invitation emails.
  - **👥 Invitation (Open):** All registered users can invite friends via code or email from their profile.
  - **⛔ Closed:** Registration and new invitations are completely disabled.
  - **Flexible Invitation Codes & Emails:** Invitation codes with configurable expiry (default max. 7 days for users, configurable by admin) and usage limits, as well as email invitations (max. 14 days validity).
- **Light & Dark Mode:** Complete support for light and eye-friendly dark color schemes:
  - **System Default:** Automatically matches operating system preferences (`prefers-color-scheme`).
  - **Switchable:** Fast toggle in the top navigation bar and on the login page, plus permanent preference in the user profile.
  - **Adaptive Charts:** Water parameter charts and tooltips dynamically adjust their palette to the active theme.
- **🌐 Multilingual Support (German & English):**
  - **Switchable & Persisted:** Instant 1-click quick switcher (`🌐 DE` / `🌐 EN`) in the header and login area, plus persistent language setting in user profile (`#/profile`).
  - **Seamless Localization:** Complete localization across all views (login/registration, tank overview, detail views, measurement mask, timeline, CSV import/export, species catalog, AI chat, admin panel, and legal pages) including locale-aware date and number formatting (`Intl.DateTimeFormat` / `Intl.NumberFormat`).
- **Email Verification & Password Reset:**
  - **Email Verification for New Users:** New registrations (except the admin address) automatically receive a confirmation email with an activation link. Unverified accounts are protected at login and can request new confirmation links.
  - **Forgot Password & Reset via Email:** Request a time-limited secure password reset link from the login page. Resetting automatically invalidates all existing user sessions.
- User profile for managing avatar (profile picture), first name, last name, username, "About me" bio, password change, appearance, and OIDC account linking.
- Admin dashboard with user management for administrators (defined by admin email address in configuration) plus integrated system logbook & error inspector.
- **Aquarium Management with Motto, Description & Maintenance Cycles:**
  - Create and manage aquariums with name, custom motto/tagline, detailed description (aquascape, plants, philosophy, equipment), fresh or saltwater, volume, and notes.
  - **Independent Testing & Fertilization Cycles:**
    - **🧪 Testing Cycle:** Flexible interval in days or weeks (e.g., every 3 days, weekly, every 2 weeks) with optional fixed weekday (e.g., Saturdays).
    - **🌿 Fertilization Cycle:** Separately configurable interval in days or weeks with weekday scheduling for plant fertilizer.
    - **📧 Optional Reminder Emails:** Automated email notifications (`measure-reminder.tpl` / `fertilize-reminder.tpl`) with direct action links whenever a test or fertilization is due or overdue.
    - **Due Status Tracking:** Clear in-tank badges ("Due today", "Overdue by X days") and reminder badges in the tank list.
- **Multiple Photos per Aquarium & Photo Gallery:** Upload unlimited photos per tank (PNG, JPG, WebP, GIF up to 5 MB), set captions, choose a cover photo, and view all images in an interactive gallery with full-screen lightbox.
- **Inhabitant Naming & Individual Portrait Photos:** Assign custom names/labels to individual inhabitants (e.g., Betta "Bubbles", pairs, groups) and upload personal portrait photos for each resident.
- **Aquarium Logbook & Activity Timeline:** Complete, chronological timeline of all tank maintenance and events:
  - **Water Changes:** Record water change percentage (e.g., 30%, 50%) and water conditioner notes.
  - **Filter Care:** Filter media replacement (specifying replaced filter floss, carbon, sponges, etc.) and filter cleaning.
  - **Plants & Gardening:** Document plant pruning, trimming, and newly introduced plant species.
  - **Maintenance & Fertilization:** Log glass cleaning, substrate care, fertilizer dosing, and specialty feeding.
  - **Combined Timeline:** View all maintenance tasks and water tests in a filtered timeline (All, Water Change, Care & Filter, Plants, Tests).
- **Aquarium Overview with 2 Tabs & Invitation Workflow:**
  - **🐠 My Aquariums:** Clean list of all own aquariums with current parameters, alert badges, and photos.
  - **👥 Shared with Me:** Lists all aquariums shared by other users and accepted.
  - **✉️ Invitation Email & Acceptance Requirement:** Sharing an aquarium triggers an invitation email (`share-aquarium.tpl`) with a confirmation link. The tank becomes accessible only after accepting the invitation (via email link or directly in the "Shared with Me" tab).
- Share aquariums with other registered users with flexible permission levels:
  - **View:** Access water parameters, history graphs, inhabitants, logbook, and alerts.
  - **Write:** Add/edit/delete measurements and maintenance tasks, manage stocking, acknowledge alerts, and manage images.
- Stocking per tank: Inhabitant species determine ideal target ranges (softwater, hardwater, shrimp, and invertebrates).
- **Species Catalog & Stocking Compatibility Checks:** Extensive database of popular aquarium inhabitants (Tetras, Livebearers, Labyrinth fish/Bettas, Cichlids, Catfish, Rasboras, Shrimp, Snails, Saltwater) with water parameters, minimum tank volumes, social behavior, and territorial rules in both German and English.
- **Behavior & Territoriality Analysis:** Automated detection of cohabitation conflicts (e.g., single-specimen rule for Siamese fighting fish, fin nippers vs. long-finned fish, predators vs. dwarf shrimp, crayfish vs. bottom dwellers, minimum school sizes, and temperature/pH incompatibilities).
- **🤖 Personal AI Aquarium Chat Assistant (Multi-Provider: OpenAI, Google Gemini, Anthropic Claude):**
  - **Comprehensive Automated Tank Context:** Every chat query automatically injects a tailored system prompt containing tank dimensions, volume, water type, filtration, substrate, complete fauna and flora inventory (with behavioral traits and care requirements), and the last 10 water test records (including test dates, `ok`/`warn`/`crit` ratings, and trend data).
  - **Persistent Chat History & Smart Context Compression:** Conversations are permanently saved per aquarium in the database (SQLite & MongoDB) and restored across sessions and devices. Older conversation turns are automatically and intelligently compressed into a concise summary block so the AI retains full memory of past diagnoses and advice without exceeding token budgets.
  - **Multi-Provider & Bring Your Own Key (BYOK):** Full support for **OpenAI (ChatGPT)**, **Google Gemini**, and **Anthropic Claude**. Users can store personal API keys in their profile, select their preferred provider, and query available models dynamically directly from provider APIs (including custom free-text model input).
  - **Dynamic Model Fetching:** Entering an API key queries active models (e.g., GPT-6, GPT-6-mini, GPT-4o, Gemini 2.5 Flash/Pro, Claude 3.7 Sonnet, Claude 3.5 Haiku) in real-time from the provider's API.
  - **Floating Action Button (FAB):** Direct chat access via a floating action button in the aquarium detail view — displayed dynamically only when a valid AI key is configured for the account.
  - **Live Connection Test & Quick Starter Prompts:** Built-in key validation directly in profile settings plus quick question chips (*"Evaluate my water parameters"*, *"Can I add new fish?"*, *"Algae prevention tips"*).
  - **Privacy & Security:** Zero background data transmission; data is sent to the respective AI provider only when the user explicitly sends a chat message or tests a key in their profile. API keys are stored securely on the server and masked in the UI.
- Measurement mask for 15 parameters with interactive timers per test (multiple simultaneous timers, audio and vibration on completion, wake lock to keep screen on when supported).
- **PWA & Home Screen Installation:**
  - **Mobile Optimized (iOS & Android):** Full support for home screen installation and standalone web app mode with crisp icons (purple fish with bubbles on a deep violet background).
- **Push & Background Notifications for Timers:**
  - **Accurate Timing:** Prevents overrunning chemical reaction times and avoids inaccurate color test readings.
  - **Notification Controls:** In-app test notification and permission management directly in the user profile.
- **CSV & Excel Export & Import with Interactive Mapping:**
  - **📤 Export (CSV / Excel):** Download water tests for any timeframe (or complete history) as CSV with UTF-8 BOM and semicolon (for Microsoft Excel) or comma delimiter.
  - **📥 Import with Column Mapping (CSV):** Drag & drop or select CSV files; headers and sample values are previewed automatically.
  - **Smart Column Detection:** Automatically recognizes and pre-maps date, time, notes, and 15 water parameters (pH, KH, GH, NO2, NO3, PO4, Fe, K, Mg, Ca, Temp, Salinity, etc.).
  - **Flexible Formatting:** Supports European (`DD.MM.YYYY`) and ISO dates, combined or split date/time columns, and both comma and period decimal separators.
  - **Instant Limit Validation:** Imported values are automatically checked against tank parameter boundaries to flag warnings and critical alerts.
- Live parameter evaluation while typing with flexible decimal input (comma or period).
- **Interactive History Graphs with Timeframe Selection:**
  - **Default 3-Month View (90 Days):** Opening an aquarium defaults to a clear 3-month history.
  - **Quick Filters:** 7 Days, 14 Days, 30 Days, 3 Months, 6 Months, 1 Year, and All.
  - **Custom Date Range:** Select custom start and end dates via the date picker.
  - **User Preference:** Set a permanent default timeframe in user profile settings.
- **Legal Compliance & Footer (EU AI Act, DDG, GDPR, Licenses & Contact):**
  - **Global Footer:** Responsive footer with links to Impressum, Privacy Policy, Licenses, and Contact available for all visitors.
  - **🤖 EU AI Act Transparency (Art. 50 Regulation (EU) 2024/1689):** Full disclosure of AI-assisted software generation (JetBrains Junie) and AI chat assistant capabilities and limitations.
  - **⚖️ Legal Notice / Impressum (§ 5 DDG & § 18 MStV):** German statutory provider identification with contact information and EU online dispute resolution links.
  - **🔒 Privacy Policy (GDPR / DSGVO):** Transparent documentation of all data processing activities (account, aquarium data, session cookies, SMTP mail, server logs, optional AI chat via OpenAI, Google, Anthropic), zero third-party trackers, and user rights (CSV export, 2-step account deletion).
  - **📜 Module Copyright & Open Source Licenses:** Comprehensive overview of all dependencies (`express`, `better-sqlite3`, `mongodb`, `chart.js`, Node.js built-ins) with licenses (MIT, Apache 2.0, CC BY-NC-SA 4.0).
  - **✉️ Contact & Support:** Direct channels for technical support, admin inquiries, and data privacy requests.
- Warnings (attention) and alarms (critical) with actionable recommendations and checkbox resolution.
- Reminders when the last measurement exceeds the configured interval.

## Technical Features

- **Technical Stack:** Node.js (version 22.12+), Express, and either **SQLite** (local/lightweight) or **MongoDB** (production/scalable).
- **Vue 3, Vite and TypeScript:** The complete frontend lives in `public/frontend/`. Vue components own all views, forms, dialogs and timers. The existing stylesheet, icons, translations and API contracts are preserved. All frontend application and worker code uses TypeScript; no legacy JavaScript views or compatibility layer remain.
- **Flexible Dual-Database System:**
  - **SQLite (Default local):** File-based, high-performance zero-setup database (`data/aquarium.db`) with WAL mode and `busy_timeout` for concurrent access.
  - **MongoDB (Production):** Full support for MongoDB clusters/containers via `DB_TYPE=mongodb` and `MONGODB_URI`.
- **Multithreading & Multi-Core Clustering:**
  - **Frontend Web Worker Multithreading:** Dedicated Web Worker (`public/frontend/worker.ts` / `dist/worker.min.js`) for compute-heavy client-side tasks (CSV parsing & delimiter detection for large imports, full-text species catalog search with ranked matches, statistical time series calculations, and asynchronous image resizing & compression via `OffscreenCanvas`) to keep the UI thread completely smooth (60/120 fps) and lag-free.
  - **Non-blocking Cryptography (Backend):** Password hashing and verification (Scrypt) are handled asynchronously via the Node.js thread pool so concurrent logins never block the event loop.
  - **Backend Worker Thread Pool:** Dedicated worker pool for heavy background and inspection tasks.
  - **Multi-Worker Cluster Mode:** Using `WORKERS=auto` (or a fixed count), the supervisor distributes incoming requests across multiple worker processes spanning all CPU cores.
  - **Stateless OIDC:** OIDC states are cryptographically signed and function seamlessly across processes and cluster instances.
- **Supervisor & Resilience Watchdog:** A master watchdog process monitors the application, catches unexpected crashes or exceptions, and restarts worker processes with zero downtime.
- **Structured Error & Event Logging:** All server errors, uncaught exceptions, stderr logs, and supervisor events are recorded with timestamps and log levels in `data/aquarium.log`.
- **Technical Implementation of Localization:**
  - **Standardized JSON Format:** Fully modular locale files located at `public/locales/de.json` and `public/locales/en.json` with structured namespacing and token interpolation (`{count}`, `{name}`, `{days}`, etc.).
  - **Integrated into Dist Bundle:** Automatically bundled and minified in the Vite build pipeline for minimal transfer size and zero extra network roundtrips.
- **SMTP Delivery, Email Templates & Queue:**
  - **Modular HTML Email Templates (.tpl files):** Every email utilizes its own customizable `.tpl` file with HTML styling and dynamic tokens (e.g., `{{username}}`, `{{verifyUrl}}`, `{{resetUrl}}`, `{{expiresHours}}`, etc.) under `src/templates/mail/` (or in `data/mail-templates/` for custom overrides) with localized `.en.tpl` versions.
  - **Rate-Limited Mail Queue:** Emails are dispatched through a FIFO queue with configurable delays to protect SMTP servers from load spikes and avoid spam filter triggers.
  - **SMTP Configuration in Admin Panel:** Configurable via Web UI (`#/admin`) or environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) with live test mail sending and queue status monitoring.
- **Service Worker for Timer Notifications:**
  - **Background Timers:** Service Worker ensures alerts trigger reliably even if the tab is minimized or in the background.
- **App Icons & Favicons:**
  - **iOS Apple Touch Icon:** 180×180 px full-bleed icon for seamless edge-to-edge Apple squircle masking.
  - **Android Adaptive & Maskable Icons:** 192×192 px and 512×512 px standard and adaptive maskable icons with safe-zone padding for any launcher shape.
  - **Multi-Resolution Favicons:** 16×16, 32×32, and standard `favicon.ico` for browser tabs and bookmarks.

## Getting Started

### 1. Local Development (SQLite)

```bash
npm ci               # Install dependencies (Node >= 22.12)
npm run build        # Build unminified frontend for development (public/dist/app.js)
npm run dist         # Build minified frontend for production (public/dist/app.min.js)
npm test             # Run automated test suite (SQLite & MongoDB)
npm start            # Start app (default: SQLite at http://localhost:3000)
```

- **Development:** Run `npm start` for the Express API (port 3000) and `npm run dev` in a second terminal for Vite with hot reload (http://127.0.0.1:5173). The dev server proxies `/api`, `/auth` and `/sw.js` to Express. Set `VITE_BACKEND_URL` for another backend address. OIDC uses the backend's configured `APP_URL`.
- **Validation:** `npm run typecheck` checks all Vue components and TypeScript files with strict typing. `npm test` runs the automated tests.
- **Build:** `npm run build` produces an unminified development bundle; `npm run dist` produces the minified production bundle in `public/dist/`. Both run the type check first. Chart.js is bundled as a module; Vite builds the computation worker, and the TypeScript service worker is emitted as `dist/sw.js` and served at `/sw.js`.
- **Hosting:** Express selects the built production or development assets and supports an `APP_URL` with a subpath. A missing build returns HTTP 503 with setup instructions. `npm run build:watch` / `npm run dist:watch` rebuild on changes. Docker continues to run the production build during image creation.

### 2. Running with MongoDB (Docker Compose)

An environment variable template is provided in `example.env`.

```bash
# Copy and adjust environment variables
cp example.env .env

# Start application and MongoDB container
docker compose up -d --build
```

### 3. Configuration Variables

| Variable | Default | Description |
|---|---|---|
| `DB_TYPE` | `sqlite` (or `mongodb` if `MONGODB_URI` is set) | Database engine (`sqlite` or `mongodb`) |
| `MONGODB_URI` | `mongodb://localhost:27017/aquarium` | Connection string for MongoDB |
| `MONGODB_DB_NAME` | `aquarium` | Optional MongoDB database name |
| `PORT` | 3000 | HTTP Port |
| `DATA_DIR` | `./data` | Directory for uploads, SQLite database, and log files |
| `APP_URL` | (empty) | Public URL of the app, e.g. `https://aquarium.example.com`. Required for OIDC |
| `ALLOW_REGISTRATION` | true | `false` blocks new account creation (local and first OIDC login) |
| `COOKIE_SECURE` | auto | `true` when running behind HTTPS. Default: `true` if `APP_URL` starts with `https://` |
| `TRUST_PROXY` | (off) | `1` when running behind a reverse proxy |
| `OIDC_ISSUER` | (empty) | URL of Pocket ID server, e.g. `https://id.example.com`. Set = OIDC enabled |
| `OIDC_CLIENT_ID` | (empty) | Client ID from Pocket ID |
| `OIDC_CLIENT_SECRET` | (empty) | Client Secret from Pocket ID (leave empty for public clients) |
| `OIDC_SCOPES` | `openid profile email` | Requested OIDC scopes |
| `OIDC_PROVIDER_NAME` | `Pocket ID` | Login button label |
| `LOCAL_LOGIN` | auto | Local password login. Default: disabled if OIDC is configured, else enabled |
| `OIDC_LINK_BY_USERNAME` | false | `true` links existing local accounts with matching usernames on first OIDC login |
| `ADMIN_EMAIL` | (empty) | Administrator email address (comma-separated for multiple admins) |
| `CONTACT_EMAIL` | `ADMIN_EMAIL` | Support and contact email for imprint & contact pages |
| `IMPRINT_EMAIL` | `CONTACT_EMAIL` | Email address for statutory provider identification |
| `SMTP_HOST` | (empty) | SMTP server hostname for outbound emails |
| `SMTP_PORT` | `587` | SMTP port (`587` for STARTTLS, `465` for SSL/TLS, `25` unencrypted) |
| `SMTP_SECURE` | `false` | `true` for direct SSL/TLS encryption (port 465) |
| `SMTP_USER` | (empty) | SMTP username |
| `SMTP_PASS` | (empty) | SMTP password |
| `SMTP_FROM` | `Aquarium-Logbuch <noreply@...>` | Outbound sender address |
| `SMTP_RATE_LIMIT_MS` | `500` | Delay between queued emails in milliseconds |
| `DEFAULT_AI_PROVIDER` | `openai` | Default AI provider for chat assistant (`openai`, `gemini`, `claude`) |
| `OPENAI_API_KEY` | (empty) | Global fallback API key for OpenAI / ChatGPT (optional) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Default model for OpenAI Chat Completions |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Optional custom base URL for OpenAI API / proxies |
| `GEMINI_API_KEY` | (empty) | Global fallback API key for Google Gemini (optional) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Default model for Google Gemini |
| `CLAUDE_API_KEY` | (empty) | Global fallback API key for Anthropic Claude (optional) |
| `CLAUDE_MODEL` | `claude-3-5-haiku-20241022` | Default model for Anthropic Claude Messages API |
| `LOG_FILE` | `./data/aquarium.log` | Path to `.log` file for error and system logging |
| `SUPERVISOR` | `true` | `false` starts the app in a single process without supervisor watchdog |
| `WORKERS` | `1` (or `auto` in Docker) | Number of worker processes (`auto` = all CPU cores) |
| `WORKER_THREADS` | `auto` | Number of worker threads for heavy tasks (Scrypt, data analysis) |

## User Profile & Account Management

Logged-in users can open their **User Profile** (`#/profile`) from the header navigation:
- **Profile Picture (Avatar):** Upload (JPG, PNG, WebP, GIF up to 5 MB) or remove profile avatar.
- **Personal Details:** Manage first name, last name, username, "About me" bio, and email address.
- **Default Chart Timeframe:** Select a preferred timeframe (e.g., 3 months, 6 months, 1 year) for history graphs.
- **Language Preference:** Choose between German and English (`de` / `en`).
- **🤖 AI Assistant & LLM Settings:**
  - Choose preferred AI provider (**OpenAI / ChatGPT**, **Google Gemini**, **Anthropic Claude**).
  - Securely store, mask, and test personal API keys.
  - Dynamic model selection queried live from provider APIs upon key entry with custom free-text model input.
  - 1-click live connection testing and instant key removal.
- **Password Management:** Update local account password.
- **OIDC Account Linking:** Link or unlink the local account with Pocket ID / OpenID Connect.
- **Invite Friends (when invitation mode is active):** Generate registration codes and send email invitations, view status, and share invite links.
- **Account Deletion (2-Step Confirmation):**
  - **Step 1 (In-App):** Confirm deletion in profile settings (with password re-entry for local accounts) to initiate deletion request.
  - **Step 2 (Via Email):** A secure email with a time-limited confirmation link is dispatched. Deletion is executed only upon clicking this link.
  - **Cascading Data Cleanup:** Final deletion permanently removes user account, all owned aquariums, images, inhabitants, water measurements, logbook entries, and active sessions. Administrator accounts are protected against accidental deletion.

## Admin Panel & User Administration

Administrators are identified by their email address matching `ADMIN_EMAIL` in `config.js` or environment variables (comma-separated for multiple admins).

- Users matching `ADMIN_EMAIL` receive administrative privileges.
- An **Admin** button appears in the navigation bar (`#/admin`).
- Administrators can view all users, create new accounts, edit credentials, and delete users along with their data.
- **Registration Modes & Invitation Management:**
  - Switch between 4 modes: **Open**, **Invitation (Admin)**, **Invitation (Open)**, and **Closed**.
  - Configure maximum validity for user invite codes (default: 7 days).
  - Create admin invite codes with custom usage limits (unlimited or single-use) and direct email invitations.
  - Manage and revoke active or expired invitations.
- **Email & SMTP Configuration:**
  - Configure outbound SMTP server settings for verification, password resets, and notifications.
  - Monitor mail queue status and trigger live test emails.
- **Legal & Contact Emails:**
  - Set custom contact addresses for support (`CONTACT_EMAIL`) and legal imprint (`IMPRINT_EMAIL`).
- **Backup & Restore:**
  - **Manual Backups:** Complete backup of database and all uploaded photos as a compressed archive (`.json.gz`).
  - **Restore:** Upload backup files via Web UI or restore from existing server archives.
  - **Backward Compatibility:** Older backups are automatically migrated and normalized to current database schemas.
  - **Automated Local Backups:** Configurable automated backups (enable/disable, intervals e.g. 6h/12h/24h, retention count, and automatic pruning of old archives).
  - **Access Security:** Backup and restore features are strictly restricted to administrators.
- **System Logbook:** Live viewing and clearing of server logs (`data/aquarium.log`).

## Login with Pocket ID (OIDC)

1. In Pocket ID under *OIDC Clients*, create a new client:
   - **Callback URL:** `<APP_URL>/auth/callback`, e.g. `https://aquarium.example.com/auth/callback`
   - **Logout Callback URL:** `<APP_URL>/`, e.g. `https://aquarium.example.com/`
   - Optional: Restrict access via *Allowed User Groups*.
2. Copy Client ID and Secret and start the application:

```bash
APP_URL=https://aquarium.example.com \
OIDC_ISSUER=https://id.example.com \
OIDC_CLIENT_ID=... OIDC_CLIENT_SECRET=... \
TRUST_PROXY=1 npm start
```

The app uses Authorization Code Flow with PKCE, verifies token signatures via JWKS, and validates `iss`, `aud`, `exp`, and `nonce`. An account is created automatically upon first login (`preferred_username`), mapped permanently via `sub`.

**Subpath deployments:** `APP_URL` can include subpaths (e.g. `https://example.com/aquarium`). The reverse proxy must strip the prefix before forwarding to the application (e.g. Caddy: `handle_path /aquarium/* { reverse_proxy localhost:3000 }`).

## Water Tests & Test Suites (JSON Configurable)

Water tests are stored modularly as **JSON files** in `src/config/suites/` (or `data/suites/` for custom suites):
- **Default Suite (`jbl-pro-aquatest.json`):** JBL PRO AQUATEST Testlab liquid tests based on official instructions with verified reaction times (e.g., Potassium 90s, Nitrite 5 min, Nitrate 10 min, Ammonium 10 min, Phosphate 10 min, Iron 10 min, Copper 15 min, Silicate 3 min).
- **Consolidated pH Test:** A unified pH test (3.0 to 10.0) replaces fragmented test ranges for clean recording.
- **Extensible:** Additional test sets (e.g., `jbl-easy-7in1.json` test strips) can be added as JSON.
- **User Selection:** Users can choose their preferred test suite and select which specific tests they own/perform in profile settings (`#/profile`) or during measurement (`#/a/:id/messen`).

## Species Catalog & Stocking Compatibility

Stocking is powered by modular **JSON species catalogs** in `src/config/species/` (or `data/species/` for custom catalogs):
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

## Reaction Times & Target Values

Test parameters and default values are defined in `src/config/suites/jbl-pro-aquatest.json` and `config.js`.

- **Reaction Times:** All default timings are verified against official manufacturer instructions (`verified: true`).
- **Target Ranges:** Guidelines for fresh and saltwater tanks. Verify and adjust according to your specific setup and inhabitant needs. The application does not replace professional veterinary or aquaristic advice.

## Operation & Maintenance

- **HTTPS:** Run behind a TLS-terminating reverse proxy (Caddy, Nginx, Traefik) with `APP_URL=https://...`, `COOKIE_SECURE=true`, and `TRUST_PROXY=1`.
- **Backup:** `sqlite3 data/aquarium.db ".backup backup.db"` (database runs in WAL mode; do not copy raw `.db` file while process is running).
- **Passwords:** Local passwords hashed with scrypt; session tokens stored as SHA-256 hashes.

## Known Limitations

- Automated email dispatch on critical threshold alarms is planned for a future release.

## License & Copyright

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)**.

- **✅ Permitted (Personal & Community Use):**
  - Free use, installation, and operation for private, non-commercial purposes.
  - Modification, adaptation, and extension of the source code.
- **🔄 Required (Copyleft & Attribution):**
  - **ShareAlike:** Derivative works must be distributed under the same license (CC BY-NC-SA 4.0).
  - **Attribution:** Original author copyright and project notices must be preserved.
- **⛔ Prohibited (Non-Commercial):**
  - Commercial use, resale, or offering the application as a paid service (e.g., commercial SaaS hosting) without prior written permission from the author.
- **📜 Third-Party Licenses:**
  - Bundled open-source libraries (`express`, `better-sqlite3`, `chart.js` under MIT License; `mongodb` under Apache License 2.0).

Complete license text: See [LICENSE](LICENSE) or in the application under `#/lizenzen`.

## Roadmap

- [x] AI chat assistant for aquariums with multi-provider support (OpenAI, Google Gemini, Anthropic Claude) and automated tank context (dimensions, stocking, limits, last 10 measurements).
- [x] Fertilizer dosing & dosing pumps (multiple fertilizers/channels, dosages in ml, flexible intervals, logging, and lazy loading in logbook)
- [ ] Automated email alerts for critical parameter threshold violations.
