'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runFixture(t, code, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-reporter-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fixtures = Array.isArray(code) ? code : [code];
  const files = fixtures.map((source, index) => {
    const file = path.join(dir, index === 0 ? 'fixture.test.js' : `fixtureZ${index}.test.js`);
    fs.writeFileSync(file, source);
    return file;
  });
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [path.join(__dirname, '../scripts/test.js'), ...args, ...files], {
    encoding: 'utf8', env, timeout: 15000,
  });
}

const passing = `const test = require('node:test');
test('reporter success', () => { console.log('INFO_FIXTURE'); console.error('STDERR_FIXTURE'); });`;

test('Testfortschritt: Dateien zählen, laufende Untertests anzeigen', (t) => {
  const result = runFixture(t, [
    `const test = require('node:test'); test('first parent', async t => {
      await t.test('first child', () => {});
      await t.test('second child', () => {});
    });`,
    `const test = require('node:test'); test('second file', () => {});`,
  ]);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[Testdatei 1\/2\].*first child/);
  assert.match(result.stdout, /\[Testdatei 1\/2\].*second child/);
  assert.match(result.stdout, /\[Testdatei 2\/2\].*second file/);
  assert.doesNotMatch(result.stdout, /\[Testdatei 3\/2\]/);
});

test('Testausgabe: Standardmodus zeigt Zusammenfassung ohne erfolgreiche Testlogs', (t) => {
  const result = runFixture(t, passing);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pass 1/);
  assert.match(result.stdout, /fail 0/);
  assert.match(result.stdout, /\[Testdatei 1\/1\].*reporter success.*fixture\.test\.js/);
  assert.doesNotMatch(result.stdout + result.stderr, /INFO_FIXTURE|STDERR_FIXTURE|✔ reporter success/);
});

test('Testausgabe: --info zeigt einzelne Tests und vollständige Logs', (t) => {
  const result = runFixture(t, passing, ['--info']);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout + result.stderr, /INFO_FIXTURE/);
  assert.match(result.stdout + result.stderr, /STDERR_FIXTURE/);
  assert.match(result.stdout, /reporter success/);
  assert.doesNotMatch(result.stdout, /\[Testdatei/);
});

test('Testausgabe: Fehlerdetails, Testlogs und Exit-Code bleiben erhalten', (t) => {
  const result = runFixture(t, `const test = require('node:test');
const assert = require('node:assert/strict');
test('reporter failure', () => { console.log('FAILURE_CONTEXT'); assert.equal(1, 2, 'EXPECTED_FAILURE'); });`);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /FAILURE_CONTEXT/);
  assert.match(result.stdout, /EXPECTED_FAILURE/);
  assert.match(result.stdout, /reporter failure/);
  assert.match(result.stdout, /fail 1/);
});
