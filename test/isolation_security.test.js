'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');

test('Sicherheit & Datenisolierung: Strenger Schutz vor Cross-User Datenzugriff (Anti-IDOR)', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  // 1. Benutzer A und Benutzer B erstellen
  const userA = await env.createUserAndLogin('victim_alice', 'passwordAlice123', 'alice@test.local');
  const userB = await env.createUserAndLogin('attacker_bob', 'passwordBob12345', 'bob@test.local');

  // Benutzer A legt Aquarium A1 an mit Besatz, Messung und Alarm
  const createA1 = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: { name: 'Alice Geheimbecken', water_type: 'fresh', volume_l: 300, reminder_days: 7 },
  });
  assert.strictEqual(createA1.status, 200);
  const a1Id = createA1.data.id;

  const stockA1 = await env.request(`/api/aquariums/${a1Id}/stock`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: { species: 'Diskusfisch', count: 6, profile: 'weichwasser' },
  });
  assert.strictEqual(stockA1.status, 200);
  const stockA1Id = stockA1.data.id;

  const measA1 = await env.request(`/api/aquariums/${a1Id}/measurements`, {
    method: 'POST',
    headers: { Cookie: userA.cookie },
    body: {
      note: 'Geheime Notiz von Alice',
      values: { ph: 8.5, no2: 0.8 }, // Erzeugt Alarme
    },
  });
  assert.strictEqual(measA1.status, 200);
  const measA1Id = measA1.data.id;

  const detailA1Before = await env.request(`/api/aquariums/${a1Id}`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(detailA1Before.status, 200);
  const alertA1Id = detailA1Before.data.alerts[0].id;
  assert.ok(alertA1Id > 0);

  // Benutzer B legt eigenes Aquarium B1 an
  const createB1 = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: userB.cookie },
    body: { name: 'Bob Normalbecken', water_type: 'fresh', volume_l: 100 },
  });
  assert.strictEqual(createB1.status, 200);
  const b1Id = createB1.data.id;

  // ==========================================
  // ANGRIFFSTESTS DURCH BENUTZER B AUF BENUTZER A
  // ==========================================

  // 1. Liste aller Aquarien: Bob darf nur B1 sehen, niemals A1
  const listB = await env.request('/api/aquariums', {
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(listB.status, 200);
  assert.strictEqual(listB.data.length, 1);
  assert.strictEqual(listB.data[0].id, b1Id);
  assert.strictEqual(listB.data[0].name, 'Bob Normalbecken');

  // 2. Bob versucht Details von A1 abzufragen -> 404
  const getOtherAq = await env.request(`/api/aquariums/${a1Id}`, {
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(getOtherAq.status, 404);

  // 3. Bob versucht Aquarium A1 zu bearbeiten (PUT) -> 404
  const putOtherAq = await env.request(`/api/aquariums/${a1Id}`, {
    method: 'PUT',
    headers: { Cookie: userB.cookie },
    body: { name: 'Gehackt durch Bob' },
  });
  assert.strictEqual(putOtherAq.status, 404);

  // 4. Bob versucht Aquarium A1 zu löschen (DELETE) -> 404
  const delOtherAq = await env.request(`/api/aquariums/${a1Id}`, {
    method: 'DELETE',
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(delOtherAq.status, 404);

  // 5. Bob versucht Besatz in A1 einzutragen -> 404
  const addStockOther = await env.request(`/api/aquariums/${a1Id}/stock`, {
    method: 'POST',
    headers: { Cookie: userB.cookie },
    body: { species: 'Hai', count: 1 },
  });
  assert.strictEqual(addStockOther.status, 404);

  // 6. Bob versucht Besatz von A1 über URL /api/aquariums/:A1/stock/:stockA1 zu löschen -> 404
  const delStockDirect = await env.request(`/api/aquariums/${a1Id}/stock/${stockA1Id}`, {
    method: 'DELETE',
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(delStockDirect.status, 404);

  // 7. Bob versucht Besatz von A1 über sein eigenes Aquarium B1 zu löschen: /api/aquariums/:B1/stock/:stockA1 -> 200, aber löscht in A1 nichts!
  const delStockCross = await env.request(`/api/aquariums/${b1Id}/stock/${stockA1Id}`, {
    method: 'DELETE',
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(delStockCross.status, 200);

  // Verifizieren, dass der Besatz in A1 unberührt geblieben ist
  const detailA1Check1 = await env.request(`/api/aquariums/${a1Id}`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(detailA1Check1.data.stock.length, 1);
  assert.strictEqual(detailA1Check1.data.stock[0].species, 'Diskusfisch');

  // 8. Bob versucht Messungen in A1 einzutragen -> 404
  const addMeasOther = await env.request(`/api/aquariums/${a1Id}/measurements`, {
    method: 'POST',
    headers: { Cookie: userB.cookie },
    body: { values: { ph: 7.0 } },
  });
  assert.strictEqual(addMeasOther.status, 404);

  // 9. Bob versucht Messwerte/Historie von A1 abzurufen -> 404
  const getMeasOther = await env.request(`/api/aquariums/${a1Id}/measurements`, {
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(getMeasOther.status, 404);

  // 10. Bob versucht Messung von A1 über /api/aquariums/:A1/measurements/:measA1 zu löschen -> 404
  const delMeasDirect = await env.request(`/api/aquariums/${a1Id}/measurements/${measA1Id}`, {
    method: 'DELETE',
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(delMeasDirect.status, 404);

  // 11. Bob versucht Messung von A1 über /api/aquariums/:B1/measurements/:measA1 zu löschen -> löscht in A1 nichts!
  const delMeasCross = await env.request(`/api/aquariums/${b1Id}/measurements/${measA1Id}`, {
    method: 'DELETE',
    headers: { Cookie: userB.cookie },
  });
  assert.strictEqual(delMeasCross.status, 200);

  // Verifizieren, dass Messung in A1 weiter existiert
  const measCheckA = await env.request(`/api/aquariums/${a1Id}/measurements`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(measCheckA.data.length, 1);
  assert.strictEqual(measCheckA.data[0].id, measA1Id);
  assert.strictEqual(measCheckA.data[0].note, 'Geheime Notiz von Alice');

  // 12. Bob versucht Alarm von A1 über /api/aquariums/:A1/alerts/ack zu quittieren -> 404
  const ackAlertDirect = await env.request(`/api/aquariums/${a1Id}/alerts/ack`, {
    method: 'POST',
    headers: { Cookie: userB.cookie },
    body: { ids: [alertA1Id] },
  });
  assert.strictEqual(ackAlertDirect.status, 404);

  // 13. Bob versucht Alarm von A1 über /api/aquariums/:B1/alerts/ack zu quittieren -> verändert Alarm in A1 nicht
  const ackAlertCross = await env.request(`/api/aquariums/${b1Id}/alerts/ack`, {
    method: 'POST',
    headers: { Cookie: userB.cookie },
    body: { ids: [alertA1Id] },
  });
  assert.strictEqual(ackAlertCross.status, 200);

  // Verifizieren, dass Alarm in A1 weiterhin offen ist
  const detailA1Check2 = await env.request(`/api/aquariums/${a1Id}`, {
    headers: { Cookie: userA.cookie },
  });
  assert.strictEqual(detailA1Check2.data.alerts.length, 2);
  assert.ok(detailA1Check2.data.alerts.some((a) => a.id === alertA1Id));

  // ==========================================
  // UNANGEMELDETER ANGRIFF (UNAUTHENTICATED)
  // ==========================================
  const unauthEndpoints = [
    { path: '/api/me', method: 'GET' },
    { path: '/api/config', method: 'GET' },
    { path: '/api/aquariums', method: 'GET' },
    { path: '/api/aquariums', method: 'POST', body: { name: 'Hack' } },
    { path: `/api/aquariums/${a1Id}`, method: 'GET' },
    { path: `/api/aquariums/${a1Id}`, method: 'PUT', body: { name: 'Hack' } },
    { path: `/api/aquariums/${a1Id}`, method: 'DELETE' },
    { path: `/api/aquariums/${a1Id}/stock`, method: 'POST', body: { species: 'Hai' } },
    { path: `/api/aquariums/${a1Id}/stock/${stockA1Id}`, method: 'DELETE' },
    { path: `/api/aquariums/${a1Id}/measurements`, method: 'GET' },
    { path: `/api/aquariums/${a1Id}/measurements`, method: 'POST', body: { values: { ph: 7 } } },
    { path: `/api/aquariums/${a1Id}/measurements/${measA1Id}`, method: 'DELETE' },
    { path: `/api/aquariums/${a1Id}/alerts/ack`, method: 'POST', body: {} },
    { path: '/api/password', method: 'POST', body: { current: 'old', next: 'new12345' } },
    { path: '/api/me/unlink-oidc', method: 'POST', body: {} },
    { path: '/api/admin/users', method: 'GET' },
  ];

  for (const ep of unauthEndpoints) {
    const res = await env.request(ep.path, {
      method: ep.method,
      body: ep.body,
    });
    assert.strictEqual(res.status, 401, `Unangemeldet auf ${ep.method} ${ep.path} muss 401 liefern (erhalten: ${res.status})`);
  }
});
