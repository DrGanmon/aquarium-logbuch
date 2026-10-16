'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { classifyPaths, detectChanges, commitChanges } = require('../scripts/build-changes');
const { resolveVersion } = require('../scripts/version');

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-build-changes-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');git('config', 'user.name', 'Build test');git('config', 'user.email', 'build@example.invalid');
  const commit = (file, subject) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.appendFileSync(path.join(cwd, file), subject + '\n');git('add', file);git('commit', '-m', subject);return git('rev-parse', 'HEAD');
  };
  const base = commit('server.js', 'chore: baseline');
  fs.writeFileSync(path.join(cwd, 'version.json'), JSON.stringify({ major: 1, minor: 0, revision: 0, patch: 0, baseCommit: base }));
  git('add', 'version.json');git('commit', '-m', 'chore: version');
  return { cwd, git, commit, base: git('rev-parse', 'HEAD') };
}

test('Build: Dokumentation überspringen, Tests separat prüfen, ausgelieferte Ressourcen weiter bauen', () => {
  for (const file of ['README.md', 'README.en.md', 'AGENTS.md', 'CHANGELOG.md', 'docs/screenshots/fish.webp', 'docs/user-guide/chapters.json']) {
    assert.deepEqual(classifyPaths([file]), { appChanged: false, checksChanged: false }, file);
  }
  assert.deepEqual(classifyPaths(['test/versioning.test.js']), { appChanged: false, checksChanged: true });
  for (const file of ['src/app.ts', 'public/frontend/App.vue', 'public/handbuch/index.html', 'src/config/species/fish.json', 'package.json', 'bun.lock', 'version.json', 'docker/Dockerfile', '.dockerignore', '.github/workflows/docker-publish.yml', 'scripts/build.js', 'LICENSE', 'unknown-input']) {
    assert.deepEqual(classifyPaths([file]), { appChanged: true, checksChanged: true }, file);
  }
});

test('Build und Version: echte Git-Diffs statt allein Commit-Typen; leere Commits zählen nicht', t => {
  const f = fixture(t);
  const docs = f.commit('README.md', 'feat: nur Text');
  f.commit('docs/screenshots/example.webp', 'fix: nur Screenshot');
  f.git('commit', '--allow-empty', '-m', 'feat: leer');
  assert.deepEqual(detectChanges({ cwd: f.cwd, base: f.base }), { appChanged: false, checksChanged: false });
  assert.equal(commitChanges(f.cwd, docs).appChanged, false);
  assert.equal(resolveVersion({ cwd: f.cwd, override: '' }), '1.0.0-ALPHA');
  f.commit('test/example.test.js', 'fix: nur Test');
  assert.deepEqual(detectChanges({ cwd: f.cwd, base: f.base }), { appChanged: false, checksChanged: true });
  assert.equal(resolveVersion({ cwd: f.cwd, override: '' }), '1.0.0-ALPHA');
  f.commit('src/app.ts', 'fix(server): Verhalten korrigieren');
  assert.equal(resolveVersion({ cwd: f.cwd, override: '' }), '1.0.0-1-ALPHA');
  assert.equal(detectChanges({ cwd: f.cwd, base: f.base }).appChanged, true);
  f.git('mv', 'src/app.ts', 'docs/app.ts');f.git('commit', '-m', 'fix: Laufzeitdatei entfernen');
  assert.equal(resolveVersion({ cwd: f.cwd, override: '' }), '1.0.0-2-ALPHA');
});

test('Build: neue Branches, Tags und fehlende Vergleichsobjekte bauen vorsichtshalber', t => {
  const f = fixture(t);
  for (const options of [{}, { base: '0'.repeat(40) }, { base: 'f'.repeat(40) }, { base: f.base, force: true }]) {
    assert.deepEqual(detectChanges({ cwd: f.cwd, ...options }), { appChanged: true, checksChanged: true });
  }
  assert.deepEqual(detectChanges({ cwd: f.cwd, base: f.base }), { appChanged: false, checksChanged: false });
});

test('Build: Pull Requests vergleichen mit dem gemeinsamen Vorfahren; Pushes mit dem alten Branchstand', t => {
  const f = fixture(t);
  f.git('checkout', '-b', 'docs');const head = f.commit('README.md', 'docs: Anleitung');
  f.git('checkout', 'main');const base = f.commit('server.js', 'fix: Serveränderung nur im Zielbranch');
  assert.deepEqual(detectChanges({ cwd: f.cwd, base, head, pullRequest: true }), { appChanged: false, checksChanged: false });
  assert.equal(detectChanges({ cwd: f.cwd, base, head }).appChanged, true);
});

test('CI: Änderungsprüfung schreibt getrennte Outputs und steuert Tests sowie Image-Build', t => {
  const f = fixture(t);f.commit('README.md', 'docs: Text');
  const output = path.join(f.cwd, 'github-output');
  const script = path.join(f.cwd, 'scripts/build-changes.js');
  fs.mkdirSync(path.dirname(script));
  fs.copyFileSync(path.resolve(__dirname, '../scripts/build-changes.js'), script);
  execFileSync(process.execPath, [script, '--github-output'], {
    cwd: f.cwd, env: { ...process.env, BUILD_BASE: f.base, BUILD_HEAD: f.git('rev-parse', 'HEAD'), BUILD_FORCE: 'false', BUILD_PULL_REQUEST: 'false', GITHUB_OUTPUT: output },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(fs.readFileSync(output, 'utf8'), 'app_changed=false\nchecks_changed=false\n');
  const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/docker-publish.yml'), 'utf8');
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /runtime-check:\n {4}if: needs\.version\.outputs\.checks_changed == 'true'/);
  assert.match(workflow, /build-and-push:\n {4}if: needs\.version\.outputs\.app_changed == 'true'/);
});
