# Architecture, builds and development

[Manual](README.md) · [Deutsch](../de/architecture.md) · [Project overview](../../README.en.md)

## Structure and responsibilities

| Area | Sources | Responsibility |
|---|---|---|
| Server and HTTP | `../../server.ts`, `src/app.ts`, `src/routes/` | Startup, API, authentication and frontend delivery |
| Domain logic | `../../src/services` | Aquariums, species, test suites, diagnosis, chat, reminders and backups |
| Database | `../../src/db`, `src/types/repositories.ts` | SQLite/MongoDB adapters, migrations and repository contracts |
| Frontend | `../../public/frontend` | Vue views, components, router, state and API requests |
| Catalogs and templates | `../../src/config`, `src/templates/mail/` | Versioned data and translated email templates |
| Local data | `../../data` or `DATA_DIR` | Database, uploads, configuration, custom catalogs and backups |

The backend uses TypeScript with strict checking and Express. Services group domain logic; catalog caches belong to their instances. Configuration services share a JSON store with separate file paths. Node.js 22.12+ and Bun 1.4.3+ are supported.

SQLite is the default, using WAL and `busy_timeout`; select MongoDB through `DB_TYPE` and `MONGODB_URI`. Migrations run before server workers start.

## Frontend and background work

Vue 3 manages views and dialogs; Vite bundles TypeScript and Chart.js. Translations from `../../public/locales` are included in the bundle. The API client sends language and session context with requests; the server checks access to tanks and their resources.

The web worker (`../../public/frontend/worker.ts`) handles CSV processing, catalog search, time-series calculations and supported image processing. The separate service worker (`public/frontend/service-worker.ts`) handles timer notifications. Their responsibilities differ; the app does not provide a complete offline mode.

Scrypt password hashing runs asynchronously. A backend thread pool handles background tasks. The supervisor can start multiple server processes using `WORKERS` and replace crashed workers. `WORKER_THREADS` controls the thread pool; signed OIDC state is independent of individual processes. Events and errors are written to `LOG_FILE`.

## Builds, development and tests

`npm run build` and `npm run dist` check types, compile the backend into `../../dist/backend` and build the frontend into `public/dist/`. Stable JavaScript entry points load the compiled backend. Rebuild and restart after backend changes. Watch commands monitor the frontend and compile the backend only at startup.

For hot reload, build first, start the API with `npm start` and run Vite separately with `npm run dev`. Vite proxies `/api`, `/auth` and `/sw.js`. [Installation](installation.md) also documents Bun commands and proxy configuration.

```bash
npm run typecheck
npm test
npm test -- test/auth.test.js
npm test -- --info
```

Tests rebuild the backend first. Integration tests need local HTTP ports and a MongoDB test binary, which may be downloaded on the first run. The compact test runner reports progress and failures; `--info` enables full output. CI checks both runtimes, production builds and tests.

## Operational limits

Documented audit results and remaining operational limits are in [AUDIT.md](../../AUDIT.md).
