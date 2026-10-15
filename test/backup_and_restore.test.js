'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('fs');
require('path');
require('zlib');

const { createTestEnvironment, createMongoTestEnvironment } = require('./helpers/env');

test('Backup & Restore: Zugriffsschutz, Datenexport, Wiederherstellung, Migration und automatische Backups', async (t) => {
  let env;

  t.beforeEach(async () => {
    env = createTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test('Zugriffsschutz: Nur Administratoren können Backup-Endpunkte aufrufen', async () => {
    await env.start();

    // 1. Unauthentifiziert -> 401
    const unauthGet = await env.request('/api/admin/backups');
    assert.strictEqual(unauthGet.status, 401, 'Unauthentifizierter Zugriff muss 401 liefern');

    const unauthPost = await env.request('/api/admin/backups/create', { method: 'POST' });
    assert.strictEqual(unauthPost.status, 401, 'Unauthentifizierter POST muss 401 liefern');

    // 2. Regulärer Benutzer (kein Admin) -> 403
    const user = await env.createUserAndLogin('standarduser', 'password123', 'user@example.com');
    const userHeaders = { Cookie: user.cookie };

    const userList = await env.request('/api/admin/backups', { headers: userHeaders });
    assert.strictEqual(userList.status, 403, 'Normaler Benutzer muss 403 Forbidden erhalten');

    const userCreate = await env.request('/api/admin/backups/create', { method: 'POST', headers: userHeaders });
    assert.strictEqual(userCreate.status, 403, 'Normaler Benutzer darf kein Backup erstellen');

    const userRestore = await env.request('/api/admin/backups/test.json/restore', { method: 'POST', headers: userHeaders });
    assert.strictEqual(userRestore.status, 403, 'Normaler Benutzer darf kein Backup einspielen');

    const userConfig = await env.request('/api/admin/backups/config', {
      method: 'PUT',
      headers: userHeaders,
      body: { enabled: true },
    });
    assert.strictEqual(userConfig.status, 403, 'Normaler Benutzer darf Backup-Konfiguration nicht ändern');
  });

  await t.test('Backup erstellen, herunterladen und Metadaten prüfen', async () => {
    await env.start();

    // Admin und Testdaten anlegen
    const admin = await env.createUserAndLogin('adminuser', 'password123', 'admin@example.com');
    const adminHeaders = { Cookie: admin.cookie };
    assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers: adminHeaders, body: { password: 'backup-test-password' } })).status, 200);

    // Aquarium anlegen
    const aqRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: adminHeaders,
      body: { name: 'Grosses Becken', volume_l: 300, water_type: 'fresh', reminder_days: 7 },
    });
    assert.strictEqual(aqRes.status, 200);
    const aqId = aqRes.data.id;

    // Besatz hinzufügen
    await env.request(`/api/aquariums/${aqId}/stock`, {
      method: 'POST',
      headers: adminHeaders,
      body: { species: 'Roter Neon', count: 20 },
    });

    // Messwert eintragen
    await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: adminHeaders,
      body: {
        measured_at: new Date().toISOString(),
        values: { ph: 6.8, temp: 25, no3: 15 },
        note: 'Messung vor Backup',
      },
    });

    // Wartung eintragen
    await env.request(`/api/aquariums/${aqId}/maintenance`, {
      method: 'POST',
      headers: adminHeaders,
      body: {
        type: 'water_change',
        percentage: 40,
        details: 'Wasserwechsel 40% mit Aufbereiter',
      },
    });

    // Bild hochladen
    const fakePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await env.request(`/api/aquariums/${aqId}/image`, {
      method: 'POST',
      headers: adminHeaders,
      body: { image: fakePng },
    });

    // 1. Manuelles Backup erstellen
    const createRes = await env.request('/api/admin/backups/create', {
      method: 'POST',
      headers: adminHeaders,
      body: { includeFiles: true },
    });
    assert.strictEqual(createRes.status, 200);
    assert.strictEqual(createRes.data.ok, true);
    assert.ok(createRes.data.filename);

    const filename = createRes.data.filename;

    // 2. Backups auflisten
    const listRes = await env.request('/api/admin/backups', { headers: adminHeaders });
    assert.strictEqual(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data.backups));
    assert.ok(listRes.data.backups.some((b) => b.filename === filename));

    // 3. Backup-Datei herunterladen
    const dlRes = await env.request(`/api/admin/backups/${encodeURIComponent(filename)}/download`, {
      headers: adminHeaders,
    });
    assert.strictEqual(dlRes.status, 200);
    assert.ok(dlRes.text || dlRes.data);
  });

  await t.test('Wiederherstellung (Restore): Stellt Zustand exakt wieder her und überschreibt Änderungen', async () => {
    await env.start();

    const admin = await env.createUserAndLogin('adminuser', 'password123', 'admin@example.com');
    const adminHeaders = { Cookie: admin.cookie };
    assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers: adminHeaders, body: { password: 'backup-test-password' } })).status, 200);

    // Erstes Aquarium anlegen
    const aqRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: adminHeaders,
      body: { name: 'Originalbecken', volume_l: 180, water_type: 'fresh' },
    });
    const aqId = aqRes.data.id;

    await env.request(`/api/aquariums/${aqId}/stock`, {
      method: 'POST',
      headers: adminHeaders,
      body: { species: 'Neonsalmler', count: 12 },
    });

    await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: adminHeaders,
      body: { values: { ph: 7.0, temp: 24.5 }, note: 'Original-Messung' },
    });

    // Backup erstellen
    const createRes = await env.request('/api/admin/backups/create', {
      method: 'POST',
      headers: adminHeaders,
    });
    const backupFile = createRes.data.filename;

    // Jetzt Daten verändern: Neues zweites Becken anlegen und erstes löschen
    const aq2Res = await env.request('/api/aquariums', {
      method: 'POST',
      headers: adminHeaders,
      body: { name: 'Zweites Becken nach Backup', volume_l: 60 },
    });
    assert.strictEqual(aq2Res.status, 200);

    await env.request(`/api/aquariums/${aqId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });

    // Überprüfen, dass nur noch das zweite Becken existiert
    let listAqs = await env.request('/api/aquariums', { headers: adminHeaders });
    assert.strictEqual(listAqs.data.length, 1);
    assert.strictEqual(listAqs.data[0].name, 'Zweites Becken nach Backup');

    // Backup wiederherstellen
    const restoreRes = await env.request(`/api/admin/backups/${encodeURIComponent(backupFile)}/restore`, {
      method: 'POST',
      headers: adminHeaders,
    });
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.ok, true);

    // Prüfen, dass das Originalbecken wieder da ist und das neue weg ist
    listAqs = await env.request('/api/aquariums', { headers: adminHeaders });
    assert.strictEqual(listAqs.data.length, 1);
    assert.strictEqual(listAqs.data[0].name, 'Originalbecken');

    // Prüfen, dass Besatz und Messwerte im wiederhergestellten Becken vorhanden sind
    const restoredAq = await env.request(`/api/aquariums/${aqId}`, { headers: adminHeaders });
    assert.strictEqual(restoredAq.status, 200);
    assert.strictEqual(restoredAq.data.stock.length, 1);
    assert.strictEqual(restoredAq.data.stock[0].species, 'Neonsalmler');

    const restoredMeas = await env.request(`/api/aquariums/${aqId}/measurements`, { headers: adminHeaders });
    assert.strictEqual(restoredMeas.status, 200);
    assert.strictEqual(restoredMeas.data.length, 1);
    assert.strictEqual(restoredMeas.data[0].values.ph, 7.0);
  });

  await t.test('Migration: Importiert alte v1-Backups (ohne neue Felder / mit separaten Messwerttabellen) fehlerfrei', async () => {
    await env.start();

    const admin = await env.createUserAndLogin('adminuser', 'password123', 'admin@example.com');
    const adminHeaders = { Cookie: admin.cookie };
    assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers: adminHeaders, body: { password: 'backup-test-password' } })).status, 200);

    // Altes v1 Backup-Format
    const legacyBackup = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00Z',
      data: {
        users: [
          {
            id: 1,
            username: 'legacyadmin',
            email: 'admin@example.com',
            password_hash: '1234:5678',
            created_at: '2024-01-01 10:00:00',
            // Keine first_name, last_name, bio, avatar_file, selected_suite etc.
          },
        ],
        aquariums: [
          {
            id: 1,
            user_id: 1,
            name: 'Altes Becken v1',
            volume_l: 120,
            water_type: 'fresh',
            reminder_days: 14,
            notes: 'Legacy Notiz',
            // Kein image_file
          },
        ],
        stock: [
          {
            id: 1,
            aquarium_id: 1,
            species: 'Guppy',
            count: 5,
            profile: 'allgemein',
          },
        ],
        measurements: [
          {
            id: 1,
            aquarium_id: 1,
            measured_at: '2024-01-02 12:00:00',
            note: 'Alte Messung',
            // Kein values Objekt, sondern separate measurement_values Tabelle
          },
        ],
        measurement_values: [
          { measurement_id: 1, param: 'ph', value: 7.4 },
          { measurement_id: 1, param: 'temp', value: 24.0 },
          { measurement_id: 1, param: 'no2', value: 0.05 },
        ],
        alerts: [
          {
            id: 1,
            aquarium_id: 1,
            measurement_id: 1,
            param: 'no2',
            level: 'warn',
            value: 0.05,
            message: 'Nitrit messbar',
            created_at: '2024-01-02 12:00:00',
          },
        ],
        // Keine aquarium_shares oder maintenance_logs
      },
    };

    // Einspielen des Legacy-Backups über /api/admin/backups/restore-upload
    const restoreRes = await env.request('/api/admin/backups/restore-upload', {
      method: 'POST',
      headers: adminHeaders,
      body: { backupData: legacyBackup },
    });
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.ok, true);
    assert.strictEqual(restoreRes.data.stats.users, 1);
    assert.strictEqual(restoreRes.data.stats.aquariums, 1);
    assert.strictEqual(restoreRes.data.stats.measurements, 1);

    // Prüfen, ob die Daten normalisiert und vollständig abrufbar sind
    const aqRes = await env.request('/api/aquariums/1', { headers: adminHeaders });
    assert.strictEqual(aqRes.status, 200);
    assert.strictEqual(aqRes.data.aquarium.name, 'Altes Becken v1');

    const measRes = await env.request('/api/aquariums/1/measurements?days=3650', { headers: adminHeaders });
    assert.strictEqual(measRes.status, 200);
    assert.strictEqual(measRes.data.length, 1);
    assert.strictEqual(measRes.data[0].values.ph, 7.4);
    assert.strictEqual(measRes.data[0].values.temp, 24.0);
    assert.strictEqual(measRes.data[0].values.no2, 0.05);

    // Prüfen, ob nach der Wiederherstellung neue Einträge reibungslos erstellt werden können
    const newMeas = await env.request('/api/aquariums/1/measurements', {
      method: 'POST',
      headers: adminHeaders,
      body: { values: { ph: 7.2 }, note: 'Neue Messung nach Migration' },
    });
    assert.strictEqual(newMeas.status, 200);

    const newMaint = await env.request('/api/aquariums/1/maintenance', {
      method: 'POST',
      headers: adminHeaders,
      body: { type: 'care', details: 'Scheiben geputzt' },
    });
    assert.strictEqual(newMaint.status, 200);
  });

  await t.test('Automatische Backups Konfiguration und Vorhalte-Pruning (Retention)', async () => {
    await env.start();

    const admin = await env.createUserAndLogin('adminuser', 'password123', 'admin@example.com');
    const adminHeaders = { Cookie: admin.cookie };
    assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers: adminHeaders, body: { password: 'backup-test-password' } })).status, 200);

    // 1. Konfiguration für automatische Backups ändern (Retention auf 2 setzen)
    const cfgRes = await env.request('/api/admin/backups/config', {
      method: 'PUT',
      headers: adminHeaders,
      body: {
        enabled: true,
        intervalHours: 12,
        retentionCount: 2,
        includeFiles: false,
      },
    });
    assert.strictEqual(cfgRes.status, 200);
    assert.strictEqual(cfgRes.data.config.enabled, true);
    assert.strictEqual(cfgRes.data.config.intervalHours, 12);
    assert.strictEqual(cfgRes.data.config.retentionCount, 2);

    // 2. Erstelle 3 Backups nacheinander
    const b1 = await env.request('/api/admin/backups/create', { method: 'POST', headers: adminHeaders });
    assert.strictEqual(b1.status, 200);

    // Warte kurz für unterschiedliche Zeitstempel
    await new Promise((r) => setTimeout(r, 1100));
    const b2 = await env.request('/api/admin/backups/create', { method: 'POST', headers: adminHeaders });
    assert.strictEqual(b2.status, 200);

    await new Promise((r) => setTimeout(r, 1100));
    const b3 = await env.request('/api/admin/backups/create', { method: 'POST', headers: adminHeaders });
    assert.strictEqual(b3.status, 200);

    // 3. Prüfen, ob durch Retention maximal 2 Backups vorrätig gehalten werden
    const listRes = await env.request('/api/admin/backups', { headers: adminHeaders });
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.data.backups.length, 2, 'Es dürfen maximal 2 Backups vorhanden sein');
    assert.strictEqual(listRes.data.backups[0].filename, b3.data.filename);

    // 4. Löschen eines Backups
    const delRes = await env.request(`/api/admin/backups/${encodeURIComponent(b3.data.filename)}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert.strictEqual(delRes.status, 200);

    const listAfterDel = await env.request('/api/admin/backups', { headers: adminHeaders });
    assert.strictEqual(listAfterDel.data.backups.length, 1);
  });
});

