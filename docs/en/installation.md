# Installation and configuration

[Manual](README.md) · [Deutsch](../de/installation.md) · [Project overview](../../README.en.md)

## Node.js and SQLite

```bash
npm ci               # Install dependencies (Node >= 22.12)
npm run build        # Build unminified frontend for development (public/dist/app.js)
npm run dist         # Build minified frontend for production (public/dist/app.min.js)
npm test             # Run automated test suite (SQLite & MongoDB)
npm start            # Start app (default: SQLite at http://localhost:3000)
```

- **Development:** Run `npm start` for the Express API (port 3000) and `npm run dev` in a second terminal for Vite with hot reload (http://127.0.0.1:5173). The dev server proxies `/api`, `/auth` and `/sw.js` to Express. Set `VITE_BACKEND_URL` for another backend address. OIDC uses the backend's configured `APP_URL`.
- **Validation:** `npm run typecheck` checks all Vue components and TypeScript files with strict typing. `npm test` runs the automated tests with a compact summary. A progress indicator shows the current test file out of the selected total and the name of the running test; terminals update the same line, while redirected output records progress on separate lines. Failures show error details and the most recent test output. `npm test -- --info` also shows all test results and full logs. Run individual files with, for example, `npm test -- test/auth.test.js`; this can be combined with `--info`. Integration tests require local HTTP ports and a MongoDB test binary for MongoDB (which may be downloaded on the first run).
- **Build:** `npm run build` produces an unminified development bundle; `npm run dist` produces the minified production bundle in `../../public/dist`. Both run the type check first. Chart.js is bundled as a module; Vite builds the computation worker, and the TypeScript service worker is emitted as `dist/sw.js` and served at `/sw.js`.
- **Hosting:** Express selects the built production or development assets and supports an `APP_URL` with a subpath. A missing build returns HTTP 503 with setup instructions. `npm run build:watch` / `npm run dist:watch` rebuild on changes. Docker continues to run the production build during image creation.

## Bun: install, build, test and start

Bun **1.4.3 or newer** is supported throughout; Node is not required for this workflow:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run build:bun          # Development build including Vue/TypeScript checking
bun run dist:bun           # Production build including type checking
bun run test:bun           # Isolated SQLite and MongoDB tests
bun run start:bun          # Server with supervisor
bun run dev:bun            # Vite hot reload in a second terminal
```

- `bun run typecheck:bun` checks Vue scripts, templates and TypeScript via the compiler API, avoiding vue-tsc's Node-specific loading patch without suppressing type errors.
- `bun run build:watch:bun` and `bun run dist:watch:bun` watch changes. Type checking runs before watch mode starts; run `bun run typecheck:bun` to check again.
- `bun run test:bun --info` displays full test logs. Select individual files with `bun run test:bun test/auth.test.js`. The wrapper reports files, subtest results and totals, and runs each file in its own process with temporary data. Use `bun test` directly for additional native Bun test options.
- `../../bun.lock` pins Bun dependencies; `package-lock.json` remains for Node/npm. Dependency lifecycle scripts are disabled (`trustedDependencies: []`, `--ignore-scripts`). SQLite continues to use better-sqlite3 13 with its bundled Node-API binaries.
- The supervisor uses `node:cluster` so multiple workers can share the HTTP port on Node and Bun. Database migrations finish before workers start. Multi-process operation is tested on Linux.
- `docker/Dockerfile` uses Bun 1.4.3 for build and production, as the unprivileged `bun` user. Build the alternative Node image with `docker build -f docker/Dockerfile.node -t aquarium-logbuch:node .`. Existing Compose configurations remain usable.
- CI checks both runtimes, production builds and the full test suite before publishing the container image.

## Docker Compose

Run the following commands from the repository root. `--project-directory .` preserves the existing Compose project name and named volume mapping. For a local Bun image build: `docker build -f docker/Dockerfile -t aquarium-logbuch:bun .`.

Both Compose files use the [official container image](https://github.com/DrGanmon/aquarium-logbuch/pkgs/container/aquarium-logbuch) `ghcr.io/drganmon/aquarium-logbuch:latest`. No local build is required. Before starting, adjust the environment variables in the respective Compose file (especially `APP_URL`, `ADMIN_EMAIL`, and the MongoDB password). A template for all available environment variables is provided in [example.env](../../docker/example.env).

```bash
# Download images and start the application and MongoDB container
docker compose --project-directory . -f docker/docker-compose.yml pull
docker compose --project-directory . -f docker/docker-compose.yml up -d
```

To run with SQLite without MongoDB:

```bash
docker compose --project-directory . -f docker/docker-compose.sqlite.yml pull
docker compose --project-directory . -f docker/docker-compose.sqlite.yml up -d
```

For updates, run the same `pull` and `up -d` commands again. Data is preserved in the named volumes.

The GitHub workflow builds the application image for `linux/amd64` and `linux/arm64` and publishes both architectures under the same tags. Docker automatically selects the matching architecture when pulling, such as ARM64 on a Raspberry Pi running a 64-bit operating system. Pull requests build both variants for validation without publishing them.

## Configuration variables


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
| `OIDC_STATE_SECRET` | Client secret or random process key | Secret for encrypted OIDC state. Public clients running across multiple instances must share a random value of at least 32 bytes. Supervisor workers inherit the same key; without a fixed key, in-flight logins expire on restart. |
| `OIDC_SCOPES` | `openid profile email` | Requested OIDC scopes |
| `OIDC_PROVIDER_NAME` | `Pocket ID` | Login button label |
| `LOCAL_LOGIN` | auto | Local password login. Default: disabled if OIDC is configured, else enabled |
| `OIDC_LINK_BY_USERNAME` | false | `true` links existing local accounts with matching usernames and the same provider-verified email address on first OIDC login |
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

## Reverse proxy and OIDC

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

## Operation

- **HTTPS:** Run behind a TLS-terminating reverse proxy (Caddy, Nginx, Traefik) with `APP_URL=https://...`, `COOKIE_SECURE=true`, and `TRUST_PROXY=1`.
- **Backup:** `sqlite3 data/aquarium.db ".backup backup.db"` (database runs in WAL mode; do not copy raw `.db` file while process is running).
- **Passwords:** Local passwords hashed with scrypt; session tokens stored as SHA-256 hashes.
