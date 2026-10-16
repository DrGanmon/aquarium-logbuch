'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { applyCommits, resolveVersion, bumpManual, validateVersion } = require('../scripts/version');
const baseline = { major: 1, minor: 2, revision: 3, patch: 0 };

test('Version: Feat erhöht Revision, Fix erhöht optionalen Patch; Major/Minor bleiben manuell', () => {
  assert.equal(applyCommits(baseline, []), '1.2.3-ALPHA');
  assert.equal(applyCommits(baseline, ['fix: correction']), '1.2.3-1-ALPHA');
  assert.equal(applyCommits(baseline, ['fix(ui): one', 'fix!: two']), '1.2.3-2-ALPHA');
  assert.equal(applyCommits(baseline, ['fix: first', 'feat(chat): new feature']), '1.2.4-ALPHA');
  assert.equal(applyCommits(baseline, ['feat!: first', 'feat: second', 'fix: last']), '1.2.5-1-ALPHA');
  assert.equal(applyCommits(baseline, ['docs: explanation', 'chore: release', 'refactor: internal', 'not a conventional commit']), '1.2.3-ALPHA');
});

test('Version: ALPHA ist Pflicht, Patch 0 wird weggelassen; Build-Override wird validiert', () => {
  assert.equal(resolveVersion({ override: '2.3.4-5-ALPHA' }), '2.3.4-5-ALPHA');
  for (const invalid of ['1.2.3', '1.2.3-beta', '1.2.3-0-ALPHA', '1.2.3.4-ALPHA', '01.2.3-ALPHA', '1.2.3-ALPHA\n']) assert.throws(() => validateVersion(invalid));
});

test('Version: Git-Historie zählt Feats und Fixes reproduzierbar; manuelle Minor-Erhöhung setzt Zähler zurück', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-version-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');git('config', 'user.name', 'Version test');git('config', 'user.email', 'version-test@example.invalid');
  git('commit', '--allow-empty', '-m', 'chore: baseline');
  const baseCommit = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(cwd, 'version.json'), JSON.stringify({ ...baseline, baseCommit }));
  git('add', 'version.json');git('commit', '-m', 'chore: version configuration');
  const appCommit = subject => { fs.appendFileSync(path.join(cwd, 'server.js'), '// ' + subject + '\n');git('add', 'server.js');git('commit', '-m', subject); };
  appCommit('feat: one');appCommit('fix: one');appCommit('fix: two');
  assert.equal(resolveVersion({ cwd, override: '' }), '1.2.4-2-ALPHA');
  assert.equal(resolveVersion({ cwd, override: '' }), '1.2.4-2-ALPHA');
  assert.equal(bumpManual('minor', cwd), '1.3.0-ALPHA');
  assert.equal(resolveVersion({ cwd, override: '' }), '1.3.0-ALPHA');
  git('add', 'version.json');git('commit', '-m', 'chore: manual minor');
  appCommit('feat: next');
  assert.equal(resolveVersion({ cwd, override: '' }), '1.3.1-ALPHA');
  assert.equal(bumpManual('major', cwd), '2.0.0-ALPHA');
});

test('Version: fehlende Historie wird erkannt; Quellarchive verwenden den festgelegten Ausgangswert', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-version-export-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, 'version.json'), JSON.stringify({ ...baseline, baseCommit: 'a'.repeat(40) }));
  assert.equal(resolveVersion({ cwd, override: '' }), '1.2.3-ALPHA');
  execFileSync('git', ['init', '-b', 'main'], { cwd, stdio: 'ignore' });
  assert.throws(() => resolveVersion({ cwd, override: '' }), /Versionsbasis fehlt/);
});
