'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Artenkatalog: Seiten ohne Duplikate und globale Suche nach noch nicht geladenen Arten', async t => {
  const env = createTestEnvironment({ DB_TYPE: 'sqlite' });t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('species_paging');
  const headers = { Cookie: user.cookie };
  const request = query => env.request('/api/species' + query, { headers });
  assert.equal((await env.request('/api/species?limit=24')).status, 401);
  const full = await request('');assert.equal(full.status, 200);
  const first = await request('?limit=24');assert.equal(first.status, 200);
  assert.equal(first.data.species.length, 24);assert.equal(first.data.total, full.data.species.length);
  assert.equal(first.data.next, 24);assert.deepEqual(first.data.categories, full.data.categories);
  assert.equal(first.data.species[0].image, undefined);
  assert.equal(first.data.species[0].temp, undefined);
  const ids = first.data.species.map(s => s.id);
  let next = first.data.next;
  while (next !== null) {
    const page = await request(`?limit=24&offset=${next}`);
    assert.equal(page.status, 200);assert.equal(page.data.total, full.data.species.length);
    assert.ok(page.data.species.length <= 24);
    ids.push(...page.data.species.map(s => s.id));next = page.data.next;
  }
  assert.equal(ids.length, full.data.species.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), full.data.species.map(s => s.id).sort());
  const lateSpecies = full.data.species.find(s => s.id === ids.at(-1));
  assert.ok(!first.data.species.some(s => s.id === lateSpecies.id));
  const search = await request(`?limit=24&q=${encodeURIComponent(lateSpecies.scientificName)}`);
  assert.ok(search.data.species.some(s => s.id === lateSpecies.id), 'Suche muss Arten außerhalb der geladenen Seite finden');
  const detail = await env.request(`/api/species/${lateSpecies.id}`, { headers });
  assert.equal(detail.status, 200);assert.ok(detail.data.species.temp);
  const betta = await request('?limit=24&q=betta%20splendens');
  assert.ok(betta.data.species.some(s => s.id === 'betta-splendens'));
  const byEnglish = await request('?limit=24&q=Siamese');
  assert.ok(byEnglish.data.species.some(s => s.id === 'betta-splendens'), 'Englische Namen bleiben im deutschen Katalog auffindbar');
  const category = first.data.categories.at(-1);
  const filtered = await request(`?limit=3&water_type=fresh&category=${encodeURIComponent(category)}`);
  const expected = full.data.species.filter(s => s.waterType === 'fresh' && s.category === category);
  assert.equal(filtered.data.total, expected.length);
  assert.ok(filtered.data.species.every(s => s.waterType === 'fresh' && s.category === category));
  assert.deepEqual(filtered.data.categories, first.data.categories, 'Filteroptionen hängen nicht von der geladenen Seite ab');
  const empty = await request('?limit=24&q=species_that_does_not_exist');
  assert.equal(empty.data.total, 0);assert.equal(empty.data.next, null);assert.deepEqual(empty.data.species, []);
  const end = await request('?limit=24&offset=999999');
  assert.deepEqual(end.data.species, []);assert.equal(end.data.next, null);
  const english = await env.request('/api/species?limit=24&q=betta%20splendens', { headers: { ...headers, 'X-Language': 'en' } });
  assert.equal(english.data.species[0].name, 'Siamese Fighting Fish');
  for (const query of ['?limit=0', '?limit=101', '?limit=-1', '?limit=1.5', '?limit=24&offset=-1', '?limit=24&offset=1.5', '?limit=24&offset=9007199254740992', '?limit=1&limit=2'])
    assert.equal((await request(query)).status, 400, query);
});
