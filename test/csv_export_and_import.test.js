'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');
const csvService = require('../dist/backend/src/services/measurement-csv-service');

test('CSV-Service: Unit-Tests für Delimiter-Erkennung, Parsing, Datums-/Zahlenkonvertierung und Mapping', async () => {
  // 1. Delimiter-Erkennung
  assert.strictEqual(csvService.detectDelimiter('Datum;pH;KH;GH'), ';');
  assert.strictEqual(csvService.detectDelimiter('Datum,pH,KH,GH'), ',');
  assert.strictEqual(csvService.detectDelimiter('Datum\tpH\tKH\tGH'), '\t');
  assert.strictEqual(csvService.detectDelimiter('Datum|pH|KH|GH'), '|');

  // 2. CSV Parser (RFC 4180 mit Quotes, Escaping und Trennzeichen)
  const sampleCsv = [
    'Datum;pH;Notiz',
    '2026-10-11;7,2;"Alles super, Wasser klar"',
    '2026-10-12;7.4;"Text mit ""Anführungszeichen"""',
  ].join('\r\n');

  const rows = csvService.parseCsv(sampleCsv, { delimiter: ';' });
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], ['Datum', 'pH', 'Notiz']);
  assert.deepStrictEqual(rows[1], ['2026-10-11', '7,2', 'Alles super, Wasser klar']);
  assert.deepStrictEqual(rows[2], ['2026-10-12', '7.4', 'Text mit "Anführungszeichen"']);

  // 3. Datums- und Uhrzeitparser
  const d1 = csvService.parseDate('11.10.2026');
  assert.ok(d1 instanceof Date);
  assert.strictEqual(d1.getFullYear(), 2026);
  assert.strictEqual(d1.getMonth(), 9); // Oktober = Index 9
  assert.strictEqual(d1.getDate(), 11);

  const d2 = csvService.parseDate('11.10.2026', '14:35:20');
  assert.strictEqual(d2.getHours(), 14);
  assert.strictEqual(d2.getMinutes(), 35);
  assert.strictEqual(d2.getSeconds(), 20);

  const d3 = csvService.parseDate('2026-05-18T10:15:00.000Z');
  assert.ok(d3 instanceof Date);
  assert.strictEqual(d3.toISOString(), '2026-05-18T10:15:00.000Z');

  // 4. Zahlenparser (Komma, Punkt, Einheiten, Präfixe)
  assert.strictEqual(csvService.parseNumber('7,2'), 7.2);
  assert.strictEqual(csvService.parseNumber('24.5'), 24.5);
  assert.strictEqual(csvService.parseNumber('< 0.05'), 0.05);
  assert.strictEqual(csvService.parseNumber('25 °C'), 25);
  assert.strictEqual(csvService.parseNumber('1.200,50'), 1200.5);
  assert.strictEqual(csvService.parseNumber('-'), null);
  assert.strictEqual(csvService.parseNumber('n/a'), null);

  // 5. Automatische Zuordnung (Auto-Mapping)
  const headers = ['Messdatum', 'Uhrzeit', 'pH-Wert', 'Karbonathärte', 'Nitrat (NO3)', 'Bemerkungen', 'Unbekannt'];
  const mapping = csvService.autoDetectMapping(headers);
  assert.strictEqual(mapping[0], 'measured_at');
  assert.strictEqual(mapping[1], 'time');
  assert.strictEqual(mapping[2], 'ph');
  assert.strictEqual(mapping[3], 'kh');
  assert.strictEqual(mapping[4], 'no3');
  assert.strictEqual(mapping[5], 'note');
  assert.strictEqual(mapping[6], 'ignore');
});

