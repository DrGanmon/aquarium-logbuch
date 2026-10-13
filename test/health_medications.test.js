'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
const { HealthService } = require('../dist/backend/src/services/health-service');
const species = require('../dist/backend/src/services/species-service');

test('Medikamentenkatalog: beide Sprachen, Hilfsmittel, Quellen und vollständig verknüpfte Krankheiten', { timeout: 60000 }, () => {
  const service = new HealthService();
  for (const language of ['de', 'en']) {
    const catalog = service.medications({ language });
    assert.equal(catalog.total, 24);
    assert.equal(catalog.items.filter(item => item.kind === 'medication').length, 20);
    assert.equal(catalog.items.filter(item => item.kind === 'supply').length, 4);
    assert.equal(new Set(catalog.items.map(item => item.id)).size, 24);
    assert.ok(catalog.items.some(item => !item.legalStatusVerified));
    assert.ok(catalog.items.some(item => item.invertebrateSafe === false));
    for (const medication of catalog.items) {
      const detail = service.medication(medication.id, language);
      assert.ok(detail.sourceDetails.length, medication.id);
      assert.ok(detail.sourceDetails.every(source => source.id && source.title));
      for (const indication of medication.indications) {
        const disease = service.disease(indication.diseaseId, language);
        assert.ok(disease, indication.diseaseId);
        assert.ok(disease.medications.some(item => item.id === medication.id && item.role === indication.role));
      }
    }
    for (const disease of service.catalog({ language }).diseases) {
      const detail = service.disease(disease.id, language);
      for (const item of detail.medications) {
        assert.ok(item.id && item.name && item.roleLabel);
        assert.ok(item.waterTypes.includes(detail.waterType));
        assert.ok(item.indications.some(indication => indication.diseaseId === disease.id));
      }
    }
    assert.ok(service.medications({ language, waterType: 'salt' }).items.every(item => item.waterTypes.includes('salt')));
    assert.ok(service.medications({ language, diseaseId: 'argulosis' }).items.every(item => item.indications.some(entry => entry.diseaseId === 'argulosis')));
    assert.ok(service.medications({ language, legalStatus: 'rx' }).items.every(item => item.legalStatus === 'rx'));
    assert.equal(service.medications({ language, diseaseId: '__proto__' }).total, 0);
    assert.equal(service.medication('__proto__', language), null);
    assert.ok(service.medications({ language, query: 'Costapur' }).total > 0);
  }
  assert.notEqual(service.medication('praziquantel', 'de').category, service.medication('praziquantel', 'en').category);
});

test('Arten liegen nur im gemeinsamen Katalog; Gesundheitsprofile speichern keine duplizierten Stammdaten', { timeout: 60000 }, () => {
  assert.equal(fs.existsSync('src/config/health/species'), false);
  assert.equal(fs.existsSync('dist/backend/src/config/health/species'), false);
  const service = new HealthService();
  const ids = new Set();
  for (const file of fs.readdirSync('src/config/species').filter(file => file.endsWith('.json'))) {
    for (const entry of JSON.parse(fs.readFileSync(path.join('src/config/species', file))).species) {
      assert.ok(!ids.has(entry.id));ids.add(entry.id);
    }
  }
  assert.equal(ids.size, 147);
  for (const lang of ['de', 'en']) for (const water of ['freshwater', 'saltwater']) {
    const diseases = JSON.parse(fs.readFileSync(`src/config/health/${lang}/diseases-${water}.json`));
    const diagnosis = JSON.parse(fs.readFileSync(`src/config/health/${lang}/diagnosis-${water}.json`));
    for (const [id, entry] of [...Object.entries(diseases.speciesIndex), ...Object.entries(diagnosis.species)]) {
      assert.ok(ids.has(id), id);
      for (const field of ['name', 'scientificName', 'temp', 'ph', 'gh', 'kh']) assert.equal(Object.hasOwn(entry, field), false);
      const central = species.getSpeciesById(id, lang);
      const fromHealth = service.catalog({ language: lang }).species.find(item => item.id === id);
      assert.equal(fromHealth.name, central.name);
      assert.equal(fromHealth.scientificName, central.scientificName);
      const ranges = service.speciesRanges(id);
      for (const field of ['temp', 'ph', 'gh', 'kh']) assert.deepEqual(ranges[field], central[field]);
    }
  }
  assert.deepEqual(service.speciesRanges('symphysodon-spp'), service.speciesRanges('symphysodon-sp'));
});

for (const backend of ['sqlite', 'mongodb']) {
  test(`Gesundheits-API: Medikamentenfilter, Lokalisierung, Details und Zugriff (${backend})`, { timeout: 60000 }, async (t) => {
    const env = backend === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
    t.after(() => env.cleanup());
    assert.equal((await env.request('/api/health/medications')).status, 401);
    const user = await env.createUserAndLogin('medications_user', 'password123');
    const headers = { Cookie: user.cookie };
    const list = await env.request('/api/health/medications', { headers });
    assert.equal(list.status, 200);assert.equal(list.data.total, 24);
    const filtered = await env.request('/api/health/medications?waterType=salt&legalStatus=rx', { headers });
    assert.equal(filtered.status, 200);assert.ok(filtered.data.items.length);
    assert.ok(filtered.data.items.every(item => item.waterTypes.includes('salt') && item.legalStatus === 'rx'));
    for (const query of ['waterType=bad', 'legalStatus=bad']) assert.equal((await env.request(`/api/health/medications?${query}`, { headers })).status, 400);
    assert.equal((await env.request('/api/health/medications/missing', { headers })).status, 404);
    const de = await env.request('/api/health/medications/praziquantel', { headers });
    const en = await env.request('/api/health/medications/praziquantel', { headers: { ...headers, 'X-Language': 'en' } });
    assert.equal(de.status, 200);assert.equal(en.status, 200);
    assert.notEqual(de.data.medication.category, en.data.medication.category);
    assert.equal(typeof de.data.medication.legalStatusVerified, 'boolean');
    assert.ok(de.data.medication.sourceDetails.length);
    const disease = await env.request('/api/health/diseases/argulosis', { headers });
    assert.equal(disease.status, 200);
    assert.ok(disease.data.disease.medications.some(item => item.id === 'emamectin-argulol'));
  });
}
