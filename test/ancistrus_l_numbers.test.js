'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../src/config/species/ancistrus-l-numbers.json').species;
const catalog = require('../dist/backend/src/services/species-service');
const { searchSpecies } = require('../dist/backend/src/shared/species-search');
const { queryCatalog } = require('../dist/backend/src/shared/offline-catalog-query');
const { HealthService } = require('../dist/backend/src/services/health-service');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

test('Ancistrus: belegte L-Nummern gemeinsam auswählen, Artwerte und Identität unabhängig erhalten', () => {
  assert.equal(data.length, 69);
  const codes = new Set(data.flatMap(item => item.aliases.filter(alias => /^L\d{3}$/.test(alias))));
  assert.equal(codes.size, 78);
  const health = new HealthService();
  for (const lang of ['de', 'en']) {
    const all = catalog.getAllSpecies(lang);
    const grouped = searchSpecies({ species: all, query: '', category: 'all', waterType: 'all' }).filtered;
    assert.equal(grouped.length, 147);
    const parent = grouped.find(item => item.id === 'ancistrus-sp');
    assert.equal(parent.variants.length, 70);
    for (const entry of data) {
      const actual = catalog.getSpeciesById(entry.id, lang);
      assert.equal(actual.variantOf, undefined, 'Keine erfundene taxonomische Variante');
      assert.equal(actual.selectionOf, 'ancistrus-sp');
      assert.ok(parent.variants.some(item => item.id === entry.id && item.kind === entry.selectionKind));
      assert.ok(health.speciesProfile(entry.id, 'fresh', lang));
      assert.deepEqual(health.speciesRanges(entry.id).temp, catalog.getSpeciesById(entry.id).temp);
      for (const alias of entry.aliases) {
        const found = searchSpecies({ species: all, query: alias, waterType: 'all', category: 'all' }).filtered;
        assert.equal(found.length, 1, alias);assert.equal(found[0].id, 'ancistrus-sp');
        assert.ok(found[0].matchedVariants.includes(actual.name));
      }
    }
    for (const excluded of ['L046', 'L278', 'L298']) assert.ok(!searchSpecies({ species: all, query: excluded, waterType: 'all', category: 'all' }).filtered.some(item => item.id === 'ancistrus-sp'));
  }
  assert.deepEqual(catalog.getSpeciesById('ancistrus-sp-l521').temp, { min: 20, max: 23, idealMin: null, idealMax: null });
  assert.equal(catalog.getSpeciesById('ancistrus-sp-l504').temp.min, null, 'Fehlende Haltungswerte bleiben unbekannt');
  assert.equal(catalog.getSpeciesById('ancistrus-sp-l255').selectionKind, 'unclassified');
  assert.equal(catalog.getSpeciesById('ancistrus-dolichopterus').selectionKind, 'species');
  assert.equal(catalog.findSpeciesByName('Brauner Antennenwels').id, 'ancistrus-sp');
});

for (const type of ['sqlite', 'mongodb']) test(`Ancistrus: Suche, Bestand, Health und Offline mit stabilen Auswahl-IDs (${type})`, { timeout: 90000 }, async t => {
  const env = type === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('ancistrus_' + type), headers = { Cookie: user.cookie };
  const aquarium = await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Ancistrus', water_type: 'fresh', volume_l: 300 } });
  const root = '/api/aquariums/' + aquarium.data.id;
  for (const id of ['ancistrus-dolichopterus', 'ancistrus-sp-l521', 'ancistrus-sp-l144']) assert.equal((await env.request(root + '/stock/catalog', { method: 'POST', headers, body: { speciesId: id, count: 1, names: ['Mein Wels'] } })).status, 200);
  for (const lang of ['de', 'en']) {
    const local = { ...headers, 'X-Language': lang };
    const snapshot = (await env.request('/api/catalogs/species?lang=' + lang, { headers })).data;
    for (const query of ['L183', 'L 181', 'L521', 'L529']) {
      const path = '/species?q=' + encodeURIComponent(query) + '&limit=24';
      const online = await env.request('/api' + path, { headers: local });
      assert.equal(online.status, 200);assert.deepEqual(online.data, queryCatalog(snapshot, path));
      assert.equal(online.data.total, 1);assert.ok(online.data.species[0].matchedVariants.length);
    }
    const stock = (await env.request(root + '/stock', { headers: local })).data;
    assert.equal(stock.length, 3);assert.ok(stock.every(entry => entry.variantName && entry.name === 'Mein Wels'));
    const residents = (await env.request('/api/health/aquariums/' + aquarium.data.id + '/residents', { headers: local })).data.residents;
    assert.ok(residents.every(entry => entry.supported));
  }
});

