'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const service = require('../dist/backend/src/services/species-service');
const cfg = require('../dist/backend/config.js');

test('Erweiterte Kataloge enthalten eindeutige IDs und behalten bisherige Arten', () => {
  const catalogs = ['freshwater-popular', 'cichlids', 'invertebrates', 'saltwater'];
  const entries = catalogs.flatMap((name) => JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/species', `${name}.json`))).species);
  assert.equal(entries.length, 147);
  assert.equal(new Set(entries.map((s) => s.id)).size, entries.length);
  const oldEntries = ['betta-splendens', 'pterophyllum-scalare', 'symphysodon-sp', 'neocaridina-davidi', 'amphiprion-ocellaris'];
  for (const id of oldEntries) assert.ok(service.getSpeciesById(id), id);
  assert.equal(service.getSpeciesById('symphysodon-spp').id, 'symphysodon-sp');
  assert.equal(service.findSpeciesByName('symphysodon-spp').id, 'symphysodon-sp');
});

test('Sulawesi-Werte ersetzen ungeeignete allgemeine Grundwerte und erkennen Profilkonflikte', () => {
  assert.equal(service.getSpeciesById('caridina-dennerli').profile, 'sulawesi');
  const { thresholds, conflicts } = cfg.thresholdsFor('fresh', ['sulawesi']);
  assert.equal(thresholds.temp.okMin, 27);
  assert.equal(thresholds.temp.okMax, 29);
  assert.equal(cfg.evaluate(thresholds.temp, 28), 'ok');
  assert.equal(cfg.evaluate(thresholds.ph, 8), 'ok');
  assert.deepEqual(conflicts, []);
  assert.ok(cfg.thresholdsFor('fresh', ['sulawesi', 'weichwasser']).conflicts.includes('ph'));
});

test('Neue Garnelenjäger-Tags und Haltungshinweise werden ausgewertet', () => {
  const predators = service.getAllSpecies().filter((s) => s.tags.includes('shrimp_predator') || s.tags.includes('aggressive_to_shrimp'));
  assert.ok(predators.length > 0);
  for (const predator of predators) {
    const result = service.analyzeStockCompatibility({ water_type: predator.waterType, volume_l: 1000 }, [
      { species: predator.id, count: 1 }, { species: 'neocaridina-davidi', count: 20 },
    ]);
    assert.ok(result.warnings.some((w) => w.type === 'predator_dwarf_shrimp'), predator.id);
  }
  const stock = [{ species: 'caridina-multidentata', count: 10 }];
  const de = service.analyzeStockCompatibility({ water_type: 'fresh', volume_l: 100 }, stock);
  const en = service.analyzeStockCompatibility({ water_type: 'fresh', volume_l: 100 }, stock, 'en');
  assert.ok(de.decorHints.some((h) => h.includes('Nachzucht')));
  assert.ok(en.decorHints.some((h) => h.includes('breeding cycle')));
  const oscar = service.analyzeStockCompatibility({ water_type: 'fresh', volume_l: 1000 }, [{ species: 'astronotus-ocellatus', count: 2 }]);
  assert.ok(!oscar.issues.some((i) => i.type === 'betta_multiple_solitary'));
});

test('Optionale Salinität bleibt in ‰ erhalten und wird bei fehlenden Angaben nicht ergänzt', () => {
  const raw = service.loadSpecies().rawList;
  raw.push({ id: 'test-salinity', waterType: 'salt', salinity: { min: 33, max: 35, idealMin: 34, idealMax: 35 } });
  try {
    assert.deepEqual(service.getSpeciesById('test-salinity').salinity, { min: 33, max: 35, idealMin: 34, idealMax: 35 });
    assert.equal(service.getSpeciesById('amphiprion-ocellaris').salinity, null);
  } finally {
    raw.pop();
  }
});

test('Dubletten übernehmen neue Popular-Werte und behalten ergänzende Cichliden-Tags', () => {
  const krib = service.getSpeciesById('pelvicachromis-pulcher');
  assert.deepEqual(krib.gh, { min: 2, max: 15, idealMin: 4, idealMax: 12 });
  assert.deepEqual(krib.kh, { min: 1, max: 10, idealMin: 2, idealMax: 6 });
  assert.equal(krib.minVolumeL, 100);
  assert.ok(krib.tags.includes('cave_dweller'));
  assert.ok(krib.tags.includes('requires_caves'));
  const yellow = service.getSpeciesById('labidochromis-caeruleus');
  assert.equal(yellow.kh.max, 18);
  assert.equal(yellow.minGroupCount, 5);
  assert.equal(yellow.socialType, 'group');
  assert.ok(yellow.tags.includes('malawi_cichlid'));
  assert.ok(yellow.tags.includes('species_tank_recommended'));
  const cockatoo = service.getSpeciesById('apistogramma-cacatuoides');
  assert.equal(cockatoo.socialType, 'pair');
  assert.equal(cockatoo.minGroupCount, 2);
  const discus = service.getSpeciesById('symphysodon-spp');
  assert.equal(discus.id, 'symphysodon-sp');
  assert.ok(discus.tags.includes('high_temp'));
  assert.ok(discus.tags.includes('high_temp_required'));
});

test('Lokale Artenbilder bleiben eindeutig zugeordnet und behalten Bildnachweise', () => {
  const imageRoot = path.join(__dirname, '../public/species-images');
  const manifest = JSON.parse(fs.readFileSync(path.join(imageRoot, 'manifest.json')));
  const original = JSON.parse(fs.readFileSync(path.join(imageRoot, 'attribution.json')));
  assert.equal(Object.keys(manifest).length, 146);
  for (const [id, image] of Object.entries(manifest)) {
    assert.ok(service.getSpeciesById(id), id);
    assert.deepEqual(service.getSpeciesById(id).image, image);
    assert.ok(image.width <= 768 && image.height <= 768, id);
    const filename = path.join(imageRoot, `${id}.webp`);
    const bytes = fs.readFileSync(filename);
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    const source = original.images.find((item) => item.id === id);
    for (const key of ['author', 'authorUrl', 'license', 'licenseUrl', 'sourceUrl', 'originalSource', 'originalSourceUrl', 'requiredAttribution']) {
      assert.equal(image[key], source[key] || '', `${id}: ${key}`);
    }
    assert.ok(image.modifications.includes('WebP'));
  }
  assert.equal(service.getSpeciesById('nannostomus-beckfordi').image, null);
});
