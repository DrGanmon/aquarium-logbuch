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

test('Parallele Testdateien haben getrennte Prozesse und Datenordner; temporäre Daten werden entfernt', t => {
  const result = runFixture(t, [0, 1].map(index => `
    const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
    test('parallel ${index}', async () => {
      const directory = process.env.DATA_DIR;
      fs.writeFileSync(path.join(directory, 'same-name.txt'), '${index}');
      fs.writeFileSync(path.join(__dirname, 'ready-${index}.json'), JSON.stringify({ pid:process.pid, directory }));
      const peerFile = path.join(__dirname, 'ready-${1 - index}.json');
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(peerFile) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(fs.existsSync(peerFile), 'Testdateien müssen tatsächlich gleichzeitig laufen');
      const peer = JSON.parse(fs.readFileSync(peerFile));
      assert.notEqual(peer.pid, process.pid);assert.notEqual(peer.directory, directory);
      assert.equal(fs.readFileSync(path.join(directory, 'same-name.txt'), 'utf8'), '${index}');
      console.log('ISOLATED_DIR=' + directory);
    });`), ['--jobs=2', '--info']);
  assert.ifError(result.error);assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /pass 2/);assert.match(result.stdout, /fail 0/);
  const directories = [...result.stdout.matchAll(/ISOLATED_DIR=([^\r\n]+)/g)].map(match => match[1]);
  assert.equal(directories.length, 2);
  for (const directory of directories) assert.equal(fs.existsSync(directory), false);
});

test('--serial führt beide Dateien ohne Überschneidung aus', t => {
  const result = runFixture(t, [0, 1].map(index => `
    const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
    test('serial ${index}', async () => {
      const marker = path.join(__dirname, 'active');
      assert.equal(fs.existsSync(marker), false);
      fs.writeFileSync(marker, '${index}');
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(fs.readFileSync(marker, 'utf8'), '${index}');fs.unlinkSync(marker);
    });`), ['--serial']);
  assert.ifError(result.error);assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /maximal 1 parallel/);assert.match(result.stdout, /pass 2/);
});

test('Ein paralleler Fehler unterschlägt weder Fehlerlogs noch die andere Testdatei', t => {
  const result = runFixture(t, [
    `const test = require('node:test');test('parallel failure', () => {console.log('PARALLEL_FAILURE_CONTEXT');throw new Error('PARALLEL_EXPECTED_FAILURE');});`,
    `const test = require('node:test');test('parallel survivor', async () => {await new Promise(resolve=>setTimeout(resolve,100));});`,
  ], ['--jobs', '2']);
  assert.ifError(result.error);assert.equal(result.status, 1);
  assert.match(result.stdout, /PARALLEL_FAILURE_CONTEXT/);assert.match(result.stdout, /PARALLEL_EXPECTED_FAILURE/);
  assert.match(result.stdout, /parallel survivor/);assert.match(result.stdout, /pass 1/);assert.match(result.stdout, /fail 1/);
});

test('Ungültige Parallelität und leere Dateiauswahl liefern keinen grünen Testlauf', t => {
  for (const value of ['0', '-1', '1.5', '65', 'nope']) {
    const result = runFixture(t, passing, [`--jobs=${value}`]);
    assert.ifError(result.error);assert.equal(result.status, 1);
    assert.match(result.stderr, /zwischen 1 und 64/);
  }
  const env = { ...process.env };delete env.NODE_TEST_CONTEXT;
  const empty = spawnSync(process.execPath, [path.join(__dirname, '../scripts/test.js'), 'test/__missing__*.test.js'], { env, encoding: 'utf8', timeout: 15000 });
  assert.ifError(empty.error);assert.equal(empty.status, 1);assert.match(empty.stderr, /Keine passenden Testdateien/);
  if (!process.versions.bun) {
    const coverage = runFixture(t, passing, ['--experimental-test-coverage']);
    assert.ifError(coverage.error);assert.equal(coverage.status, 0, coverage.stderr);
    assert.match(coverage.stdout, /all files/);assert.match(coverage.stdout, /pass 1/);
  }
});

