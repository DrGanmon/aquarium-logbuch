'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

for (const backend of ['sqlite', 'mongodb']) {
  test(`Gemischte Testsuiten: Auswahl, Messmethoden und Verbrauch (${backend})`, { timeout: 60000 }, async (t) => {
    const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
    t.after(() => env.cleanup());
    const user = await env.createUserAndLogin('mixed_tests', 'password123');
    const headers = { Cookie: user.cookie };
    const selection = ['jbl-easy-7in1:ph', 'jbl-easy-7in1:no2', 'jbl-pro:no3'];
    const select = selectedTests => env.request('/api/me/tests', { method: 'PUT', headers, body: { selectedTests } });
    assert.equal((await select(selection)).status, 200);
    const config = (await env.request('/api/config', { headers })).data;
    assert.deepEqual(config.userPreferences.selectedTests, selection);
    assert.equal(config.parameters.find(test => test.key === 'ph').wait, 60);
    assert.equal(config.parameters.find(test => test.key === 'no3').wait, 600);
    assert.deepEqual((await env.request('/api/me', { headers })).data.selectedTests, selection);
    for (const invalid of [['unknown:ph'], ['jbl-pro:missing'], ['jbl-pro:ph', 'jbl-easy-7in1:ph'], ['jbl-pro:ph', 'jbl-pro:ph'], [42], 'invalid']) {
      assert.equal((await select(invalid)).status, 400);
    }
    assert.deepEqual((await env.request('/api/me', { headers })).data.selectedTests, selection);
    const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Mixed tests', volume_l: 100 } });
    const aqId = created.data.id;
    const measure = (values, selectedTests = selection) => env.request(`/api/aquariums/${aqId}/measurements`, { method: 'POST', headers, body: { values, selectedTests } });
    assert.equal((await measure({ ph: 6.0 })).status, 400, 'Strip pH range must be used');
    assert.equal((await measure({ ph: 6.0 }, ['jbl-pro:ph'])).status, 200, 'Drop-test pH range must be used');
    assert.equal((await measure({ no3: 10 }, ['jbl-pro:ph'])).status, 400, 'Unselected parameters cannot be submitted');
    assert.equal((await measure({ no3: 10 }, ['missing:no3'])).status, 400);
    assert.equal((await measure({ ph: 6.8, no2: 0, no3: 10 })).status, 200);
    const inventory = async () => (await env.request('/api/me/test-inventory?suiteId=jbl-pro', { headers })).data.items;
    let items = await inventory();
    assert.equal(items.find(test => test.key === 'ph').used, 1, 'Only explicitly recorded drop pH consumes reagent');
    assert.equal(items.find(test => test.key === 'no2').used, 0, 'Strip nitrite does not consume drop-test reagent');
    assert.equal(items.find(test => test.key === 'no3').used, 1);
    const imported = await env.request(`/api/aquariums/${aqId}/measurements/import-csv`, {
      method: 'POST', headers,
      body: { csvText: 'date;no2;no3\n2026-01-01;0;12', mapping: { 0: 'date', 1: 'no2', 2: 'no3' }, delimiter: ';', hasHeader: true },
    });
    assert.equal(imported.status, 200);
    items = await inventory();
    assert.equal(items.find(test => test.key === 'no2').used, 0);
    assert.equal(items.find(test => test.key === 'no3').used, 2);
    assert.equal((await select([])).status, 200);
    assert.deepEqual((await env.request('/api/config', { headers })).data.userPreferences.selectedTests, []);
    const legacy = await env.request('/api/me/tests', { method: 'PUT', headers, body: { selectedSuite: 'jbl-pro', selectedTests: ['ph', 'no2'] } });
    assert.equal(legacy.status, 200);
    assert.deepEqual(legacy.data.selectedTests, ['ph', 'no2']);
  });
}

test('Suite-Service unterstützt zusätzliche eigene Suiten und deren Verbrauch unabhängig vom Standard', (t) => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-mixed-suites-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { SuiteService } = require('../dist/backend/src/services/suite-service');
  const { TestInventoryService } = require('../dist/backend/src/services/test-inventory-service');
  const original = JSON.parse(fs.readFileSync('src/config/suites/jbl-pro-aquatest.json', 'utf8'));
  fs.writeFileSync(path.join(root, 'first.json'), JSON.stringify({ ...original, id: 'first', isDefault: true }));
  fs.writeFileSync(path.join(root, 'second.json'), JSON.stringify({ ...original, id: 'second', isDefault: false }));
  const suites = new SuiteService(root, path.join(root, 'custom'));
  const selection = ['first:ph', 'second:no3'];
  assert.equal(suites.validateSelection(selection), true);
  assert.deepEqual(suites.resolveSelection(selection).map(test => test.suiteId), ['first', 'second']);
  const service = new TestInventoryService(suites);
  const inventory = {};
  service.applyUsage(inventory, { selected_suite: 'first', selected_tests: JSON.stringify(selection) }, { ph: 7, no3: 12 });
  assert.equal(inventory.first.ph.used, 1);
  assert.equal(inventory.second.no3.used, 1);
  assert.equal(inventory.first.no3, undefined);
});
