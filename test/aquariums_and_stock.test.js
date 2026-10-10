'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Aquarien & Besatz: CRUD, Validierung und Schwellenwerte', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('aquauser', 'password123');

  // 1. Konfiguration abrufen (/api/config)
  const cfgRes = await env.request('/api/config', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(cfgRes.status, 200);
  assert.ok(Array.isArray(cfgRes.data.parameters));
  assert.ok(cfgRes.data.parameters.some((p) => p.key === 'ph'));
  assert.ok(cfgRes.data.profiles.weichwasser);

  // 2. Aquarium anlegen mit ungültigen Werten
  const badName = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: '', water_type: 'fresh' },
  });
  assert.strictEqual(badName.status, 400);

  const badVol = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Mein Becken', volume_l: -10 },
  });
  assert.strictEqual(badVol.status, 400);

  const badReminder = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Mein Becken', reminder_days: 500 },
  });
  assert.strictEqual(badReminder.status, 400);

  // 3. Gültiges Süßwasser-Aquarium anlegen
  const createRes1 = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Südamerika 240L', water_type: 'fresh', volume_l: 240, reminder_days: 14, notes: 'Amazonas-Becken' },
  });
  assert.strictEqual(createRes1.status, 200);
  const aq1Id = createRes1.data.id;
  assert.ok(aq1Id > 0);

  // Zweites Aquarium (Meerwasser) anlegen
  const createRes2 = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Nano Riff', water_type: 'salt', volume_l: 60, reminder_days: 7 },
  });
  assert.strictEqual(createRes2.status, 200);
  const aq2Id = createRes2.data.id;

  // 4. Liste der Aquarien abrufen
  const listRes = await env.request('/api/aquariums', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.data.length, 2);

  // 5. Details zu Aquarium 1 abrufen
  const detailRes1 = await env.request(`/api/aquariums/${aq1Id}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailRes1.status, 200);
  assert.strictEqual(detailRes1.data.aquarium.name, 'Südamerika 240L');
  assert.strictEqual(detailRes1.data.aquarium.water_type, 'fresh');
  assert.strictEqual(detailRes1.data.aquarium.volume_l, 240);
  assert.deepStrictEqual(detailRes1.data.stock, []);

  // 6. Besatz hinzufügen
  const addStock1 = await env.request(`/api/aquariums/${aq1Id}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { species: 'Roter Neon', count: 20, profile: 'weichwasser' },
  });
  assert.strictEqual(addStock1.status, 200);
  const stock1Id = addStock1.data.id;

  // Ungültiger Besatz (leere Art)
  const badStock = await env.request(`/api/aquariums/${aq1Id}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { species: '', count: 5 },
  });
  assert.strictEqual(badStock.status, 400);

  // Zweite Art mit inkompatiblem Profil hinzufügen (Hartwasserfische im Weichwasserbecken)
  const addStock2 = await env.request(`/api/aquariums/${aq1Id}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { species: 'Guppy', count: 6, profile: 'hartwasser' },
  });
  assert.strictEqual(addStock2.status, 200);

  // Prüfen ob Konflikte in den Details angezeigt werden
  const detailWithConflicts = await env.request(`/api/aquariums/${aq1Id}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailWithConflicts.status, 200);
  assert.strictEqual(detailWithConflicts.data.stock.length, 2);
  assert.ok(detailWithConflicts.data.conflicts.length > 0, 'Konflikt zwischen weich und hart muss gemeldet werden');

  // 7. Besatz löschen
  const delStockRes = await env.request(`/api/aquariums/${aq1Id}/stock/${stock1Id}`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delStockRes.status, 200);

  const detailAfterDelStock = await env.request(`/api/aquariums/${aq1Id}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailAfterDelStock.data.stock.length, 1);
  assert.strictEqual(detailAfterDelStock.data.stock[0].species, 'Guppy');

  // 8. Aquarium aktualisieren (PUT)
  const updateRes = await env.request(`/api/aquariums/${aq1Id}`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: { name: 'Amazonas 300L', water_type: 'fresh', volume_l: 300, reminder_days: 10, notes: 'Update' },
  });
  assert.strictEqual(updateRes.status, 200);

  const detailUpdated = await env.request(`/api/aquariums/${aq1Id}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailUpdated.data.aquarium.name, 'Amazonas 300L');
  assert.strictEqual(detailUpdated.data.aquarium.volume_l, 300);

  // 9. Aquarium löschen (DELETE)
  const delAqRes = await env.request(`/api/aquariums/${aq2Id}`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delAqRes.status, 200);

  const listAfterDel = await env.request('/api/aquariums', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(listAfterDel.data.length, 1);
  assert.strictEqual(listAfterDel.data[0].id, aq1Id);
});
