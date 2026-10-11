'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Messungen & Alarme: Erfassung, Validierung, Historie und Quittierung', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('measuser', 'password123');

  // 1. Aquarium anlegen
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Pflanzenbecken', water_type: 'fresh', volume_l: 180, reminder_days: 7 },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  // 2. Messung mit ungültigen Werten (leer, unbekannter Parameter, Werte außerhalb des Bereichs)
  const emptyMeas = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { values: {} },
  });
  assert.strictEqual(emptyMeas.status, 400);

  const unknownParam = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { values: { invalid_param: 10 } },
  });
  assert.strictEqual(unknownParam.status, 400);

  const outOfRange = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { values: { ph: 15 } }, // max ist 10
  });
  assert.strictEqual(outOfRange.status, 400);

  const futureDate = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      measured_at: new Date(Date.now() + 86400000).toISOString(),
      values: { ph: 7.0 },
    },
  });
  assert.strictEqual(futureDate.status, 400);

  // 3. Gültige Messung mit normalen Werten eintragen (keine Alarme)
  const normalMeas = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      measured_at: new Date(Date.now() - 3600000).toISOString(),
      note: 'Wöchentliche Routine',
      values: { ph: 7.0, kh: 5.0, gh: 8.0, no2: 0.01, no3: 15.0, temp: 25.0 },
    },
  });
  assert.strictEqual(normalMeas.status, 200);
  assert.ok(normalMeas.data.id > 0);
  assert.strictEqual(normalMeas.data.alerts.length, 0);

  // 4. Zweite Messung mit kritischen Werten (Nitrit = 1.0 -> crit, pH = 8.8 -> crit)
  const critMeas = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      measured_at: new Date().toISOString(),
      note: 'Wasser trüb, Notmessung',
      values: { ph: 8.8, no2: 1.0, temp: 29.5 }, // temp 29.5 ist warn (okMax 27, critMax 31)
    },
  });
  assert.strictEqual(critMeas.status, 200);
  assert.ok(critMeas.data.alerts.length >= 2);
  const critAlerts = critMeas.data.alerts.filter((a) => a.level === 'crit');
  const warnAlerts = critMeas.data.alerts.filter((a) => a.level === 'warn');
  assert.ok(critAlerts.some((a) => a.param === 'no2'));
  assert.ok(critAlerts.some((a) => a.param === 'ph'));
  assert.ok(warnAlerts.some((a) => a.param === 'temp'));

  // 5. Details zu Aquarium abrufen und offene Alarme prüfen
  const detailRes = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(detailRes.data.aquarium.open_crit, 2);
  assert.strictEqual(detailRes.data.aquarium.open_warn, 1);
  assert.strictEqual(detailRes.data.alerts.length, 3);
  assert.strictEqual(detailRes.data.latest.no2.value, 1.0);
  assert.strictEqual(detailRes.data.latest.no2.status, 'crit');

  // 6. Historie abrufen (/api/aquariums/:id/measurements)
  const histRes = await env.request(`/api/aquariums/${aqId}/measurements?days=30`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(histRes.status, 200);
  assert.strictEqual(histRes.data.length, 2);
  assert.strictEqual(histRes.data[0].values.ph, 7.0);
  assert.strictEqual(histRes.data[1].values.ph, 8.8);

  // 7. Einen spezifischen Alarm quittieren
  const singleAlertId = detailRes.data.alerts[0].id;
  const ackOneRes = await env.request(`/api/aquariums/${aqId}/alerts/ack`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { ids: [singleAlertId] },
  });
  assert.strictEqual(ackOneRes.status, 200);

  const detailAfterOneAck = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailAfterOneAck.data.alerts.length, 2);

  // 8. Alle verbleibenden Alarme quittieren
  const ackAllRes = await env.request(`/api/aquariums/${aqId}/alerts/ack`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {},
  });
  assert.strictEqual(ackAllRes.status, 200);

  const detailAfterAllAck = await env.request(`/api/aquariums/${aqId}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(detailAfterAllAck.data.alerts.length, 0);
  assert.strictEqual(detailAfterAllAck.data.aquarium.open_crit, 0);
  assert.strictEqual(detailAfterAllAck.data.aquarium.open_warn, 0);

  // 9. Eine Messung löschen
  const delMeasRes = await env.request(`/api/aquariums/${aqId}/measurements/${normalMeas.data.id}`, {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delMeasRes.status, 200);

  const histAfterDel = await env.request(`/api/aquariums/${aqId}/measurements?days=30`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(histAfterDel.data.length, 1);
  assert.strictEqual(histAfterDel.data[0].id, critMeas.data.id);
});

test('Aquarium öffnen nach Messungseintrag: Konsistenz von Detaildaten, Alarmen, Logbuch und Frontend-Hilfsfunktionen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('flowuser', 'password123', 'flow@example.com');

  // 1. Aquarium erstellen
  const createAq = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Nano Cube 30',
      water_type: 'fresh',
      volume_l: 30,
      description: 'Garnelenbecken mit Moosen',
    },
  });
  assert.strictEqual(createAq.status, 200);
  const aqId = createAq.data.id;

  // 2. Ersten Wassertest eintragen (mit Warnung & kritischem Wert)
  const createMeas = await env.request(`/api/aquariums/${aqId}/measurements`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      measured_at: new Date().toISOString(),
      note: 'Erstmessung nach Einlaufphase',
      values: {
        ph: 7.2,
        kh: 4,
        gh: 7,
        no2: 0.8, // crit
        no3: 40,  // warn
        temp: 24.5,
      },
    },
  });
  assert.strictEqual(createMeas.status, 200);

  // 3. Alle Endpunkte abrufen, die beim Öffnen des Aquariums geladen werden
  const [detailRes, measRes, logsRes, imagesRes] = await Promise.all([
    env.request(`/api/aquariums/${aqId}`, { headers: { Cookie: user.cookie } }),
    env.request(`/api/aquariums/${aqId}/measurements?days=90`, { headers: { Cookie: user.cookie } }),
    env.request(`/api/aquariums/${aqId}/logs?days=90`, { headers: { Cookie: user.cookie } }),
    env.request(`/api/aquariums/${aqId}/images`, { headers: { Cookie: user.cookie } }),
  ]);

  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(measRes.status, 200);
  assert.strictEqual(logsRes.status, 200);
  assert.strictEqual(imagesRes.status, 200);

  const aqData = detailRes.data;
  assert.ok(aqData.aquarium);
  assert.strictEqual(aqData.aquarium.name, 'Nano Cube 30');
  assert.ok(Array.isArray(aqData.alerts));
  assert.ok(aqData.alerts.length >= 2);
  assert.ok(aqData.latest);
  assert.strictEqual(aqData.latest.no2.value, 0.8);
  assert.strictEqual(aqData.latest.no2.status, 'crit');

  // 4. Validierung der Datums- und Alarm-Formatierung (Frontend sqlDate / formatDate Äquivalent)
  for (const alert of aqData.alerts) {
    assert.ok(alert.created_at, 'Alarm hat ein created_at Feld');
    const parsedDate = new Date(alert.created_at.includes('T') ? alert.created_at : alert.created_at.replace(' ', 'T') + 'Z');
    assert.strictEqual(isNaN(parsedDate.getTime()), false, 'Alarmdatum ist gültig');
  }

  // 5. Logbuch-Eintrag prüfen
  assert.ok(logsRes.data.length >= 1);
  const measLog = logsRes.data.find((l) => l.type === 'measurement');
  assert.ok(measLog, 'Messung erscheint im Logbuch');
  assert.strictEqual(measLog.values.no2, 0.8);
});
