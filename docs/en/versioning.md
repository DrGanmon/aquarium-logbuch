# Versions, commits and updates

[Manual](README.md) · [Deutsch](../de/versioning.md) · [Project overview](../../README.en.md)

Versions use **`MAJOR.MINOR.REVISION[-PATCH]-ALPHA`**, always including `ALPHA`, and appear on the right of the footer. `../../version.json` records the initial `0.0.0-ALPHA` counters and Git baseline.

Each `feat:` / `feat(scope):` commit increments revision and resets patch. Each `fix:` / `fix(scope):` increments patch. Patch 0 is omitted: `1.0.3-ALPHA` → fix → `1.0.3-1-ALPHA` → feature → `1.0.4-ALPHA`. Other commit types do not increment counters; merge commits are excluded to prevent double counting. Breaking-change markers do not automatically change major/minor.

Use `npm run version:major` / `npm run version:minor` manually, or `bun run version:major:bun` / `bun run version:minor:bun`. These reset revision/patch and record a new baseline; major also resets minor. Commit the changed files using a message such as `chore: increase minor version`. `node scripts/version.js` prints the calculated version. Builds calculate it from Git history; commits become visible after rebuilding or restarting Vite.

CI uses one calculated value for the footer, backup metadata, OCI label and full Docker tag, e.g. `ghcr.io/drganmon/aquarium-logbuch:1.0.4-2-ALPHA`. Version tags are published on the default branch and matching `v…` release tags. Existing latest/branch/SHA tags remain; pull requests do not publish images. Pin Compose with `AQUARIUM_VERSION=1.0.4-2-ALPHA docker compose --project-directory . -f docker/docker-compose.yml up -d`, or set the variable in `.env`; it defaults to `latest`.

For a local Docker build, run `APP_VERSION=$(node scripts/version.js)` followed by `docker build -f docker/Dockerfile --build-arg APP_VERSION="$APP_VERSION" -t "aquarium-logbuch:$APP_VERSION" .`. Source archives without Git use the recorded baseline unless an explicit `APP_VERSION` is supplied. An incomplete Git checkout fails instead of silently producing an incorrect counter.

## Frontend update notification

The app checks `dist/version.json` without browser caching at startup, every five minutes in visible tabs, when returning to the tab and when connectivity returns. A different frontend content hash, including a rollback, opens a dialog offering **Load now** or **Later**. Later dismisses that version until the next page load; another content hash is offered again. Reloading discards unsaved input. Vite development mode uses hot reload instead. Failed checks are retried on subsequent triggers.

## Independent frontend version

Each build generates `public/dist/frontend-version.json` with `{schema:1,version,assets}`. The SHA-256 version covers JavaScript/CSS, the web worker, service-worker source and offline shell (HTML template, manifest and icons). Per-file hashes let the worker copy unchanged assets instead of downloading them again. App version numbers and source maps are excluded; backend-only releases do not trigger frontend updates. Shared code changes count when they change browser bundles. Do not edit or commit the generated file.

Data-only changes in `src/config/species`, `src/config/plants` and `src/config/health`, as well as species/plant images and image manifests, do not change the frontend version. Each catalog synchronizes using its own content version. Existing offline catalogs are normally checked at most every twelve hours and can be retried manually after a failed synchronization. The build rejects direct catalog-data imports into browser and web-worker bundles. Changes to catalog views or shared browser logic still trigger frontend updates. No Docker Compose configuration is required.

`dist/version.json` retains the app `version` and adds `frontendVersion`. HTML metadata identifies the loaded frontend, and the footer receives the app version at runtime. Visible tabs check the small metadata file at startup, every five minutes, when returning to the tab and when reconnecting. A different hash, including a rollback, displays the update prompt. “Later” dismisses that hash until the next page load.

Updates download in the background and wait for confirmation; the button stays disabled until installation finishes. “Load now” activates the offered worker and reloads only the requesting tab. Finish measurements and save inputs first. Other open tabs keep their old cached assets, including lazy views; caches are removed once all tabs have identified their versions and no longer need them. Unknown tabs prevent early cleanup. HTML and assets use a coherent cached build. Interrupted installations preserve the working offline build. Waiting updates can also activate normally after every old tab closes. Private IndexedDB data and catalog/photo caches are preserved. Service workers require HTTPS or localhost and an initial online visit. No Docker Compose changes are needed.

The update button verifies the actual service worker content version. If another tab already activated the offered build, this tab can still adopt it with “Load now”. Cache cleanup pauses while another worker is installing or waiting for activation.
