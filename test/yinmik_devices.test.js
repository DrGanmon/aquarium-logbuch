'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
const { suiteService } = require('../dist/backend/src/services/suite-service');
const { deviceGuideSteps, parseDeviceGuide } = require('../dist/backend/src/shared/device-guide');

test('YINMIK: modellbezogene Kalibrierung und einheitliche Messgrößen ohne Reagensverbrauch', () => {
  const devices = suiteService.getSuites().filter(s => s.id.startsWith('yinmik-'));
  assert.equal(devices.length, 7);
  for (const suite of devices) {
    assert.ok(parseDeviceGuide(suite.deviceGuide));
    assert.ok(suite.tests.every(t => t.wait === 0 && t.consumable === null));
    assert.ok(suite.deviceGuide.steps.every(step => step.title.en && step.title.de && step.text.en && step.text.de));
    assert.ok(suite.deviceGuide.sources.every(s => new URL(s.url).hostname === 'www.yinmik.com'));
  }
  const get = id => devices.find(s => s.id === `yinmik-${id}`);
  const ph = deviceGuideSteps(get('ez9908').deviceGuide, ['ph']);
  assert.ok(ph.find(s => s.id === 'ph-6-86').text.de.includes('5 Sekunden'));
  assert.equal(ph.some(s => s.id === 'ec-1413'), false);
  const ec = deviceGuideSteps(get('c600').deviceGuide, ['tds']);
  assert.ok(ec.find(s => s.id === 'ec-1413').text.de.includes('6 Sekunden'));
  assert.equal(ec.some(s => s.id.startsWith('ph-')), false);
  const salt = deviceGuideSteps(get('s200').deviceGuide, ['salinity']);
  assert.ok(salt.find(s => s.id === 'salt-35').text.de.includes('35 ppt'));
  assert.equal(salt.some(s => s.id === 'ec-1413'), false);
  assert.equal(get('s200').tests.find(t => t.key === 'salinity').unit, 'ppt');
  assert.equal(get('c600').tests.find(t => t.key === 'salinity').unit, 'ppt');
  assert.equal(get('do').tests.find(t => t.key === 'o2').unit, 'mg/l');
  assert.equal(deviceGuideSteps(get('ez9908').deviceGuide, ['temp']).some(s => s.id.startsWith('ph-')), false);
  assert.equal(parseDeviceGuide({ ...get('c600').deviceGuide, sources: [{ title: 'bad', url: 'javascript:alert(1)' }] }), undefined);
});

for (const backend of ['sqlite', 'mongodb']) test(`YINMIK: gemischte Auswahl, API-Anleitung und neue Werte speichern (${backend})`, { timeout: 60000 }, async t => {
  const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
  t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('yinmik_tests', 'password123');
  const headers = { Cookie: user.cookie };
  const selectedTests = ['yinmik-c600:ph', 'yinmik-c600:ec', 'yinmik-c600:tds', 'yinmik-c600:salinity', 'yinmik-c600:orp', 'yinmik-c600:sg', 'jbl-pro:no3'];
  assert.equal((await env.request('/api/me/tests', { method: 'PUT', headers, body: { selectedTests } })).status, 200);
  const config = (await env.request('/api/config', { headers })).data;
  assert.deepEqual(config.userPreferences.selectedTests, selectedTests);
  assert.ok(config.suites.find(s => s.id === 'yinmik-c600').deviceGuide.steps.length > 5);
  for (const key of ['ec', 'tds', 'salinity', 'orp', 'sg']) assert.ok(config.allParameters.find(p => p.key === key));
  const english = (await env.request('/api/suites/yinmik-ez9908?lang=en', { headers })).data.suite;
  assert.equal(english.tests.find(p => p.key === 'ec').name, 'Conductivity');
  assert.ok(english.deviceGuide.steps[0].text.en);
  const aq = (await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'YINMIK demo', volume_l: 100 } })).data.id;
  const values = { ph: 8.1, ec: 53000, tds: 34000, salinity: 35, orp: -20, sg: 1.025, no3: 10 };
  const result = await env.request(`/api/aquariums/${aq}/measurements`, { method: 'POST', headers, body: { values, selectedTests } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const invalid = await env.request(`/api/aquariums/${aq}/measurements`, { method: 'POST', headers, body: { values: { ec: 53000 }, selectedTests: ['yinmik-ez9908:ec'] } });
  assert.equal(invalid.status, 400, 'The actual selected device range must be enforced');
  const { randomUUID } = require('node:crypto');
  const snapshot = (await env.request('/api/offline/state', { headers })).data;
  assert.deepEqual(snapshot.responses['/config'].suites.find(s => s.id === 'yinmik-c600').deviceGuide,
    config.suites.find(s => s.id === 'yinmik-c600').deviceGuide, 'Offline state must include the complete guide');
  const draftPath = `/aquariums/${aq}/measurement-draft`;
  const draft = { draftId: randomUUID(), when: '2026-10-18T12:00', timeZoneOffset: -120, note: 'offline meter',
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value).replace('.', ',')])),
    suite: 'yinmik-c600', selected: selectedTests, timers: {} };
  const command = { id: randomUUID(), owner: snapshot.owner, kind: 'workspace', aquarium: String(aq), path: draftPath,
    method: 'PUT', body: draft, base: snapshot.versions[draftPath] };
  // API user id is authoritative; snapshot shape need not expose an owner property.
  command.owner = (await env.request('/api/me', { headers })).data.id;
  const pending = await env.request('/api/offline/operations', { method: 'POST', headers, body: command });
  assert.equal(pending.status, 200, JSON.stringify(pending.data));
  assert.deepEqual((await env.request('/api' + draftPath, { headers })).data.values, draft.values);
  const complete = { ...command, id: randomUUID(), path: draftPath + '/complete', method: 'POST', base: pending.data.version,
    body: { draftId: draft.draftId, measured_at: new Date().toISOString(), values, selectedTests } };
  const completed = await env.request('/api/offline/operations', { method: 'POST', headers, body: complete });
  assert.equal(completed.status, 200, JSON.stringify(completed.data));
  assert.deepEqual((await env.request('/api/offline/operations', { method: 'POST', headers, body: complete })).data, completed.data);
  const inventory = (await env.request('/api/me/test-inventory?suiteId=yinmik-c600', { headers })).data.items;
  assert.ok(inventory.every(item => item.used === 0 && !item.tracksUsage));
});