test('MongoDB: Backup und Restore im MongoDB-Cluster', async (t) => {
  let env;

  t.beforeEach(async () => {
    env = await createMongoTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test('Erstellt und stellt Backups vollständig in MongoDB wieder her', async () => {
    await env.start();

    const admin = await env.createUserAndLogin('mongoadmin', 'password123', 'admin@example.com');
    const adminHeaders = { Cookie: admin.cookie };
    assert.equal((await env.request('/api/admin/backups/config', { method: 'PUT', headers: adminHeaders, body: { password: 'backup-test-password' } })).status, 200);

    // Aquarium und Messung anlegen
    const aqRes = await env.request('/api/aquariums', {
      method: 'POST',
      headers: adminHeaders,
      body: { name: 'MongoDB Riffbecken', volume_l: 450, water_type: 'salt' },
    });
    assert.strictEqual(aqRes.status, 200);
    const aqId = aqRes.data.id;

    await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: adminHeaders,
      body: { values: { ca: 420, mg: 1350, no3: 5 }, note: 'Meerwassermessung' },
    });

    // Backup erstellen
    const createRes = await env.request('/api/admin/backups/create', {
      method: 'POST',
      headers: adminHeaders,
    });
    assert.strictEqual(createRes.status, 200);
    const filename = createRes.data.filename;

    // Becken löschen
    await env.request(`/api/aquariums/${aqId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });

    let listAqs = await env.request('/api/aquariums', { headers: adminHeaders });
    assert.strictEqual(listAqs.data.length, 0);

    // Restore
    const restoreRes = await env.request(`/api/admin/backups/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
      headers: adminHeaders,
    });
    assert.strictEqual(restoreRes.status, 200);

    listAqs = await env.request('/api/aquariums', { headers: adminHeaders });
    assert.strictEqual(listAqs.data.length, 1);
    assert.strictEqual(listAqs.data[0].name, 'MongoDB Riffbecken');

    const detail = await env.request(`/api/aquariums/${aqId}`, { headers: adminHeaders });
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.data.aquarium.name, 'MongoDB Riffbecken');

    const meas = await env.request(`/api/aquariums/${aqId}/measurements`, { headers: adminHeaders });
    assert.strictEqual(meas.status, 200);
    assert.strictEqual(meas.data.length, 1);
    assert.strictEqual(meas.data[0].values.ca, 420);
  });
});
