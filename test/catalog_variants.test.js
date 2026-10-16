'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');
const { groupCatalogMatches, inheritCatalogVariants } = require('../dist/backend/src/shared/catalog-variants');
const species = require('../dist/backend/src/services/species-service');
const { searchSpecies } = require('../dist/backend/src/shared/species-search');
const { getPlantCatalog, searchPlants } = require('../dist/backend/src/services/plant-service');

test('Varianten: Gruppierung vor Seitenauswahl, Kindtreffer zeigen genau eine Stammkachel', () => {
  for (const lang of ['de', 'en']) {
    const all = species.getAllSpecies(lang);
    const roots = searchSpecies({ species: all, query: '', waterType: 'all', category: 'all' });
    assert.equal(roots.total, 147);assert.ok(roots.filtered.every(item => !item.variantOf));assert.ok(roots.filtered.every(item => !item.matchedVariants));
    for (const [term, root, variant] of [['Gold', 'trichopodus-trichopterus', 'trichopodus-trichopterus-gold'], ['L144', 'ancistrus-sp', 'ancistrus-sp-l144'], ['Cosby', 'trichopodus-trichopterus', 'trichopodus-trichopterus-opaline'], ['Halfmoon', 'betta-splendens', 'betta-splendens-halfmoon'], ['Blue Dream', 'neocaridina-davidi', 'neocaridina-davidi-blue-dream']]) {
      const found = searchSpecies({ species: all, query: term, waterType: 'all', category: 'all' }).filtered;
      assert.equal(found.filter(item => item.id === root).length, 1, term);
      assert.ok(found.find(item => item.id === root).variants.some(item => item.id === variant));
      assert.ok(found.every(item => item.id !== variant));
      assert.ok(found.find(item => item.id === root).matchedVariants.includes(all.find(item => item.id === variant).name), term);
    }
    for (const term of ['Pangolino', 'Petite', 'Pinto', 'caladiifolia']) {
      const found = searchPlants(lang, term).plants;
      assert.equal(found.length, 1);assert.equal(found[0].id, 'anubias-barteri-species');
      assert.ok(found[0].matchedVariants.some(name => name.toLowerCase().includes(term.toLowerCase())));
    }
    assert.ok(species.getSpeciesById('pterophyllum-altum', lang));
    assert.equal(species.getSpeciesById('pterophyllum-altum', lang).variantOf, undefined, 'Eigene Art ist keine Unterart von P. scalare');
    for (const item of getPlantCatalog(lang).plants) if (item.variantOf) assert.ok(getPlantCatalog(lang).plants.some(parent => parent.id === item.variantOf));
  }
});

test('Varianten: fehlende Eltern, Wasserwechsel und Zyklen nicht stillschweigend verbergen', () => {
  const base = { id: 'parent', name: 'Parent', waterType: 'fresh' };
  assert.throws(() => groupCatalogMatches([{ ...base, variantOf: 'missing' }]), /Invalid/);
  assert.throws(() => inheritCatalogVariants([{ ...base, variantOf: 'child' }, { id: 'child', variantOf: 'parent' }]), /Cyclic/);
  assert.throws(() => groupCatalogMatches([base, { id: 'child', name: 'Child', waterType: 'salt', variantOf: 'parent' }]), /Invalid/);
});

test('Varianten-API: Suche und Details liefern auswählbare IDs, vorhandene Varianten bleiben direkt erreichbar', async t => {
  const env = createTestEnvironment();t.after(() => env.cleanup());
  const user = await env.createUserAndLogin('variant_api');const headers = { Cookie: user.cookie };
  for (const lang of ['de', 'en']) {
    const local = { ...headers, 'X-Language': lang };
    for (const paged of ['', '&limit=1']) {
      const result = await env.request('/api/species?q=L144' + paged, { headers: local });
      assert.equal(result.status, 200);assert.equal(result.data.species.length, 1);assert.equal(result.data.species[0].id, 'ancistrus-sp');
      assert.ok(result.data.species[0].variants.some(item => item.id === 'ancistrus-sp-l144'));
      assert.ok(result.data.species[0].matchedVariants.some(name => name.includes('L144')));
    }
    const root = await env.request('/api/species/trichopodus-trichopterus', { headers: local });
    assert.ok(root.data.species.variants.some(item => item.id === 'trichopodus-trichopterus-gold'));
    assert.equal((await env.request('/api/species/trichopodus-trichopterus-gold', { headers: local })).data.species.id, 'trichopodus-trichopterus-gold');
    const plant = await env.request('/api/plants?q=Pangolino&limit=1', { headers: local });
    assert.ok(plant.data.plants[0].matchedVariants.some(name => name.includes('Pangolino')));
    assert.equal(plant.data.total, 1);assert.equal(plant.data.plants[0].id, 'anubias-barteri-species');
    assert.ok(plant.data.plants[0].variants.some(item => item.id === 'anubias-nana-pangolino'));
    const leaf = await env.request('/api/plants/anubias-nana-pangolino', { headers: local });
    assert.equal(leaf.data.plant.id, 'anubias-nana-pangolino');assert.equal(leaf.data.plant.variantOf, 'anubias-barteri-species');
  }
});
