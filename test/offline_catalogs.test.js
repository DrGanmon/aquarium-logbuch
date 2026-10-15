'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');
const json = value => JSON.parse(JSON.stringify(value));

test('Offline catalogs: authenticated snapshots, conditional updates and parity with list/detail APIs', { timeout: 90000 }, async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite' });
  t.after(() => env.cleanup());
  assert.equal((await env.request('/api/catalogs/species')).status, 401);
  const user = await env.createUserAndLogin('catalog_offline');
  const headers = { Cookie: user.cookie };
  assert.equal((await env.request('/api/catalogs/unknown', { headers })).status, 404);
  assert.equal((await env.request('/api/catalogs/species?lang=fr', { headers })).status, 400);
  const { queryCatalog } = require('../dist/backend/src/shared/offline-catalog-query');
  for (const lang of ['de', 'en']) {
    const snapshots = {};
    for (const kind of ['species', 'plants', 'health']) {
      const path = `/api/catalogs/${kind}?lang=${lang}`;
      const response = await env.request(path, { headers });
      assert.equal(response.status, 200, response.text);
      assert.match(response.data.version, /^[a-f0-9]{64}$/);
      assert.equal(response.data.language, lang);
      assert.equal(response.data.kind, kind);
      assert.equal(response.data.schema, 1);
      assert.equal(response.headers.get('etag'), `"${response.data.version}"`);
      const repeated = await env.request(path, { headers: { ...headers, 'If-None-Match': response.headers.get('etag') } });
      assert.equal(repeated.status, 304);
      assert.equal(repeated.text, '');
      const changed = await env.request(path, { headers: { ...headers, 'If-None-Match': '"old"' } });
      assert.equal(changed.status, 200);
      assert.equal(changed.data.version, response.data.version);
      const weak = await env.request(path, { headers: { ...headers, 'If-None-Match': 'W/' + response.headers.get('etag') } });
      assert.equal(weak.status, 304);
      snapshots[kind] = response.data;
    }
    const compare = async (kind, path) => {
      const online = await env.request('/api' + path, { headers: { ...headers, 'X-Language': lang } });
      assert.equal(online.status, 200, path);
      assert.deepEqual(json(queryCatalog(snapshots[kind], path)), online.data, `${lang} ${path}`);
    };
    const species = snapshots.species.data.species;
    for (const query of ['', '?water_type=all', '?category=all', '?limit=24&offset=0', '?limit=7&offset=5&water_type=fresh', '?limit=8&offset=0&q=salz', '?limit=24&category=' + encodeURIComponent(species[0].category)]) {
      await compare('species', '/species' + query);
    }
    await compare('species', '/species/categories');
    await compare('species', '/species/neon');
    await compare('species', '/species/' + species[0].id);
    await compare('species', '/species/' + species.at(-1).id);
    for (const query of ['', '?limit=5&offset=3', '?limit=24&water_type=fresh&q=anubias', '?limit=10&category=' + encodeURIComponent(snapshots.plants.data.plants[0].category)]) await compare('plants', '/plants' + query);
    await compare('plants', '/plants/' + snapshots.plants.data.plants[0].id);
    const health = snapshots.health.data;
    const speciesId = health.catalog.species[0].id;
    for (const query of ['', '?waterType=fresh', '?waterType=salt', '?speciesId=' + speciesId, '?waterType=fresh&q=ich']) await compare('health', '/health/catalog' + query);
    const disease = health.diseases.find(item => item.affectedSpecies.includes(speciesId)) || health.diseases[0];
    await compare('health', '/health/diseases/' + disease.id);
    await compare('health', '/health/diseases/' + disease.id + '?speciesId=' + speciesId);
    for (const query of ['', '?waterType=salt', '?legalStatus=rx', '?diseaseId=' + disease.id, '?q=salz']) await compare('health', '/health/medications' + query);
    await compare('health', '/health/medications/' + health.medicationDetails[0].id);
    for (const [kind, path] of [['plants', '/plants/missing'], ['species', '/species/missing'], ['health', '/health/diseases/missing'], ['health', '/health/medications/missing']]) {
      assert.throws(() => queryCatalog(snapshots[kind], path), error => error.status === 404);
    }
    assert.throws(() => queryCatalog(snapshots.plants, '/plants?limit=1000'), error => error.status === 400);
    assert.throws(() => queryCatalog(snapshots.health, '/health/catalog?waterType=bad'), error => error.status === 400);
  }
});