test('CSV Export & Import: Endpunkte, Zugriffskontrolle, Grenzwerte und Roundtrip', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const userA = await env.createUserAndLogin('csvexpert', 'secret123');
  const userB = await env.createUserAndLogin('otheruser', 'secret123');

  // 1. Aquarium für User A erstellen
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: { name: 'Pflanzenbecken', water_type: 'fresh', volume_l: 180, reminder_days: 7 },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  // 2. CSV-Header parsen (Vorschau-Endpunkt)
  const testCsvContent = [
    'Datum;Uhrzeit;pH-Wert;Karbonathärte;Nitrit;Nitrat;Notiz',
    '10.05.2026;09:30;6,8;4,0;0,01;10,0;Wasserwechsel durchgeführt',
    '17.05.2026;10:15;7,0;4,5;0,02;15,0;Pflanzen gestutzt',
    '24.05.2026;11:00;7,2;5,0;0,50;60,0;Kritischer Peak gemessen',
  ].join('\r\n');

  const previewRes = await env.request(`/api/aquariums/${aqId}/measurements/parse-csv-header`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: { csvText: testCsvContent },
  });
  assert.strictEqual(previewRes.status, 200);
  assert.strictEqual(previewRes.data.delimiter, ';');
  assert.strictEqual(previewRes.data.totalDataRows, 3);
  assert.strictEqual(previewRes.data.headers.length, 7);
  assert.strictEqual(previewRes.data.autoMapping[0], 'measured_at');
  assert.strictEqual(previewRes.data.autoMapping[1], 'time');
  assert.strictEqual(previewRes.data.autoMapping[2], 'ph');
  assert.strictEqual(previewRes.data.autoMapping[3], 'kh');
  assert.strictEqual(previewRes.data.autoMapping[4], 'no2');
  assert.strictEqual(previewRes.data.autoMapping[5], 'no3');
  assert.strictEqual(previewRes.data.autoMapping[6], 'note');

  // 3. CSV-Import ausführen
  const importRes = await env.request(`/api/aquariums/${aqId}/measurements/import-csv`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: {
      csvText: testCsvContent,
      mapping: previewRes.data.autoMapping,
      delimiter: ';',
      hasHeader: true,
    },
  });
  assert.strictEqual(importRes.status, 200);
  assert.strictEqual(importRes.data.ok, true);
  assert.strictEqual(importRes.data.imported, 3, 'Alle 3 Zeilen müssen erfolgreich importiert worden sein');
  assert.strictEqual(importRes.data.skipped, 0);
  assert.ok(importRes.data.alerts > 0, 'Kritische Werte (NO2=0.5, NO3=60) müssen Alarme auslösen');

  // 4. Prüfen, ob die importierten Messwerte in der Datenbank vorhanden sind
  const listRes = await env.request(`/api/aquariums/${aqId}/measurements?all=true`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.data.length, 3);
  assert.strictEqual(listRes.data[0].values.ph, 6.8);
  assert.strictEqual(listRes.data[0].values.kh, 4.0);
  assert.strictEqual(listRes.data[0].note, 'Wasserwechsel durchgeführt');

  // 5. CSV-Export abrufen (Standard Semikolon mit BOM)
  const exportRes = await env.request(`/api/aquariums/${aqId}/measurements/export?all=true&delimiter=;`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(exportRes.status, 200);
  const cd = exportRes.headers.get('content-disposition') || '';
  assert.ok(cd.includes('attachment'));
  assert.ok(cd.includes('.csv'));

  const exportedText = typeof exportRes.data === 'string' ? exportRes.data : JSON.stringify(exportRes.data);
  assert.ok(exportedText.includes('Datum;Uhrzeit;Notiz'));
  assert.ok(exportedText.includes('Wasserwechsel durchgeführt'));
  assert.ok(exportedText.includes('Kritischer Peak gemessen'));

  // 6. Roundtrip: Erstelle ein zweites Aquarium und importiere den exportierten CSV-Text dort
  const aq2Res = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: { name: 'Zweites Becken (Roundtrip)', water_type: 'fresh', volume_l: 120 },
  });
  assert.strictEqual(aq2Res.status, 200);
  const aq2Id = aq2Res.data.id;

  const roundtripPreview = await env.request(`/api/aquariums/${aq2Id}/measurements/parse-csv-header`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: { csvText: exportedText },
  });
  assert.strictEqual(roundtripPreview.status, 200);

  const roundtripImport = await env.request(`/api/aquariums/${aq2Id}/measurements/import-csv`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: {
      csvText: exportedText,
      mapping: roundtripPreview.data.autoMapping,
      delimiter: roundtripPreview.data.delimiter,
      hasHeader: true,
    },
  });
  assert.strictEqual(roundtripImport.status, 200);
  assert.strictEqual(roundtripImport.data.imported, 3);

  const roundtripList = await env.request(`/api/aquariums/${aq2Id}/measurements?all=true`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(roundtripList.status, 200);
  assert.strictEqual(roundtripList.data.length, 3);
  assert.strictEqual(roundtripList.data[0].values.ph, 6.8);

  // 7. Zugriffskontrolle: Fremder User B darf nicht auf fremdes Becken importieren
  const unauthorizedImport = await env.request(`/api/aquariums/${aqId}/measurements/import-csv`, {
    method: 'POST',
    headers: { Cookie: userB.cookie },
    body: {
      csvText: testCsvContent,
      mapping: previewRes.data.autoMapping,
    },
  });
  assert.strictEqual(unauthorizedImport.status, 404, 'Fremder Benutzer ohne Freigabe erhält 404');

  // 8. Fehlerbehandlung: Import ohne Datumszuordnung wird mit Fehler abgewiesen
  const invalidMapping = { 2: 'ph', 3: 'kh' }; // Kein Datum
  const noDateImport = await env.request(`/api/aquariums/${aqId}/measurements/import-csv`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: {
      csvText: testCsvContent,
      mapping: invalidMapping,
    },
  });
  assert.strictEqual(noDateImport.status, 500); // Exception abgefangen
});

test('CSV Export & Import (MongoDB): Endpunkte und Datenpersistenz', async (t) => {
  const env = await createMongoTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('mongocsver', 'pass12345');

  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Mongo Riffbecken', water_type: 'salt', volume_l: 300 },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  const csvData = [
    'Datum,pH,Salinität,Temperatur,Notiz',
    '2026-08-01,8.2,35.0,25.5,Alles stabil',
    '2026-08-08,8.3,35.2,25.6,Korallen wachsen super',
  ].join('\n');

  const previewRes = await env.request(`/api/aquariums/${aqId}/measurements/parse-csv-header`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { csvText: csvData, delimiter: ',' },
  });
  assert.strictEqual(previewRes.status, 200);
  assert.strictEqual(previewRes.data.totalDataRows, 2);

  const importRes = await env.request(`/api/aquariums/${aqId}/measurements/import-csv`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      csvText: csvData,
      mapping: previewRes.data.autoMapping,
      delimiter: ',',
      hasHeader: true,
    },
  });
  assert.strictEqual(importRes.status, 200);
  assert.strictEqual(importRes.data.imported, 2);

  const listRes = await env.request(`/api/aquariums/${aqId}/measurements?all=true`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.data.length, 2);
  assert.strictEqual(listRes.data[0].values.ph, 8.2);

  const exportRes = await env.request(`/api/aquariums/${aqId}/measurements/export?all=true&delimiter=,`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(exportRes.status, 200);
  const text = exportRes.text;
  assert.ok(text.includes('Korallen wachsen super'));
});
