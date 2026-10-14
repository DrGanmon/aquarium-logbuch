'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');
const de = require('../src/config/plants/plants.json');
const en = require('../src/config/plants/plants.en.json');

test('Pflanzenkatalog: identische IDs und auflösbare Quellen in beiden Sprachen', () => {
  assert.equal(de.plants.length, 149);
  assert.deepEqual(de.plants.map(p => p.id).sort(), en.plants.map(p => p.id).sort());
  for (const catalog of [de, en]) {
    assert.equal(new Set(catalog.plants.map(p => p.id)).size, catalog.plants.length);
    for (const plant of catalog.plants) {
      assert.ok(plant.name && plant.scientificName && plant.description);
      for (const source of plant.sources) assert.ok(catalog.sources[source], source);
    }
  }
});

test('Pflanzen-API: Authentifizierung, Seiten, zweisprachige Suche, Filter und Details', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite' });t.after(() => env.cleanup());
  assert.equal((await env.request('/api/plants')).status, 401);
  assert.equal((await env.request('/api/plants/anubias-barteri-nana')).status, 401);
  const user = await env.createUserAndLogin('plants_catalog');
  const headers = { Cookie: user.cookie };
  const request = (suffix = '', lang = 'de') => env.request(`/api/plants${suffix}`, { headers: { ...headers, 'X-Language': lang } });
  const first = await request('?limit=24');
  assert.equal(first.status, 200);assert.equal(first.data.total, 149);assert.equal(first.data.next, 24);
  assert.equal(first.data.plants[0].temp, undefined);
  const ids = [];
  let next = 0;
  while (next !== null) {
    const page = await request(`?limit=24&offset=${next}`);
    ids.push(...page.data.plants.map(p => p.id));next = page.data.next;
  }
  assert.equal(ids.length, 149);assert.equal(new Set(ids).size, 149);
  assert.deepEqual(ids.sort(), de.plants.map(p => p.id).sort());
  const last = de.plants.at(-1);
  const found = await request(`?q=${encodeURIComponent(last.scientificName)}`);
  assert.ok(found.data.plants.some(p => p.id === last.id));
  for (const lang of ['de', 'en']) {
    const found = await request('?q=Dwarf%20Anubias', lang);
    assert.ok(found.data.plants.some(p => p.id === 'anubias-barteri-nana'));
    const detail = await request('/anubias-barteri-nana', lang);
    const expected = (lang === 'de' ? de : en).plants[0];
    assert.equal(detail.status, 200);assert.deepEqual(detail.data.plant, { ...expected, image: null });
    assert.ok(detail.data.sources.length);assert.ok(detail.data.sources.every(s => s.url));
    assert.ok(detail.data.fieldDefinitions.placement.epiphyte);assert.ok(detail.data.notes.length);
  }
  const reverse = await request('?q=Zwerg-Speerblatt', 'en');
  assert.equal(reverse.data.plants[0].name, 'Dwarf Anubias');
  const category = last.category;
  const filtered = await request(`?water_type=salt&category=${encodeURIComponent(category)}`);
  assert.equal(filtered.data.total, de.plants.filter(p => p.waterType === 'salt' && p.category === category).length);
  assert.ok(filtered.data.plants.every(p => p.waterType === 'salt' && p.category === category));
  assert.deepEqual(filtered.data.categories, first.data.categories);
  const empty = await request('?q=does_not_exist');
  assert.equal(empty.data.total, 0);assert.equal(empty.data.next, null);
  const end = await request('?offset=99999');assert.deepEqual(end.data.plants, []);assert.equal(end.data.next, null);
  assert.equal((await request('/does-not-exist')).status, 404);
  for (const query of ['?limit=0', '?limit=101', '?limit=-1', '?offset=1.5', '?offset=-1', '?limit=1&limit=2', '?offset=9007199254740992'])
    assert.equal((await request(query)).status, 400, query);
});