test('Exklusive Dateien laufen allein und halten den parallelen Pool bis zum Abschluss zurück', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-exclusive-tests-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sources = [
    `const test=require('node:test'),fs=require('node:fs'),path=require('node:path');test('before',async()=>{fs.writeFileSync(path.join(__dirname,'before-active'),'');await new Promise(r=>setTimeout(r,150));fs.unlinkSync(path.join(__dirname,'before-active'));});`,
    `const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');test('exclusive',async()=>{assert.equal(fs.existsSync(path.join(__dirname,'before-active')),false);fs.writeFileSync(path.join(__dirname,'exclusive-active'),'');await new Promise(r=>setTimeout(r,150));fs.unlinkSync(path.join(__dirname,'exclusive-active'));fs.writeFileSync(path.join(__dirname,'exclusive-done'),'');});`,
    `const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');test('after',()=>{assert.equal(fs.existsSync(path.join(__dirname,'exclusive-active')),false);assert.equal(fs.existsSync(path.join(__dirname,'exclusive-done')),true);});`,
  ];
  const files = sources.map((source, index) => { const file=path.join(dir, `${index}.test.js`);fs.writeFileSync(file,source);return file; });
  const env = { ...process.env };delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['-e', `require(process.argv[1]).runTestPool(JSON.parse(process.argv[2]), {jobs:2, dataDir:process.argv[3], exclusiveFiles:[process.argv[4]]}).then(code=>process.exitCode=code)`,
    path.join(__dirname, '../scripts/test-pool.js'), JSON.stringify(files), dir, files[1]], { env, encoding:'utf8', timeout:15000 });
  assert.ifError(result.error);assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /pass 3/);assert.match(result.stdout, /fail 0/);
});

test('AQUARIUM_TEST_JOBS lässt sich per CLI überschreiben; --test-concurrency bleibt als Alias nutzbar', () => {
  const { parseTestOptions } = require('../scripts/test-options');
  assert.equal(parseTestOptions([], { AQUARIUM_TEST_JOBS: '2' }).jobs, 2);
  assert.equal(parseTestOptions(['--jobs', '3'], { AQUARIUM_TEST_JOBS: '2' }).jobs, 3);
  assert.equal(parseTestOptions(['--jobs=2'], { AQUARIUM_TEST_JOBS: 'invalid' }).jobs, 2);
  assert.throws(() => parseTestOptions([], { AQUARIUM_TEST_JOBS: 'invalid' }), /zwischen 1 und 64/);
  assert.equal(parseTestOptions(['--test-concurrency=2'], {}).jobs, 2);
  assert.equal(parseTestOptions(['--serial'], {}).jobs, 1);
});

test('Abbruch beendet alle Testworker und entfernt ihre Datenordner', { skip: process.platform === 'win32', timeout: 15000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-test-cancel-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = [0, 1].map(index => {
    const file = path.join(dir, `${index}.test.js`);
    fs.writeFileSync(file, `const test=require('node:test'),fs=require('node:fs'),path=require('node:path');test('wait ${index}',async()=>{fs.writeFileSync(path.join(__dirname,'ready-${index}.json'),JSON.stringify({pid:process.pid,directory:process.env.DATA_DIR}));await new Promise(()=>{setInterval(()=>{},1000);});});`);
    return file;
  });
  const { spawn } = require('node:child_process');
  const env = { ...process.env };delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [path.join(__dirname, '../scripts/test.js'), '--jobs=2', ...files], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';child.stdout.on('data', chunk => { output += chunk; });child.stderr.on('data', chunk => { output += chunk; });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM');await closed; } });
  const deadline = Date.now() + 10000;
  while (files.some((_, index) => !fs.existsSync(path.join(dir, `ready-${index}.json`))) && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 20));
  const workers = files.map((_, index) => JSON.parse(fs.readFileSync(path.join(dir, `ready-${index}.json`))));
  child.kill('SIGTERM');
  const result = await closed;
  assert.equal(result.code, 143, output);assert.equal(result.signal, null);
  for (const worker of workers) {
    assert.equal(fs.existsSync(worker.directory), false);
    assert.throws(() => process.kill(worker.pid, 0), error => error.code === 'ESRCH');
  }
});
