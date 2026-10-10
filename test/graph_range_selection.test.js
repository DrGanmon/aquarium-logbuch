'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Graph-Zeitraum: Standard 3 Monate (90 Tage), benutzerdefinierte Zeiträume und Profil-Konfiguration', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('rangetestuser', 'password123');

  // 1. Aquarium anlegen
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: { name: 'Südamerika-Becken', water_type: 'fresh', volume_l: 240, reminder_days: 7 },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  const now = Date.now();
  const dayMs = 86400000;

  // 2. Messungen zu verschiedenen Zeitpunkten in der Vergangenheit einfügen:
  // - 10 Tage her (innerhalb 14 Tage, 30 Tage, 90 Tage, 365 Tage)
  // - 45 Tage her (innerhalb 90 Tage, 365 Tage)
  // - 80 Tage her (innerhalb 90 Tage, 365 Tage)
  // - 120 Tage her (außerhalb 90 Tage, innerhalb 180 Tage)
  // - 300 Tage her (außerhalb 180 Tage, innerhalb 365 Tage)
  // - 500 Tage her (außerhalb 365 Tage, innerhalb 3650 Tage)
  const timestamps = [
    { daysAgo: 10, ph: 6.8, note: '10 Tage alt' },
    { daysAgo: 45, ph: 6.9, note: '45 Tage alt' },
    { daysAgo: 80, ph: 7.0, note: '80 Tage alt' },
    { daysAgo: 120, ph: 7.1, note: '120 Tage alt' },
    { daysAgo: 300, ph: 7.2, note: '300 Tage alt' },
    { daysAgo: 500, ph: 7.3, note: '500 Tage alt' },
  ];

  for (const item of timestamps) {
    const res = await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        measured_at: new Date(now - item.daysAgo * dayMs).toISOString(),
        note: item.note,
        values: { ph: item.ph, temp: 25.0 },
      },
    });
    assert.strictEqual(res.status, 200);
  }

  // 3. Standard-Abfrage ohne Parameter -> muss 90 Tage (3 Monate) liefern (10, 45, 80 Tage = 3 Messungen)
  const defaultRes = await env.request(`/api/aquariums/${aqId}/measurements`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(defaultRes.status, 200);
  assert.strictEqual(defaultRes.data.length, 3, 'Standard-Zeitraum muss 90 Tage / 3 Monate sein (3 Messungen)');
  assert.strictEqual(defaultRes.data[0].note, '80 Tage alt');
  assert.strictEqual(defaultRes.data[1].note, '45 Tage alt');
  assert.strictEqual(defaultRes.data[2].note, '10 Tage alt');

  // 4. Abfrage mit days=14 (nur 10 Tage alt)
  const days14Res = await env.request(`/api/aquariums/${aqId}/measurements?days=14`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(days14Res.status, 200);
  assert.strictEqual(days14Res.data.length, 1);
  assert.strictEqual(days14Res.data[0].note, '10 Tage alt');

  // 5. Abfrage mit days=180 (10, 45, 80, 120 Tage = 4 Messungen)
  const days180Res = await env.request(`/api/aquariums/${aqId}/measurements?days=180`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(days180Res.status, 200);
  assert.strictEqual(days180Res.data.length, 4);

  // 6. Abfrage mit days=365 (10, 45, 80, 120, 300 Tage = 5 Messungen)
  const days365Res = await env.request(`/api/aquariums/${aqId}/measurements?days=365`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(days365Res.status, 200);
  assert.strictEqual(days365Res.data.length, 5);

  // 7. Abfrage mit days=3650 / Alles (alle 6 Messungen)
  const daysAllRes = await env.request(`/api/aquariums/${aqId}/measurements?days=3650`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(daysAllRes.status, 200);
  assert.strictEqual(daysAllRes.data.length, 6);

  // 8. Benutzerdefinierte Datumsabfrage mit from & to
  const fromDateStr = new Date(now - 100 * dayMs).toISOString().split('T')[0]; // vor 100 Tagen
  const toDateStr = new Date(now - 40 * dayMs).toISOString().split('T')[0]; // vor 40 Tagen
  const customRangeRes = await env.request(`/api/aquariums/${aqId}/measurements?from=${fromDateStr}&to=${toDateStr}`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(customRangeRes.status, 200);
  // Sollte die Messungen vor 80 Tagen und vor 45 Tagen enthalten
  assert.strictEqual(customRangeRes.data.length, 2);
  const notes = customRangeRes.data.map((m) => m.note);
  assert.ok(notes.includes('80 Tage alt'));
  assert.ok(notes.includes('45 Tage alt'));

  // 9. Benutzerprofil: Standard-Zeitraum für Graphen ändern (z. B. auf 180 Tage)
  const profileRes = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(profileRes.status, 200);
  assert.strictEqual(profileRes.data.defaultGraphRange, '90', 'Standardmäßig 90 Tage im Profil');

  const updateProfileRes = await env.request('/api/me', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: { defaultGraphRange: '180' },
  });
  assert.strictEqual(updateProfileRes.status, 200);
  assert.strictEqual(updateProfileRes.data.user.defaultGraphRange, '180');

  // Prüfen beim erneuten Abruf von /api/me
  const refetchedProfile = await env.request('/api/me', {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(refetchedProfile.data.defaultGraphRange, '180');
});
