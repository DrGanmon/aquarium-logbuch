'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');
const speciesService = require('../dist/backend/src/services/species-service');

test('Artenkatalog & Besatz-Kompatibilität', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('fishkeeper', 'password123');

  await t.test('Species-Service: Lädt Artenkataloge und normalisiert Daten', () => {
    const all = speciesService.getAllSpecies();
    assert.ok(all.length >= 20, 'Mindestens 20 gängige Arten müssen geladen sein');

    // Kampffisch prüfen
    const betta = speciesService.getSpeciesById('betta-splendens');
    assert.ok(betta, 'Siamesischer Kampffisch muss vorhanden sein');
    assert.strictEqual(betta.scientificName, 'Betta splendens');
    assert.strictEqual(betta.category, 'Labyrinthfische');
    assert.strictEqual(betta.waterType, 'fresh');
    assert.strictEqual(betta.socialType, 'solitary');
    assert.strictEqual(betta.territorial, 'solitary_aggressive');
    assert.ok(betta.tags.includes('solitary_betta'));
    assert.ok(betta.tags.includes('long_fins'));
    assert.strictEqual(betta.minVolumeL, 30);

    // Sumatrabarbe (Flossenbeißer) prüfen
    const barb = speciesService.findSpeciesByName('Sumatrabarbe');
    assert.ok(barb);
    assert.ok(barb.tags.includes('fin_nipper'));

    // Skalar (Raubfisch / Hohe Becken) prüfen
    const angel = speciesService.findSpeciesByName('Skalar');
    assert.ok(angel);
    assert.ok(angel.tags.includes('predator_small_prey'));
    assert.strictEqual(angel.minVolumeL, 200);

    // Zwerggarnele prüfen
    const shrimp = speciesService.findSpeciesByName('Red Fire');
    assert.ok(shrimp);
    assert.ok(shrimp.tags.includes('dwarf_shrimp'));
    assert.strictEqual(shrimp.profile, 'garnelen');

    // Meerwasser: Clownfisch prüfen
    const clown = speciesService.findSpeciesByName('Amphiprion ocellaris');
    assert.ok(clown);
    assert.strictEqual(clown.waterType, 'salt');

    // Kategorien
    const cats = speciesService.getCategories();
    assert.ok(cats.includes('Labyrinthfische'));
    assert.ok(cats.includes('Salmler'));
    assert.ok(cats.includes('Lebendgebärende'));
    assert.ok(cats.includes('Buntbarsche'));
    assert.ok(cats.includes('Wirbellose'));
    assert.ok(cats.includes('Meerwasser'));
  });

  await t.test('Kompatibilitäts-Engine: Kampffisch-Regeln (Territorialverhalten & Flossenbeißer)', () => {
    const nanoTank = { id: 1, volume_l: 30, water_type: 'fresh' };

    // 1. Mehrere Kampffische in einem Becken -> Kritischer Konflikt
    const multiBetta = speciesService.analyzeStockCompatibility(nanoTank, [
      { species: 'Siamesischer Kampffisch', count: 2, profile: 'weichwasser' },
    ]);
    assert.strictEqual(multiBetta.isCompatible, false);
    assert.ok(multiBetta.issues.some((i) => i.type === 'betta_multiple_solitary'));

    // 2. Ein einzelner Kampffisch im 30L Becken -> Kompatibel
    const singleBetta = speciesService.analyzeStockCompatibility(nanoTank, [
      { species: 'Siamesischer Kampffisch', count: 1, profile: 'weichwasser' },
    ]);
    assert.strictEqual(singleBetta.isCompatible, true);
    assert.strictEqual(singleBetta.issues.length, 0);

    // 3. Kampffisch + Sumatrabarben (Flossenbeißer) -> Kritischer Konflikt
    const bettaAndBarbs = speciesService.analyzeStockCompatibility(nanoTank, [
      { species: 'Siamesischer Kampffisch', count: 1, profile: 'weichwasser' },
      { species: 'Sumatrabarbe', count: 10, profile: 'allgemein' },
    ]);
    assert.strictEqual(bettaAndBarbs.isCompatible, false);
    assert.ok(bettaAndBarbs.issues.some((i) => i.type === 'betta_fin_nipper_conflict'));

    // 4. Kampffisch + Guppys mit Schleierflossen -> Warnung vor Rivalität
    const bettaAndGuppy = speciesService.analyzeStockCompatibility(nanoTank, [
      { species: 'Siamesischer Kampffisch', count: 1, profile: 'weichwasser' },
      { species: 'Guppy', count: 5, profile: 'hartwasser' },
    ]);
    assert.ok(bettaAndGuppy.warnings.some((w) => w.type === 'betta_guppy_rivalry'));
  });

  await t.test('Kompatibilitäts-Engine: Beckengröße, Schwarmgrößen und Räuber-Beute', () => {
    const smallTank = { id: 2, volume_l: 54, water_type: 'fresh' };

    // 1. Skalar im 54L Becken (braucht 200L) -> Beckengrößen-Warnung
    const smallAngel = speciesService.analyzeStockCompatibility(smallTank, [
      { species: 'Skalar', count: 2, profile: 'weichwasser' },
    ]);
    assert.ok(smallAngel.warnings.some((w) => w.type === 'tank_size_too_small'));

    // 2. Neonsalmler nur 2 Stück (Schwarmfisch mind. 10) -> Schwarmgrößen-Warnung
    const smallSchool = speciesService.analyzeStockCompatibility(smallTank, [
      { species: 'Neonsalmler', count: 2, profile: 'weichwasser' },
    ]);
    assert.ok(smallSchool.warnings.some((w) => w.type === 'school_too_small'));

    // 3. Skalar + Red Fire Zwerggarnelen -> Räuber-Beute-Warnung
    const predatorPrey = speciesService.analyzeStockCompatibility({ id: 3, volume_l: 250, water_type: 'fresh' }, [
      { species: 'Skalar', count: 2, profile: 'weichwasser' },
      { species: 'Red Fire / Neocaridina Zwerggarnele', count: 20, profile: 'garnelen' },
    ]);
    assert.ok(predatorPrey.warnings.some((w) => w.type === 'predator_dwarf_shrimp'));

    // 4. Raubschnecke Helena + Rennschnecke -> Schneckenfresser-Warnung
    const snailEater = speciesService.analyzeStockCompatibility(smallTank, [
      { species: 'Raubturmdeckelschnecke (Helena)', count: 2, profile: 'allgemein' },
      { species: 'Zebra-Rennschnecke', count: 2, profile: 'allgemein' },
    ]);
    assert.ok(snailEater.warnings.some((w) => w.type === 'snail_eater_conflict'));
  });

  await t.test('Kompatibilitäts-Engine: Kaltwasser vs. Warmwasser und Malawi vs. Weichwasser', () => {
    // 1. Kardinalfisch (Kaltwasser max 22°C) vs Diskusfisch (min 28°C) -> Temperatur-Konflikt
    const tempConflict = speciesService.analyzeStockCompatibility({ id: 4, volume_l: 350, water_type: 'fresh' }, [
      { species: 'Kardinalfisch', count: 10, profile: 'allgemein' },
      { species: 'Diskusfisch', count: 5, profile: 'weichwasser' },
    ]);
    assert.strictEqual(tempConflict.isCompatible, false);
    assert.ok(tempConflict.issues.some((i) => i.type === 'temperature_range_conflict'));

    // 2. Malawi-Buntbarsch vs Roter Neon -> Biotop- & Wasserwertkonflikt
    const malawiConflict = speciesService.analyzeStockCompatibility({ id: 5, volume_l: 300, water_type: 'fresh' }, [
      { species: "Malawi-Buntbarsch 'Yellow'", count: 4, profile: 'hartwasser' },
      { species: 'Roter Neon', count: 20, profile: 'weichwasser' },
    ]);
    assert.strictEqual(malawiConflict.isCompatible, false);
    assert.ok(malawiConflict.issues.some((i) => i.type === 'rift_lake_weichwasser_conflict'));
  });

  await t.test('API: /api/species und /api/species/:id Endpunkte', async () => {
    // 1. Alle Arten abrufen
    const listRes = await env.request('/api/species', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data.species));
    assert.ok(listRes.data.species.length >= 20);

    // 2. Filter nach Wassertyp (Meerwasser)
    const saltRes = await env.request('/api/species?water_type=salt', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(saltRes.status, 200);
    assert.ok(saltRes.data.species.length > 0);
    assert.ok(saltRes.data.species.every((s) => s.waterType === 'salt'));

    // 3. Filter nach Kategorie
    const catRes = await env.request('/api/species?category=Labyrinthfische', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(catRes.status, 200);
    assert.ok(catRes.data.species.some((s) => s.id === 'betta-splendens'));

    // 4. Suchbegriff "Kampffisch"
    const searchRes = await env.request('/api/species?q=Kampffisch', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.data.species[0].id, 'betta-splendens');

    // 5. Einzelne Art nach ID abrufen
    const singleRes = await env.request('/api/species/betta-splendens', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(singleRes.status, 200);
    assert.strictEqual(singleRes.data.species.name, 'Siamesischer Kampffisch');
    assert.ok(singleRes.data.species.temp.min >= 20);

    // 6. Nicht existente Art -> 404
    const notFound = await env.request('/api/species/nicht-existent-12345', {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(notFound.status, 404);
  });

  await t.test('Integration: Aquarium Details (/api/aquariums/:id) liefert stockCompatibility & Arten-Metadaten', async () => {
    // Aquarium anlegen
    const createRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { name: 'Kampffisch Nano 30L', volume_l: 30, water_type: 'fresh' },
    });
    assert.strictEqual(createRes.status, 200);
    const aqId = createRes.data.id;

    // Kampffisch eintragen
    const addStock1 = await env.request(`/api/aquariums/${aqId}/stock`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { species: 'Siamesischer Kampffisch', count: 1 },
    });
    assert.strictEqual(addStock1.status, 200);

    // Details abrufen
    const detailRes1 = await env.request(`/api/aquariums/${aqId}`, {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(detailRes1.status, 200);
    assert.strictEqual(detailRes1.data.stock.length, 1);
    assert.strictEqual(detailRes1.data.stock[0].species, 'Siamesischer Kampffisch');
    assert.strictEqual(detailRes1.data.stock[0].scientificName, 'Betta splendens');
    assert.strictEqual(detailRes1.data.stock[0].socialType, 'solitary');
    assert.ok(detailRes1.data.stockCompatibility);
    assert.strictEqual(detailRes1.data.stockCompatibility.isCompatible, true);

    // Jetzt einen zweiten Kampffisch hinzufügen -> Konflikt
    await env.request(`/api/aquariums/${aqId}/stock`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { species: 'Siamesischer Kampffisch', count: 1 },
    });

    const detailRes2 = await env.request(`/api/aquariums/${aqId}`, {
      headers: { Cookie: user.cookie },
    });
    assert.strictEqual(detailRes2.status, 200);
    assert.strictEqual(detailRes2.data.stockCompatibility.isCompatible, false);
    assert.ok(detailRes2.data.stockCompatibility.issues.some((i) => i.type === 'betta_multiple_solitary'));
  });
});
