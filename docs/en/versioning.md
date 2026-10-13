# Versions, commits and updates

[Manual](README.md) · [Deutsch](../de/versioning.md) · [Project overview](../../README.en.md)

Versions use **`MAJOR.MINOR.REVISION[-PATCH]-ALPHA`**, always including `ALPHA`, and appear on the right of the footer. `../../version.json` records the initial `0.0.0-ALPHA` counters and Git baseline.

Each `feat:` / `feat(scope):` commit increments revision and resets patch. Each `fix:` / `fix(scope):` increments patch. Patch 0 is omitted: `1.0.3-ALPHA` → fix → `1.0.3-1-ALPHA` → feature → `1.0.4-ALPHA`. Other commit types do not increment counters; merge commits are excluded to prevent double counting. Breaking-change markers do not automatically change major/minor.

Use `npm run version:major` / `npm run version:minor` manually, or `bun run version:major:bun` / `bun run version:minor:bun`. These reset revision/patch and record a new baseline; major also resets minor. Commit the changed files using a message such as `chore: increase minor version`. `node scripts/version.js` prints the calculated version. Builds calculate it from Git history; commits become visible after rebuilding or restarting Vite.

CI uses one calculated value for the footer, backup metadata, OCI label and full Docker tag, e.g. `ghcr.io/drganmon/aquarium-logbuch:1.0.4-2-ALPHA`. Version tags are published on the default branch and matching `v…` release tags. Existing latest/branch/SHA tags remain; pull requests do not publish images. Pin Compose with `AQUARIUM_VERSION=1.0.4-2-ALPHA docker compose up -d`, or set the variable in `.env`; it defaults to `latest`.

For a local Docker build, run `APP_VERSION=$(node scripts/version.js)` followed by `docker build --build-arg APP_VERSION="$APP_VERSION" -t "aquarium-logbuch:$APP_VERSION" .`. Source archives without Git use the recorded baseline unless an explicit `APP_VERSION` is supplied. An incomplete Git checkout fails instead of silently producing an incorrect counter.

## Frontend update notification

The app checks `dist/version.json` without browser caching at startup, every five minutes in visible tabs, when returning to the tab and when connectivity returns. A numerically newer version opens a dialog offering **Load now** or **Later**. Later dismisses that version until the next page load; a further newer version is offered again. Reloading discards unsaved input. Vite development mode uses hot reload instead. Failed checks are retried on subsequent triggers.