for (const type of ['sqlite', 'mongodb']) test(`Offline forms: animal and plant choices survive local writes, server replay and duplicate delivery (${type})`, { timeout: 90000 }, async t => {
  const { randomUUID } = require('node:crypto');
  const { applyLocalOperation, deriveWorkspace } = require('../dist/backend/src/shared/offline-workspace-model');
  const env = type === 'mongodb' ? await createMongoTestEnvironment() : createTestEnvironment();t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('offline_forms_' + type), headers = { Cookie: user.cookie };
  const owner = (await env.request('/api/me', { headers })).data.id;
  const aquarium = (await env.request('/api/aquariums', { method: 'POST', headers, body: { name: 'Offline forms', water_type: 'fresh', volume_l: 300 } })).data;
  const root = '/aquariums/' + aquarium.id;
  const snapshot = (await env.request('/api/offline/state', { headers })).data;
  const catalogs = {};
  for (const kind of ['species', 'plants', 'health']) catalogs[kind] = (await env.request('/api/catalogs/' + kind + '?lang=de', { headers })).data;
  const inputs = [
    [root + '/stock/catalog', 'POST', { speciesId: 'ancistrus-dolichopterus', count: 1, names: ['L183'] }],
    [root + '/stock/catalog', 'POST', { speciesId: 'trichopodus-trichopterus-gold', count: 1, names: ['Goldie'] }],
    [root + '/plants/anubias-nana-pangolino', 'PUT', { count: 2 }],
    [root + '/plants/anubias-nana-pinto', 'PUT', { count: 5 }],
  ];
  const commands = inputs.map(([path, method, body], index) => ({ id: randomUUID(), owner, kind: 'workspace', aquarium: String(aquarium.id), path, method, body, base: method === 'PUT' ? 'missing' : null, temporaryIds: [-100 - index], createdAt: new Date().toISOString() }));
  for (const command of commands) applyLocalOperation(snapshot, command, catalogs);
  deriveWorkspace(snapshot, catalogs);
  assert.deepEqual(snapshot.responses[root + '/stock'].map(row => row.speciesId), ['ancistrus-dolichopterus', 'trichopodus-trichopterus-gold']);
  assert.ok(snapshot.responses[root + '/stock'].every(row => row.variantName));
  assert.deepEqual(snapshot.responses[root + '/plants'].map(row => [row.plant_id, row.count]), [['anubias-nana-pangolino', 2], ['anubias-nana-pinto', 5]]);
  for (const command of commands) {
    const saved = await env.request('/api/offline/operations', { method: 'POST', headers, body: command });
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual((await env.request('/api/offline/operations', { method: 'POST', headers, body: command })).data, saved.data);
  }
  const stock = (await env.request('/api' + root + '/stock', { headers })).data;
  assert.deepEqual(stock.map(row => row.speciesId).sort(), ['ancistrus-dolichopterus', 'trichopodus-trichopterus-gold']);
  const plants = (await env.request('/api' + root + '/plants', { headers })).data;
  assert.deepEqual(plants.map(row => [row.plant_id, row.count]).sort(), [['anubias-nana-pangolino', 2], ['anubias-nana-pinto', 5]]);
});
