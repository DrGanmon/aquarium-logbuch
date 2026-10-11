'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createTestEnvironment } = require('./helpers/env');

test('Dosierpumpen & Lazy Loading im Logbuch', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('dosinguser', 'password123');

  // 1. Aquarium erstellen
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'High-Tech Aquascape',
      water_type: 'fresh',
      volume_l: 120,
    },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  // 2. Dosierpumpe 1 (Eisen) anlegen
  const pump1Res = await env.request(`/api/aquariums/${aqId}/dosing-pumps`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Kanal 1',
      fertilizer_name: 'Eisen-Volldünger',
      amount_ml: 2.5,
      interval_days: 1,
      time_of_day: '08:00',
      note: 'Morgens vor dem Lichteinschalten',
    },
  });
  assert.strictEqual(pump1Res.status, 200);
  assert.strictEqual(pump1Res.data.name, 'Kanal 1');
  assert.strictEqual(pump1Res.data.fertilizer_name, 'Eisen-Volldünger');
  assert.strictEqual(pump1Res.data.amount_ml, 2.5);
  assert.strictEqual(pump1Res.data.interval_days, 1);
  assert.strictEqual(pump1Res.data.is_active, 1);
  const pump1Id = pump1Res.data.id;

  // 3. Dosierpumpe 2 (NPK) anlegen
  const pump2Res = await env.request(`/api/aquariums/${aqId}/dosing-pumps`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Kanal 2',
      fertilizer_name: 'NPK Makro Basic',
      amount_ml: 5.0,
      interval_days: 2,
      time_of_day: '08:05',
    },
  });
  assert.strictEqual(pump2Res.status, 200);
  const pump2Id = pump2Res.data.id;

  // 4. Dosierpumpen auflisten
  const listRes = await env.request(`/api/aquariums/${aqId}/dosing-pumps`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.data.length, 2);

  // 5. In der Aquarium-Detailansicht prüfen, ob dosing_pumps enthalten sind
  const detailRes = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(Array.isArray(detailRes.data.dosing_pumps), true);
  assert.strictEqual(detailRes.data.dosing_pumps.length, 2);

  // 6. Dosierpumpe 1 bearbeiten (Menge anpassen)
  const updateRes = await env.request(`/api/aquariums/${aqId}/dosing-pumps/${pump1Id}`, {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Kanal 1 (Mikro)',
      fertilizer_name: 'Eisen-Volldünger (Mikro Spezial)',
      amount_ml: 3.0,
      interval_days: 1,
      time_of_day: '08:00',
    },
  });
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.data.amount_ml, 3.0);
  assert.strictEqual(updateRes.data.name, 'Kanal 1 (Mikro)');

  // 7. Dosierung auslösen (Jetzt dosieren)
  const doseRes = await env.request(`/api/aquariums/${aqId}/dosing-pumps/${pump1Id}/dose`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {},
  });
  assert.strictEqual(doseRes.status, 200);
  assert.strictEqual(doseRes.data.success, true);
  assert.ok(doseRes.data.log_id);

  // Nach dem Dosieren muss last_dosed_at gesetzt sein
  const pumpAfterDose = await env.request(`/api/aquariums/${aqId}/dosing-pumps/${pump1Id}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(pumpAfterDose.status, 200);
  assert.ok(pumpAfterDose.data.last_dosed_at);

  // 8. Prüfen, ob der Dosier-Eintrag im Logbuch auftaucht
  const logsRes = await env.request(`/api/aquariums/${aqId}/logs?kind=all`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(logsRes.status, 200);
  assert.strictEqual(logsRes.data.length, 1);
  assert.strictEqual(logsRes.data[0].type, 'dosing_pump');
  assert.ok(logsRes.data[0].details.includes('3 ml'));
  assert.ok(logsRes.data[0].details.includes('Eisen-Volldünger'));

  // 9. Lazy Loading Test: 29 weitere Logbucheinträge anlegen (gesamt: 30)
  for (let i = 1; i <= 15; i++) {
    await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        measured_at: new Date(Date.now() - (30 - i) * 86400000).toISOString(),
        values: { ph: 6.8, no3: 15, po4: 0.5 },
        note: `Messung ${i}`,
      },
    });
  }

  for (let i = 1; i <= 14; i++) {
    await env.request(`/api/aquariums/${aqId}/maintenance`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        logged_at: new Date(Date.now() - (15 - i) * 86400000).toISOString(),
        type: 'water_change',
        percentage: 30,
        details: 'Teilwasserwechsel 30%',
      },
    });
  }

  // Abfrage 1: Standard-Limit (max 25 Einträge)
  const page1Res = await env.request(`/api/aquariums/${aqId}/logs?limit=25&offset=0`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(page1Res.status, 200);
  assert.strictEqual(page1Res.data.length, 25);

  // Abfrage 2: Lazy Load nächste Seite (Offset 25)
  const page2Res = await env.request(`/api/aquariums/${aqId}/logs?limit=25&offset=25`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(page2Res.status, 200);
  // Insgesamt 30 Einträge (1 Dosing + 15 Messungen + 14 Wasserwechsel) -> Seite 2 hat 5 Einträge
  assert.strictEqual(page2Res.data.length, 5);

  // Abfrage 3: Filter nach Wasserwechsel (kind=water_change)
  const wcRes = await env.request(`/api/aquariums/${aqId}/logs?kind=water_change&limit=25&offset=0`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(wcRes.status, 200);
  assert.strictEqual(wcRes.data.length, 14);

  // 10. Dosierpumpe löschen
  const delRes = await env.request(`/api/aquariums/${aqId}/dosing-pumps/${pump2Id}`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delRes.status, 200);
  assert.strictEqual(delRes.data.ok, true);

  const listAfterDel = await env.request(`/api/aquariums/${aqId}/dosing-pumps`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(listAfterDel.status, 200);
  assert.strictEqual(listAfterDel.data.length, 1);
});
