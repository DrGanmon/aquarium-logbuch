'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMongoTestEnvironment } = require('./helpers/env');

test('MongoDB: Vollständiger Lebenszyklus, Authentifizierung, Aquarien, Freigaben, Messungen & Wartung', async (t) => {
  const env = await createMongoTestEnvironment({
    ADMIN_EMAIL: 'admin@aquarium.local',
  });

  t.after(async () => {
    await env.cleanup();
  });

  const db = require('../src/db');
  await db.init();
  assert.equal(db.type, 'mongodb', 'DB-Typ sollte mongodb sein');

  // 1. Registrierung & Login
  let adminUser, normalUser, otherUser;
  await t.test('MongoDB: Registrierung und Authentifizierung', async () => {
    adminUser = await env.createUserAndLogin('admin', 'adminpassword123', 'admin@aquarium.local');
    assert.ok(adminUser.id, 'Admin-ID muss vorhanden sein');
    assert.equal(adminUser.username, 'admin');

    const meRes = await env.request('/api/me', {
      headers: { Cookie: adminUser.cookie },
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.isAdmin, true, 'Admin muss erkannt werden');

    normalUser = await env.createUserAndLogin('aquarist1', 'securepass123', 'user1@example.com');
    assert.ok(normalUser.id);
    const normalMe = await env.request('/api/me', {
      headers: { Cookie: normalUser.cookie },
    });
    assert.equal(normalMe.data.isAdmin, false);

    otherUser = await env.createUserAndLogin('aquarist2', 'securepass123', 'user2@example.com');
    assert.ok(otherUser.id);
  });

  // 2. Aquarien-CRUD & Besatz
  let aquariumId;
  await t.test('MongoDB: Aquarien-CRUD und Besatzverwaltung', async () => {
    const createRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: { Cookie: normalUser.cookie },
      body: {
        name: 'Amazonas-Becken',
        volume_l: 240,
        water_type: 'fresh',
        reminder_days: 7,
        notes: 'Südamerika Biotop',
      },
    });
    assert.equal(createRes.status, 200);
    assert.ok(createRes.data.id);
    aquariumId = createRes.data.id;

    // Besatz hinzufügen
    const stockRes1 = await env.request(`/api/aquariums/${aquariumId}/stock`, {
      method: 'POST',
      headers: { Cookie: normalUser.cookie },
      body: {
        species: 'Roter Neon',
        count: 20,
        profile: 'weichwasser',
      },
    });
    assert.equal(stockRes1.status, 200);

    const stockRes2 = await env.request(`/api/aquariums/${aquariumId}/stock`, {
      method: 'POST',
      headers: { Cookie: normalUser.cookie },
      body: {
        species: 'Panzerwels',
        count: 8,
        profile: 'allgemein',
      },
    });
    assert.equal(stockRes2.status, 200);

    // Detailansicht abrufen
    const detailRes = await env.request(`/api/aquariums/${aquariumId}`, {
      headers: { Cookie: normalUser.cookie },
    });
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.data.aquarium.name, 'Amazonas-Becken');
    assert.equal(detailRes.data.stock.length, 2);
    assert.equal(detailRes.data.role, 'owner');
  });

  // 3. Freigaben (Sharing) mit Rollen (view / write)
  await t.test('MongoDB: Aquarien-Freigaben und Berechtigungsprüfung', async () => {
    // Freigabe für otherUser als 'write'
    const shareRes = await env.request(`/api/aquariums/${aquariumId}/shares`, {
      method: 'POST',
      headers: { Cookie: normalUser.cookie },
      body: {
        usernameOrEmail: 'aquarist2',
        role: 'write',
      },
    });
    assert.equal(shareRes.status, 200);

    // otherUser kann Aquarium abrufen und hat Rolle 'write'
    const otherDetail = await env.request(`/api/aquariums/${aquariumId}`, {
      headers: { Cookie: otherUser.cookie },
    });
    assert.equal(otherDetail.status, 200);
    assert.equal(otherDetail.data.role, 'write');

    // otherUser trägt Messung ein
    const measRes = await env.request(`/api/aquariums/${aquariumId}/measurements`, {
      method: 'POST',
      headers: { Cookie: otherUser.cookie },
      body: {
        values: { temp: 26.5, ph: 6.8, no2: 0.8 }, // no2 löst Alarm aus
        note: 'Kontrollmessung durch Urlaubsvertretung',
      },
    });
    assert.equal(measRes.status, 200);
    assert.ok(measRes.data.id);
    assert.ok(measRes.data.alerts.length >= 1, 'Muss Alarm für NO2 generieren');

    // Wartungsmaßnahme (Wasserwechsel)
    const maintRes = await env.request(`/api/aquariums/${aquariumId}/maintenance`, {
      method: 'POST',
      headers: { Cookie: otherUser.cookie },
      body: {
        type: 'water_change',
        percentage: 40,
        details: 'Großer Teilwasserwechsel wegen Nitrit',
      },
    });
    assert.equal(maintRes.status, 200);

    // Alarm quittieren
    const ackRes = await env.request(`/api/aquariums/${aquariumId}/alerts/ack`, {
      method: 'POST',
      headers: { Cookie: otherUser.cookie },
    });
    assert.equal(ackRes.status, 200);

    // Timeline abrufen
    const timelineRes = await env.request(`/api/aquariums/${aquariumId}/logs`, {
      headers: { Cookie: normalUser.cookie },
    });
    assert.equal(timelineRes.status, 200);
    assert.ok(Array.isArray(timelineRes.data));
    assert.ok(timelineRes.data.length >= 2, 'Timeline muss Messung und Wasserwechsel enthalten');
  });

  // 4. Profil und Testsuite-Präferenzen
  await t.test('MongoDB: Profil- und Testsuite-Verwaltung', async () => {
    // Profil aktualisieren
    const profileRes = await env.request('/api/me', {
      method: 'PUT',
      headers: { Cookie: normalUser.cookie },
      body: {
        firstName: 'Max',
        lastName: 'Mustermann',
        bio: 'Leidenschaftlicher Aquarianer seit 10 Jahren.',
      },
    });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.data.user.firstName, 'Max');
    assert.equal(profileRes.data.user.bio, 'Leidenschaftlicher Aquarianer seit 10 Jahren.');

    // Testsuite-Präferenzen speichern
    const suiteRes = await env.request('/api/me/tests', {
      method: 'PUT',
      headers: { Cookie: normalUser.cookie },
      body: {
        selectedSuite: 'jbl-pro',
        selectedTests: ['temp', 'ph', 'kh', 'no2', 'no3'],
      },
    });
    assert.equal(suiteRes.status, 200);
    assert.equal(suiteRes.data.selectedSuite, 'jbl-pro');
    assert.deepEqual(suiteRes.data.selectedTests, ['temp', 'ph', 'kh', 'no2', 'no3']);
  });

  // 5. Admin-Benutzerverwaltung & Isolation
  await t.test('MongoDB: Admin-Benutzerverwaltung und Bereinigung', async () => {
    const usersRes = await env.request('/api/admin/users', {
      headers: { Cookie: adminUser.cookie },
    });
    assert.equal(usersRes.status, 200);
    assert.ok(usersRes.data.length >= 3);

    // Admin kann Benutzer bearbeiten
    const editRes = await env.request(`/api/admin/users/${normalUser.id}`, {
      method: 'PUT',
      headers: { Cookie: adminUser.cookie },
      body: {
        username: 'aquarist_renamed',
        email: 'renamed@example.com',
      },
    });
    assert.equal(editRes.status, 200);

    // Benutzer löschen
    const delRes = await env.request(`/api/admin/users/${normalUser.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminUser.cookie },
    });
    assert.equal(delRes.status, 200);

    // Aquarium des gelöschten Benutzers existiert nicht mehr
    const checkAq = await env.request(`/api/aquariums/${aquariumId}`, {
      headers: { Cookie: otherUser.cookie },
    });
    assert.equal(checkAq.status, 404);
  });
});
