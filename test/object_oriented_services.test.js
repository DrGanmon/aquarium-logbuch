'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SuiteService } = require('../dist/backend/src/services/suite-service');
const { SpeciesCatalog } = require('../dist/backend/src/services/species-service');
const { RegistrationService } = require('../dist/backend/src/services/registration-service');
const { LegalConfigService } = require('../dist/backend/src/services/legal-config-service');
const { WorkerPool } = require('../dist/backend/src/utils/worker-pool');
const { asError } = require('../dist/backend/src/utils/app-error');
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-service-objects-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('Kataloginstanzen trennen Cache und Datenquellen', (t) => {
  const first = directory(t), second = directory(t);
  const suite = name => ({ id: 'custom', name, isDefault: true, tests: [{ key: 'ph', name: 'pH', fresh: { okMin: 6, okMax: 8 } }] });
  fs.writeFileSync(path.join(first, 'suite.json'), JSON.stringify(suite('First')));
  fs.writeFileSync(path.join(second, 'suite.json'), JSON.stringify(suite('Second')));
  const a = new SuiteService(first, path.join(first, 'extra'));
  const b = new SuiteService(second, path.join(second, 'extra'));
  assert.equal(a.getDefaultSuite().name, 'First');
  assert.equal(b.getDefaultSuite().name, 'Second');
  fs.writeFileSync(path.join(first, 'suite.json'), JSON.stringify(suite('Updated')));
  assert.equal(a.getDefaultSuite().name, 'First');
  a.loadSuites(true);
  assert.equal(a.getDefaultSuite().name, 'Updated');
  assert.equal(b.getDefaultSuite().name, 'Second');
  fs.writeFileSync(path.join(first, 'species.json'), JSON.stringify({ id: 'custom', species: [{ id: 'fish-a', name: 'First fish' }, null, 3] }));
  fs.writeFileSync(path.join(second, 'species.json'), JSON.stringify({ id: 'custom', species: [{ id: 'fish-b', name: 'Second fish' }] }));
  const fishA = new SpeciesCatalog(first, path.join(first, 'extra'));
  const fishB = new SpeciesCatalog(second, path.join(second, 'extra'));
  assert.equal(fishA.getSpeciesById('fish-a').name, 'First fish');
  assert.equal(fishA.getSpeciesById('fish-b'), null);
  assert.equal(fishB.getSpeciesById('fish-b').name, 'Second fish');
});
test('Konfigurationsservices isolieren Dateien und verkraften ungültiges JSON', (t) => {
  const dir = directory(t);
  const a = new RegistrationService(path.join(dir, 'a.json'));
  const b = new RegistrationService(path.join(dir, 'b.json'));
  a.saveConfig({ mode: 'invite_open' });
  b.saveConfig({ mode: 'closed' });
  assert.equal(a.getConfig().mode, 'invite_open');
  assert.equal(b.getConfig().mode, 'closed');
  fs.writeFileSync(a.configFile, 'null');
  assert.doesNotThrow(() => a.getConfig());
  const legal = new LegalConfigService(path.join(dir, 'legal.json'));
  fs.writeFileSync(legal.configFile, JSON.stringify({ contactEmail: [], imprintEmail: 17 }));
  assert.equal(typeof legal.getConfig().contactEmail, 'string');
  assert.equal(legal.getConfig().hasCustomConfig, false);
  assert.throws(() => legal.saveConfig({ contactEmail: 'invalid' }), /Ungültige/);
});
test('Worker-Beenden weist laufende und wartende Aufträge zurück', async (t) => {
  const pool = new WorkerPool({ numWorkers: 1 });
  t.after(() => pool.terminate());
  const results = Promise.allSettled([pool.exec('hashPassword', { pw: 'one' }), pool.exec('hashPassword', { pw: 'two' })]);
  await pool.terminate();
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /beendet/);
  }
});
test('Worker-Absturz lässt den Auftrag nicht hängen', { timeout: 5000 }, async (t) => {
  const dir = directory(t);
  const file = path.join(dir, 'crash.cjs');
  fs.writeFileSync(file, "require('node:worker_threads').parentPort.on('message', () => { throw new Error('fixture crash'); });");
  const pool = new WorkerPool({ numWorkers: 1, workerPath: file });
  t.after(() => pool.terminate());
  await assert.rejects(pool.exec('hashPassword', { pw: 'one' }), /während des Auftrags beendet/);
});
test('Fehlernormalisierung bewahrt Status und behandelt fremde Fehlerwerte', () => {
  const native = Object.assign(new Error('bad input'), { status: 400 });
  assert.equal(asError(native), native);
  assert.equal(asError({ message: 'missing', status: 404 }).status, 404);
  assert.equal(asError(null).message, 'null');
});
