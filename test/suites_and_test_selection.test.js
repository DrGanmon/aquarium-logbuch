'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { createTestEnvironment } = require('./helpers/env');
const cfg = require('../dist/backend/config.js');

describe('JSON-Testsuiten & Benutzerauswahl', () => {
  let env;

  before(async () => {
    env = createTestEnvironment({ ALLOW_REGISTRATION: 'true', LOCAL_LOGIN: 'true' });
  });

  after(async () => {
    await env.cleanup();
  });

  test('Suite-Service: Lädt Standard-Suite (JBL Pro Tröpfchentest) und alternative Suiten aus JSON', () => {
    const suites = cfg.suiteService.getSuites();
    assert.ok(Array.isArray(suites));
    assert.ok(suites.length >= 2, 'Mindestens zwei Suiten sollten vorhanden sein');

    const defSuite = cfg.suiteService.getDefaultSuite();
    assert.strictEqual(defSuite.id, 'jbl-pro');
    assert.strictEqual(defSuite.name, 'JBL Pro Tröpfchentest');
    assert.strictEqual(defSuite.isDefault, true);

    // Prüfe konsolidierten pH-Wert
    const ph = defSuite.tests.find((t) => t.key === 'ph');
    assert.ok(ph, 'pH-Test muss in JBL Pro Suite vorhanden sein');
    assert.strictEqual(ph.min, 3);
    assert.strictEqual(ph.max, 10);
    assert.strictEqual(ph.verified, true);
    assert.ok(ph.wait > 0);

    // Prüfe Reaktionszeiten laut JBL-Anleitung
    const k = defSuite.tests.find((t) => t.key === 'k');
    assert.strictEqual(k.wait, 90, 'Kalium-Wartezeit muss 90s sein (30s schwenken + 60s stehen)');
    assert.strictEqual(k.verified, true);

    const no2 = defSuite.tests.find((t) => t.key === 'no2');
    assert.strictEqual(no2.wait, 300, 'Nitrit-Wartezeit muss 300s (5 min) sein');
    assert.strictEqual(no2.verified, true);

    const no3 = defSuite.tests.find((t) => t.key === 'no3');
    assert.strictEqual(no3.wait, 600, 'Nitrat-Wartezeit muss 600s (10 min) sein');
    assert.strictEqual(no3.verified, true);

    const nh4 = defSuite.tests.find((t) => t.key === 'nh4');
    assert.strictEqual(nh4.wait, 600, 'Ammonium-Wartezeit muss 600s (10 min) sein');
    assert.strictEqual(nh4.verified, true);

    const po4 = defSuite.tests.find((t) => t.key === 'po4');
    assert.strictEqual(po4.wait, 600, 'Phosphat-Wartezeit muss 600s (10 min) sein');
    assert.strictEqual(po4.verified, true);

    const fe = defSuite.tests.find((t) => t.key === 'fe');
    assert.strictEqual(fe.wait, 600, 'Eisen-Wartezeit muss 600s (10 min) sein');
    assert.strictEqual(fe.verified, true);

    const easySuite = cfg.suiteService.getSuite('jbl-easy-7in1');
    assert.strictEqual(easySuite.id, 'jbl-easy-7in1');
    assert.ok(easySuite.tests.length >= 7);
  });

  test('API /api/config und /api/suites liefern Suiten und Parameter', async () => {
    const user = await env.createUserAndLogin('suiteuser', 'password123');

    // GET /api/config
    const resCfg = await env.request('/api/config', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(resCfg.status, 200);
    assert.ok(Array.isArray(resCfg.data.suites));
    assert.strictEqual(resCfg.data.defaultSuiteId, 'jbl-pro');
    assert.strictEqual(resCfg.data.currentSuite.id, 'jbl-pro');
    assert.ok(Array.isArray(resCfg.data.parameters));
    assert.ok(resCfg.data.userPreferences);

    // GET /api/suites
    const resSuites = await env.request('/api/suites', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(resSuites.status, 200);
    assert.ok(Array.isArray(resSuites.data.suites));

    // GET /api/suites/:id
    const resSingle = await env.request('/api/suites/jbl-pro', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(resSingle.status, 200);
    assert.strictEqual(resSingle.data.suite.id, 'jbl-pro');
  });

  test('Benutzer kann bevorzugte Testsuite und aktive Tests speichern', async () => {
    const user = await env.createUserAndLogin('customtests_user', 'password123');

    // 1. Initialer Zustand
    const meRes = await env.request('/api/me', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.selectedSuite, 'jbl-pro');
    assert.strictEqual(meRes.data.selectedTests, null);

    // 2. Tests anpassen (z. B. nur pH, KH, NO2, NO3)
    const customTests = ['ph', 'kh', 'no2', 'no3'];
    const putRes = await env.request('/api/me/tests', {
      method: 'PUT',
      headers: { Cookie: user.cookie },
      body: {
        selectedSuite: 'jbl-pro',
        selectedTests: customTests,
      },
    });
    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putRes.data.ok, true);
    assert.deepStrictEqual(putRes.data.selectedTests, customTests);

    // 3. /api/me erneut abrufen
    const meAfter = await env.request('/api/me', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(meAfter.status, 200);
    assert.deepStrictEqual(meAfter.data.selectedTests, customTests);

    // 4. Suite wechseln (z. B. auf Teststreifen)
    const switchSuiteRes = await env.request('/api/me/tests', {
      method: 'PUT',
      headers: { Cookie: user.cookie },
      body: {
        selectedSuite: 'jbl-easy-7in1',
        selectedTests: ['ph', 'cl2', 'no2'],
      },
    });
    assert.strictEqual(switchSuiteRes.status, 200);
    assert.strictEqual(switchSuiteRes.data.selectedSuite, 'jbl-easy-7in1');
    assert.deepStrictEqual(switchSuiteRes.data.selectedTests, ['ph', 'cl2', 'no2']);
  });

  test('Messungen mit konsolidiertem pH und ausgewählten Werten durchführen', async () => {
    const user = await env.createUserAndLogin('measure_tester', 'password123');

    // Aquarium anlegen
    const aqRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { name: 'Pflanzenbecken', water_type: 'fresh' },
    });
    assert.strictEqual(aqRes.status, 200);
    const aqId = aqRes.data.id;

    // Messung eintragen mit konsolidiertem pH-Wert (z. B. 6.8) und weiteren Werten
    const measRes = await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        values: {
          temp: '24.5',
          ph: '6.8',
          kh: '4.0',
          no2: '0.02',
          no3: '15',
          k: '12',
        },
        note: 'Wöchentliche Kontrollmessung',
      },
    });
    assert.strictEqual(measRes.status, 200);
    assert.strictEqual(measRes.data.alerts.length, 0);

    // Messung mit kritischem pH-Wert eintragen (z. B. 4.5 -> kritisch)
    const critMeasRes = await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        values: {
          ph: '4.5',
        },
      },
    });
    assert.strictEqual(critMeasRes.status, 200);
    assert.strictEqual(critMeasRes.data.alerts.length, 1);
    assert.strictEqual(critMeasRes.data.alerts[0].param, 'ph');
    assert.strictEqual(critMeasRes.data.alerts[0].level, 'crit');
  });
});
