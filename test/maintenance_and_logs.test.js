'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Pflegearbeiten, Wasserwechsel & Logbuch-Timeline', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const owner = await env.createUserAndLogin('owner_user', 'password123', 'owner@test.local');
  const writer = await env.createUserAndLogin('writer_user', 'password123', 'writer@test.local');
  const viewer = await env.createUserAndLogin('viewer_user', 'password123', 'viewer@test.local');
  const stranger = await env.createUserAndLogin('stranger_user', 'password123', 'stranger@test.local');

  // 1. Aquarium durch Owner anlegen
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { name: 'Pflanzenparadies', water_type: 'fresh', volume_l: 180 },
  });
  assert.strictEqual(createAq.status, 200);
  const aqId = createAq.data.id;

  // Freigaben für Writer (write) und Viewer (view) einrichten und annehmen
  await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { username: 'writer_user', role: 'write' },
  });
  await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: writer.cookie },
    body: { aquarium_id: aqId },
  });

  await env.request(`/api/aquariums/${aqId}/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { username: 'viewer_user', role: 'view' },
  });
  await env.request('/api/shares/accept', {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { aquarium_id: aqId },
  });

  // 2. Pflegemaßnahmen & Arbeiten eintragen (Wasserwechsel, Filter, Pflanzen, Pflege)
  // a) Wasserwechsel 50% mit Details
  const wwRes = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: {
      type: 'water_change',
      percentage: 50,
      details: 'Osmosewasser 50:50 mit Leitungswasser verschnitten',
      note: 'Filtervlies grob gereinigt',
      logged_at: '2026-10-01T10:00:00.000Z',
    },
  });
  assert.strictEqual(wwRes.status, 200);
  assert.strictEqual(wwRes.data.ok, true);
  const wwId = wwRes.data.id;

  // b) Filterwechsel (Filtermedien tauschen) durch Writer
  const filterRes = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: writer.cookie },
    body: {
      type: 'filter_change',
      details: 'Filtervlies und Aktivkohlepad erneuert',
      note: 'Wasserdurchfluss wieder optimal',
      logged_at: '2026-10-03T14:30:00.000Z',
    },
  });
  assert.strictEqual(filterRes.status, 200);
  const filterId = filterRes.data.id;

  // c) Pflanzen schneiden
  const cutRes = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: {
      type: 'plants_cut',
      details: 'Rotala rotundifolia und Hornkraut um 10 cm gekürzt',
      logged_at: '2026-10-05T09:15:00.000Z',
    },
  });
  assert.strictEqual(cutRes.status, 200);

  // d) Neue Pflanzen
  const plantRes = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: {
      type: 'plants_new',
      details: '3x Anubias barteri nana auf Lavastein aufgebunden',
      note: 'Vordergrund links platziert',
      logged_at: '2026-10-06T16:00:00.000Z',
    },
  });
  assert.strictEqual(plantRes.status, 200);

  // e) Messung eintragen
  const measRes = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: {
      measured_at: '2026-10-07T11:00:00.000Z',
      values: { ph: 6.8, temp: 25.0, no2: 0.02, no3: 15 },
      note: 'Wasserwerte nach dem Gärtnern stabil',
    },
  });
  assert.strictEqual(measRes.status, 200);
  const measId = measRes.data.id;

  // 3. Validierungsprüfungen
  // Ungültiger Typ
  const invalidType = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { type: 'unbekannter_typ' },
  });
  assert.strictEqual(invalidType.status, 400);

  // Ungültiger Prozentwert (> 100 oder < 1)
  const invalidPercent = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { type: 'water_change', percentage: 150 },
  });
  assert.strictEqual(invalidPercent.status, 400);

  // Datum in der Zukunft
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const invalidDate = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: { type: 'care', logged_at: futureDate },
  });
  assert.strictEqual(invalidDate.status, 400);

  // 4. Wartungseinträge abrufen
  const maintList = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(maintList.status, 200);
  assert.strictEqual(maintList.data.length, 4);
  assert.strictEqual(maintList.data[0].type, 'plants_new'); // Neuestes Datum zuerst

  // 5. Gesamtes Aquarium-Logbuch / Timeline prüfen (inkl. Messung & Pflegen)
  const timelineRes = await env.request(`/api/aquariums/${aqId}/logs`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(timelineRes.status, 200);
  const timeline = timelineRes.data;
  assert.strictEqual(timeline.length, 5); // 4 Arbeiten + 1 Messung

  // Chronologische Reihenfolge: 2026-10-07 (Messung), 2026-10-06 (Neue Pflanzen), 2026-10-05 (Pflanzen schneiden), 2026-10-03 (Filter), 2026-10-01 (Wasserwechsel)
  assert.strictEqual(timeline[0].kind, 'measurement');
  assert.strictEqual(timeline[0].id, measId);
  assert.strictEqual(timeline[0].values.ph, 6.8);

  assert.strictEqual(timeline[1].kind, 'maintenance');
  assert.strictEqual(timeline[1].type, 'plants_new');
  assert.ok(timeline[1].details.includes('Anubias'));

  assert.strictEqual(timeline[2].type, 'plants_cut');
  assert.strictEqual(timeline[3].type, 'filter_change');
  assert.strictEqual(timeline[3].created_by_username, 'writer_user');

  assert.strictEqual(timeline[4].type, 'water_change');
  assert.strictEqual(timeline[4].percentage, 50);

  // Gefilterte Log-Abfragen testen
  const onlyWW = await env.request(`/api/aquariums/${aqId}/logs?kind=water_change`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(onlyWW.status, 200);
  assert.strictEqual(onlyWW.data.length, 1);
  assert.strictEqual(onlyWW.data[0].type, 'water_change');

  const onlyMeas = await env.request(`/api/aquariums/${aqId}/logs?kind=measurement`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(onlyMeas.status, 200);
  assert.strictEqual(onlyMeas.data.length, 1);
  assert.strictEqual(onlyMeas.data[0].kind, 'measurement');

  // 6. Aquarium-Summary enthält letzten Wasserwechsel & Wartung
  const aqDetail = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(aqDetail.status, 200);
  assert.strictEqual(aqDetail.data.aquarium.last_water_change_percent, 50);
  assert.strictEqual(aqDetail.data.aquarium.last_maintenance_type, 'plants_new');

  // 7. Eintrag bearbeiten (PUT)
  const updateRes = await env.request(`/api/aquariums/${aqId}/maintenance/${wwId}`, {
    method: 'PUT',
    headers: { Cookie: writer.cookie },
    body: {
      type: 'water_change',
      percentage: 60,
      details: '60% Wasserwechsel mit Osmosewasser durchgeführt',
      note: 'Düngung im Anschluss zugegeben',
      logged_at: '2026-10-01T10:00:00.000Z',
    },
  });
  assert.strictEqual(updateRes.status, 200);

  const getUpdated = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    headers: { Cookie: owner.cookie },
  });
  const updatedItem = getUpdated.data.find((it) => it.id === wwId);
  assert.strictEqual(updatedItem.percentage, 60);
  assert.strictEqual(updatedItem.details, '60% Wasserwechsel mit Osmosewasser durchgeführt');

  // 8. Eintrag löschen (DELETE)
  const delRes = await env.request(`/api/aquariums/${aqId}/maintenance/${filterId}`, {
    method: 'DELETE',
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(delRes.status, 200);

  const afterDel = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    headers: { Cookie: owner.cookie },
  });
  assert.strictEqual(afterDel.data.length, 3);
  assert.ok(!afterDel.data.some((it) => it.id === filterId));

  // 9. Berechtigungsprüfungen (Permissions & IDOR Isolation)
  // a) Viewer darf lesen (200 OK)
  const viewLogs = await env.request(`/api/aquariums/${aqId}/logs`, {
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(viewLogs.status, 200);

  // b) Viewer darf NICHT anlegen, bearbeiten oder löschen (403 Forbidden)
  const viewPost = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: viewer.cookie },
    body: { type: 'care', details: 'Versuch als Viewer' },
  });
  assert.strictEqual(viewPost.status, 403);

  const viewPut = await env.request(`/api/aquariums/${aqId}/maintenance/${wwId}`, {
    method: 'PUT',
    headers: { Cookie: viewer.cookie },
    body: { type: 'water_change', percentage: 20 },
  });
  assert.strictEqual(viewPut.status, 403);

  const viewDel = await env.request(`/api/aquariums/${aqId}/maintenance/${wwId}`, {
    method: 'DELETE',
    headers: { Cookie: viewer.cookie },
  });
  assert.strictEqual(viewDel.status, 403);

  // c) Fremder Nutzer (Stranger) erhält 404 (IDOR-Schutz)
  const strangerGet = await env.request(`/api/aquariums/${aqId}/logs`, {
    headers: { Cookie: stranger.cookie },
  });
  assert.strictEqual(strangerGet.status, 404);

  const strangerPost = await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: stranger.cookie },
    body: { type: 'care' },
  });
  assert.strictEqual(strangerPost.status, 404);

  const strangerPut = await env.request(`/api/aquariums/${aqId}/maintenance/${wwId}`, {
    method: 'PUT',
    headers: { Cookie: stranger.cookie },
    body: { type: 'water_change', percentage: 30 },
  });
  assert.strictEqual(strangerPut.status, 404);

  const strangerDel = await env.request(`/api/aquariums/${aqId}/maintenance/${wwId}`, {
    method: 'DELETE',
    headers: { Cookie: stranger.cookie },
  });
  assert.strictEqual(strangerDel.status, 404);

  // d) Unauthentifizierter Zugriff -> 401
  const unauthGet = await env.request(`/api/aquariums/${aqId}/logs`);
  assert.strictEqual(unauthGet.status, 401);
});
