'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Frontend Multithreading & Web Worker Modul', async (t) => {
  const workerClientPath = path.resolve(__dirname, '../public/js/worker-client.js');
  const workerScriptPath = path.resolve(__dirname, '../public/worker.js');

  await t.test('Worker-Quelldateien existieren und sind syntaktisch valide', () => {
    assert.ok(fs.existsSync(workerClientPath), 'public/js/worker-client.js existiert');
    assert.ok(fs.existsSync(workerScriptPath), 'public/worker.js existiert');

    const workerClientCode = fs.readFileSync(workerClientPath, 'utf8');
    const workerScriptCode = fs.readFileSync(workerScriptPath, 'utf8');

    assert.ok(workerClientCode.includes('runWorkerTask'), 'worker-client.js exportiert runWorkerTask');
    assert.ok(workerClientCode.includes('parseCsvInWorker'), 'worker-client.js exportiert parseCsvInWorker');
    assert.ok(workerClientCode.includes('searchSpeciesInWorker'), 'worker-client.js exportiert searchSpeciesInWorker');
    assert.ok(workerClientCode.includes('checkCompatibilityInWorker'), 'worker-client.js exportiert checkCompatibilityInWorker');
    assert.ok(workerClientCode.includes('computeStatsInWorker'), 'worker-client.js exportiert computeStatsInWorker');
    assert.ok(workerClientCode.includes('processImageInWorker'), 'worker-client.js exportiert processImageInWorker');

    assert.ok(workerScriptCode.includes('handleParseCsv'), 'worker.js enthält CSV-Parser');
    assert.ok(workerScriptCode.includes('handleSearchSpecies'), 'worker.js enthält Arten-Suche & Scoring');
    assert.ok(workerScriptCode.includes('handleCheckCompatibility'), 'worker.js enthält Kompatibilitäts-Engine');
    assert.ok(workerScriptCode.includes('handleComputeStats'), 'worker.js enthält Messwert-Statistik-Engine');
    assert.ok(workerScriptCode.includes('handleProcessImage'), 'worker.js enthält OffscreenCanvas-Bildverarbeitung');
  });

  await t.test('Worker Task: PARSE_CSV & PARSE_FULL_CSV (Trennzeichenerkennung, Spalten-Automapping & Datumsformate)', async () => {
    const workerClient = await import('../public/js/worker-client.js');

    const csvSample = `Messdatum;pH-Wert;Temperatur;Nitrit (NO2);Notiz
10.10.2026;7,2;25,5;0,02;Alles in Ordnung
11.10.2026;7,1;25,4;0,01;Nach Wasserwechsel`;

    const parsedHeader = await workerClient.parseCsvInWorker(csvSample);
    assert.equal(parsedHeader.delimiter, ';');
    assert.equal(parsedHeader.headers.length, 5);
    assert.equal(parsedHeader.totalDataRows, 2);
    assert.equal(parsedHeader.autoMapping[0], 'date');
    assert.equal(parsedHeader.autoMapping[1], 'ph');
    assert.equal(parsedHeader.autoMapping[2], 'temp');
    assert.equal(parsedHeader.autoMapping[3], 'no2');
    assert.equal(parsedHeader.autoMapping[4], 'note');

    const parsedFull = await workerClient.parseFullCsvInWorker(csvSample, ';', {
      0: 'date',
      1: 'ph',
      2: 'temp',
      3: 'no2',
      4: 'note',
    });

    assert.equal(parsedFull.count, 2);
    assert.equal(parsedFull.measurements[0].values.ph, 7.2);
    assert.equal(parsedFull.measurements[0].values.temp, 25.5);
    assert.equal(parsedFull.measurements[0].values.no2, 0.02);
    assert.equal(parsedFull.measurements[0].note, 'Alles in Ordnung');
    assert.ok(parsedFull.measurements[0].measured_at.startsWith('2026-10-10'));
  });

  await t.test('Worker Task: SEARCH_SPECIES (Performante Volltextsuche & Filterung im Hintergrund)', async () => {
    const workerClient = await import('../public/js/worker-client.js');

    const mockSpecies = [
      {
        id: 'neon',
        name: 'Roter Neon',
        scientificName: 'Paracheirodon axelrodi',
        category: 'Salmler',
        waterType: 'fresh',
        tags: ['schooling', 'peaceful'],
        description: 'Beliebter friedlicher Schwarmfisch',
      },
      {
        id: 'betta',
        name: 'Siamesischer Kampffisch',
        scientificName: 'Betta splendens',
        category: 'Labyrinthfische',
        waterType: 'fresh',
        tags: ['solitary_betta', 'carnivore'],
        description: 'Prachtvoller Labyrinthfisch für Einzelhaltung',
      },
      {
        id: 'clown',
        name: 'Falscher Clownfisch',
        scientificName: 'Amphiprion ocellaris',
        category: 'Rifffische',
        waterType: 'salt',
        tags: ['anemone'],
        description: 'Bekannter Nemo Anemonenfisch',
      },
    ];

    // Suche nach "Neon"
    const searchRes = await workerClient.searchSpeciesInWorker(mockSpecies, 'Neon', 'all', 'Alle');
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].name, 'Roter Neon');

    // Filter nach Meerwasser
    const saltRes = await workerClient.searchSpeciesInWorker(mockSpecies, '', 'salt', 'Alle');
    assert.equal(saltRes.length, 1);
    assert.equal(saltRes[0].name, 'Falscher Clownfisch');

    // Filter nach Kategorie
    const catRes = await workerClient.searchSpeciesInWorker(mockSpecies, '', 'all', 'Labyrinthfische');
    assert.equal(catRes.length, 1);
    assert.equal(catRes[0].name, 'Siamesischer Kampffisch');
  });

  await t.test('Worker Task: CHECK_COMPATIBILITY (Besatz- und Verhaltensanalyse)', async () => {
    const workerClient = await import('../public/js/worker-client.js');

    const aquarium = { id: 1, name: 'Nano Becken', volume_liters: 30 };
    const speciesCatalog = [
      {
        id: 'betta',
        name: 'Siamesischer Kampffisch',
        minVolumeL: 30,
        socialType: 'solitary',
        tags: ['solitary_betta', 'long_fins'],
        temp: { min: 24, max: 30 },
        ph: { min: 6.0, max: 7.5 },
      },
      {
        id: 'barb',
        name: 'Sumatrabarbe',
        minVolumeL: 100,
        socialType: 'school',
        minGroupCount: 8,
        tags: ['fin_nipper'],
        temp: { min: 22, max: 26 },
        ph: { min: 6.0, max: 8.0 },
      },
    ];

    const stocking = [
      { species: 'Siamesischer Kampffisch', count: 2 }, // Fehler: Mehrere Kampffische
      { species: 'Sumatrabarbe', count: 3 }, // Warnung: Mindestvolumen 100L vs 30L & Schwarmgröße < 8 & Flossenbeißer
    ];

    const report = await workerClient.checkCompatibilityInWorker(aquarium, speciesCatalog, stocking);

    assert.ok(report.issues.some((i) => i.type === 'betta_solitary'), 'Erkennt Kampffisch-Einzelhaltungs-Konflikt');
    assert.ok(report.warnings.some((w) => w.type === 'min_volume'), 'Erkennt Mindestbeckengrößen-Unterschreitung');
    assert.ok(report.warnings.some((w) => w.type === 'school_size'), 'Erkennt zu kleine Schwarmgröße');
    assert.ok(report.warnings.some((w) => w.type === 'fin_nipping'), 'Erkennt Flossenbeißer-Gefahr');
    assert.ok(report.overlaps.temp, 'Berechnet Temperatur-Schnittmenge');
  });

  await t.test('Worker Task: COMPUTE_STATS (Zeitreihen & statistische Kennzahlen)', async () => {
    const workerClient = await import('../public/js/worker-client.js');

    const measurements = [
      { measured_at: '2026-10-01T10:00:00Z', values: { ph: 7.0, temp: 25.0 } },
      { measured_at: '2026-10-02T10:00:00Z', values: { ph: 7.2, temp: 25.2 } },
      { measured_at: '2026-10-03T10:00:00Z', values: { ph: 7.4, temp: 25.5 } },
    ];

    const parameters = [
      { key: 'ph', name: 'pH-Wert', step: 0.1 },
      { key: 'temp', name: 'Temperatur', step: 0.5 },
    ];

    const thresholds = {
      ph: { okMin: 6.5, okMax: 7.5, warnMin: 6.0, warnMax: 8.0, critMin: 5.5, critMax: 8.5 },
      temp: { okMin: 24.0, okMax: 26.0 },
    };

    const result = await workerClient.computeStatsInWorker(measurements, parameters, thresholds);

    assert.ok(result.stats.ph, 'Statistik für pH vorhanden');
    assert.equal(result.stats.ph.min, 7.0);
    assert.equal(result.stats.ph.max, 7.4);
    assert.equal(result.stats.ph.avg, 7.2);
    assert.equal(result.stats.ph.latest, 7.4);
    assert.equal(result.stats.ph.trend, 'rising');
    assert.equal(result.stats.ph.okCount, 3);
    assert.equal(result.series.ph.length, 3);
  });
});
