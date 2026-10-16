'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
const requests = [
  ['Hymenasplenium obscurum', 'hymenasplenium-obscurum'],
  ['Anubias Pangolino', 'anubias-nana-pangolino'],
  ['Anubias barteri var. petite', 'anubias-nana-petite'],
  ['Bucephalandra Kedagang', 'bucephalandra-kedagang'],
  ['Bucephalandra pygmea Bukit Kelam', 'bucephalandra-pygmaea-bukit-kelam'],
  ['Riccardia graeffei', 'riccardia-graeffei'],
  ['Bucephalandra Brownie Ghost', 'bucephalandra-brownie-ghost'],
  ['Aegagropila linnaei', 'aegagropila-linnaei'],
  ['Bucephalandra Catherinae Mini', 'bucephalandra-mini-catherinae'],
  ['Anubias Pinto', 'anubias-nana-pinto'],
  ['Bucephalandra Theia', 'bucephalandra-theia'],
  ['Marsilea hirsuta', 'marsilea-hirsuta'],
];
const fish = ['trichopodus-trichopterus-gold', 'ancistrus-sp-l144'];

test('Wunschkatalog: Handelsformen bleiben unterscheidbar und Health verwendet passende Profile', () => {
  const { HealthService } = require('../dist/backend/src/services/health-service');
  const species = require('../dist/backend/src/services/species-service');
  const health = new HealthService();
  for (const lang of ['de', 'en']) for (const id of fish) {
    const entry = species.getSpeciesById(id, lang);
    assert.ok(entry.name && entry.description && entry.behaviorNotes);
    const profile = health.speciesProfile(id, 'fresh', lang);
    const parent = health.speciesProfile(id === fish[0] ? 'trichopodus-trichopterus' : 'ancistrus-sp', 'fresh', lang);
    assert.equal(profile.treeId, parent.treeId);
    assert.deepEqual(profile.candidates, parent.candidates);
    assert.ok(health.catalog({ speciesId: id, language: lang }).total > 0);
    for (const disease of health.catalog({ speciesId: id, language: lang }).diseases) {
      const detail = health.disease(disease.id, lang, id);
      assert.ok(detail.affectedSpeciesNames.some(item => item.id === id));
      assert.ok(detail.speciesSigns.length);
    }
  }
  assert.notEqual(species.getSpeciesById(fish[1]).id, species.getSpeciesById('otocinclus-affinis').id);
  const cautions = health.bundle('fresh').diseases.speciesIndex[fish[1]].treatmentCautions.join(' ');
  assert.match(cautions, /Knochenplatten/);
  const plants = require('../src/config/plants/plants.json');
  assert.ok(plants.plants.some(item => item.id === 'riccardia-chamedryfolia'));
  assert.ok(plants.plants.some(item => item.id === 'riccardia-graeffei'));
  assert.match(plants.plants.find(item => item.id === 'aegagropila-linnaei').category, /Grünalge/);
});

for (const type of ['sqlite', 'mongodb']) test(`Wunschkatalog: Suche, Pflanzenbestand und Tierdiagnose in beiden Sprachen (${type})`, { timeout: 90000 }, async t => {
  const env = type === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment({ DB_TYPE: 'sqlite' });
  t.after(() => env.cleanup());
  const owner = await env.createUserAndLogin('requested_' + type);
  const headers = { Cookie: owner.cookie };
  const created = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Requested catalog', water_type: 'fresh', volume_l: 240 } });
  assert.equal(created.status, 200);
  const root = '/api/aquariums/' + created.data.id;
  for (const [query, id] of requests) {
    for (const lang of ['de', 'en']) {
      const localized = { ...headers, 'X-Language': lang };
      const found = await env.request('/api/plants?q=' + encodeURIComponent(query), { headers: localized });
      assert.equal(found.status, 200);assert.ok(found.data.plants.some(plant => plant.id === id || plant.variants?.some(form => form.id === id)), `${lang}: ${query}`);
      const detail = await env.request('/api/plants/' + id, { headers: localized });
      assert.equal(detail.status, 200);assert.ok(detail.data.sources.length > 0);
      assert.ok(detail.data.sources.every(source => source.url.startsWith('https://')));
    }
    assert.equal((await env.request(root + '/plants/' + id, { method: 'PUT', headers, body: { count: 2 } })).status, 200);
  }
  assert.equal((await env.request(root + '/plants', { headers })).data.length, requests.length);
  for (const id of fish) assert.equal((await env.request(root + '/stock/catalog', { method: 'POST', headers, body: { speciesId: id, count: 1, names: [id === fish[0] ? "Goldie" : "Lenny"] } })).status, 200);
  for (const lang of ['de', 'en']) {
    const localized = { ...headers, 'X-Language': lang };
    const speciesCatalog = require('../dist/backend/src/services/species-service');
    const plantsCatalog = require('../dist/backend/src/services/plant-service').getPlantCatalog(lang);
    const stock = (await env.request(root + '/stock', { headers: localized })).data;
    for (const entry of stock) assert.equal(entry.variantName, speciesCatalog.getSpeciesById(entry.speciesId, lang).name);
    const planted = (await env.request(root + '/plants', { headers: localized })).data;
    for (const entry of planted) { const definition = plantsCatalog.plants.find(plant => plant.id === entry.plant_id);assert.equal(entry.variantName, definition.variantOf ? definition.name : null); }
    const residents = await env.request(`/api/health/aquariums/${created.data.id}/residents`, { headers: localized });
    assert.equal(residents.status, 200);assert.equal(residents.data.residents.length, 2);
    for (const resident of residents.data.residents) {
      assert.ok(fish.includes(resident.speciesId));assert.equal(resident.supported, true);
      const result = await env.request(`/api/health/aquariums/${created.data.id}/diagnosis`, { method: 'POST', headers: localized, body: { stockId: resident.stockId, answers: [] } });
      assert.equal(result.status, 200);assert.equal(result.data.resident.speciesId, resident.speciesId);
      assert.ok(result.data.question || result.data.complete);
    }
    // These are the same versioned snapshots used by the offline frontend.
    const plants = await env.request('/api/catalogs/plants?lang=' + lang, { headers });
    assert.equal(plants.status, 200);
    for (const [, id] of requests) assert.ok(plants.data.data.plants.some(plant => plant.id === id));
    const health = await env.request('/api/catalogs/health?lang=' + lang, { headers });
    assert.equal(health.status, 200);
    for (const id of fish) assert.ok(health.data.data.catalog.species.some(species => species.id === id));
    const workspace = (await env.request('/api/offline/state', { headers: localized })).data;
    const definitions = (await env.request('/api/catalogs/species?lang=' + lang, { headers })).data;
    const { deriveWorkspace } = require('../dist/backend/src/shared/offline-workspace-model');
    // Simulate an older workspace that has not received the new presentation field yet.
    for (const entry of [...workspace.responses[root.replace('/api', '') + '/stock'], ...workspace.responses[root.replace('/api', '') + '/plants']]) delete entry.variantName;
    deriveWorkspace(workspace, { species: definitions, plants: plants.data });
    assert.deepEqual(workspace.responses[root.replace('/api', '') + '/stock'].map(entry => entry.variantName), stock.map(entry => entry.variantName));
    assert.deepEqual(workspace.responses[root.replace('/api', '') + '/plants'].map(entry => entry.variantName), planted.map(entry => entry.variantName));

  }
});
