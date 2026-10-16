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
