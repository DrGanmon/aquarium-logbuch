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

Pages and larger dialogs load as separate JavaScript modules when opened. Chart code loads with measurement history; individual charts are created as they approach the viewport. Chart.js registers only the required line-chart components. Disease and medication catalogs initially render 24 cards, adding more on scroll or through a button; searches still cover the full loaded catalog. Measurement tables initially render 50 rows and add more on scroll; charts and exports retain the full selected date range. Profile tabs load their content on the first visit and then retain edits. The health catalog is fetched only in the catalog tab. Module filenames include a content hash and can be cached indefinitely; the entry point, version file and service worker retain their update rules.

The web worker (`../../public/frontend/worker.ts`) handles CSV processing, catalog search, time-series calculations and supported image processing. The separate service worker (`public/frontend/service-worker.ts`) handles timer notifications. Their responsibilities differ; the app does not provide a complete offline mode.

Scrypt password hashing runs asynchronously. A backend thread pool handles background tasks. The supervisor can start multiple server processes using `WORKERS` and replace crashed workers. `WORKER_THREADS` controls the thread pool; signed OIDC state is independent of individual processes. Events and errors are written to `LOG_FILE`.

## Builds, development and tests

`npm run build` and `npm run dist` check types, compile the backend into `../../dist/backend` and build the frontend into `public/dist/`. Stable JavaScript entry points load the compiled backend. Rebuild and restart after backend changes. Watch commands monitor the frontend and compile the backend only at startup.

For hot reload, build first, start the API with `npm start` and run Vite separately with `npm run dev`. Vite proxies `/api`, `/auth` and `/sw.js`. [Installation](installation.md) also documents Bun commands and proxy configuration.

```bash
npm run typecheck
npm test
npm test -- --jobs=4
npm test -- --serial
npm test -- test/auth.test.js
npm test -- --info
```

Tests rebuild the backend first. Integration tests need local HTTP ports and a MongoDB test binary, which may be downloaded on the first run. The compact test runner reports progress and failures; `--info` enables full output. CI checks both runtimes, production builds and tests.

## Operational limits

Documented audit results and remaining operational limits are in [AUDIT.md](../../AUDIT.md).

## Parallel and isolated test runs

The runner defaults to at most four concurrent test files, limited by CPU availability and the memory limit (a 1 GiB budget per worker). Every file runs in a separate process with a temporary `DATA_DIR`, isolating module state, environment variables, uploads, logs and backups. Tests and subtests within each file stay sequential. Frontend build tests run exclusively because they modify the shared output directory. Failure logs, exit status and counts are aggregated across all files; cancellation terminates process groups and removes temporary data.

Use `--jobs=N` or `--test-concurrency=N` to set concurrency (1–64), or `--serial` for one file at a time. `AQUARIUM_TEST_JOBS=2 npm test` sets the default, overridden by CLI flags. The same options work with `bun run test:bun`. `--info` prints complete logs and results. Empty file selections and invalid concurrency fail. Native Node filters such as `--test-name-pattern` may be forwarded; custom reporters, watch mode, coverage flags and disabled process isolation automatically use the sequential native Node runner, retaining those features.

The backend compiles once before testing. Nested runner fixtures reuse that build instead of deleting files other workers are using. CI also reuses its successfully typechecked production build and limits concurrency to two files. GitHub Actions caches the MongoDB binaries; individual database instances and servers remain separate.

References: [Node test isolation](https://nodejs.org/api/test.html#test-runner-execution-model), [Bun `node:test` compatibility](https://bun.com/docs/runtime/nodejs-compat#node-test) and [MongoDB binary cache](https://typegoose.github.io/mongodb-memory-server/docs/api/config-options/#download_dir).
