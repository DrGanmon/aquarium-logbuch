'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SpeciesCatalog } = require('../dist/backend/src/services/species-service');

test('Artenkatalog: Sprachcaches, ID-Aliase und Kategorien bleiben nach Neuladen korrekt', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-species-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'catalog.json');
  function write(name, category) {
    fs.writeFileSync(file, JSON.stringify({ id: 'test', species: [{ id: 'symphysodon-sp', name, name_en: `English ${name}`, category, category_en: `English ${category}`, waterType: 'fresh' }] }));
  }
  write('Erste Art', 'Gruppe A');
  const catalog = new SpeciesCatalog(dir, path.join(dir, 'custom'));
  assert.equal(catalog.getSpeciesById('symphysodon-spp').name, 'Erste Art');
  assert.equal(catalog.getSpeciesById('symphysodon-sp', 'en').name, 'English Erste Art');
  const list = catalog.getAllSpecies();list.pop();
  const categories = catalog.getCategories();categories.pop();
  assert.equal(catalog.getAllSpecies().length, 1);assert.deepEqual(catalog.getCategories(), ['Gruppe A']);
  write('Geänderte Art', 'Gruppe B');catalog.load(true);
  assert.equal(catalog.getSpeciesById('symphysodon-sp').name, 'Geänderte Art');
  assert.equal(catalog.getSpeciesById('symphysodon-sp', 'en').name, 'English Geänderte Art');
  assert.deepEqual(catalog.getCategories(), ['Gruppe B']);
});
