'use strict';
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const SqliteAdapter = require('../src/db/sqlite-adapter');
const { backupService } = require('../src/services/backup-service');
const { createMongoTestEnvironment } = require('./helpers/env');

test('Database Migrations & Backward Compatibility', async (t) => {
  const tmpDir = path.join(__dirname, '..', 'data', 'test_migrations_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  await t.test('1. Upgrade older legacy SQLite database (without dosing_pumps & new columns)', async () => {
    const legacyDbPath = path.join(tmpDir, 'legacy_v1.db');
    const rawDb = new Database(legacyDbPath);

    // Initialisiere ein altes, minimalistisches Schema aus einer früheren Version
    rawDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE aquariums (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        volume_l INTEGER,
        water_type TEXT NOT NULL DEFAULT 'fresh',
        reminder_days INTEGER NOT NULL DEFAULT 7,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE measurements (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id),
        measured_at TEXT NOT NULL,
        note TEXT
      );
      CREATE TABLE measurement_values (
        measurement_id INTEGER NOT NULL REFERENCES measurements(id),
        param TEXT NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (measurement_id, param)
      );
      CREATE TABLE maintenance_logs (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id),
        logged_at TEXT NOT NULL,
        type TEXT NOT NULL,
        percentage REAL
      );
    `);

    // Altdaten einfügen
    rawDb.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('altuser', 'hash123');
    rawDb.prepare('INSERT INTO aquariums (id, user_id, name, volume_l) VALUES (1, 1, ?, ?)').run('Alt-Becken 200L', 200);
    rawDb.prepare('INSERT INTO measurements (id, aquarium_id, measured_at, note) VALUES (1, 1, ?, ?)').run('2025-01-01 10:00:00', 'Erste Messung');
    rawDb.prepare('INSERT INTO measurement_values (measurement_id, param, value) VALUES (1, ?, ?)').run('ph', 7.2);
    rawDb.prepare('INSERT INTO maintenance_logs (id, aquarium_id, logged_at, type, percentage) VALUES (1, 1, ?, ?, ?)').run('2025-01-02 12:00:00', 'water_change', 30);
    rawDb.close();

    // Jetzt SQLite-Adapter auf der Altdatenbank initialisieren
    const adapter = new SqliteAdapter({ dbPath: legacyDbPath, dataDir: tmpDir });
    await adapter.init();

    // 1. Prüfen, dass Altdaten erhalten geblieben sind
    const user = await adapter.users.findById(1);
    assert.ok(user, 'Alter Benutzer muss vorhanden sein');
    assert.equal(user.username, 'altuser');

    const aq = await adapter.aquariums.findById(1);
    assert.ok(aq, 'Altes Aquarium muss vorhanden sein');
    assert.equal(aq.name, 'Alt-Becken 200L');

    const measList = await adapter.measurements.listForAquarium(1, { all: true });
    assert.equal(measList.length, 1);
    assert.equal(measList[0].values.ph, 7.2);

    const oldLogs = await adapter.maintenance.listForAquarium(1, { days: 1000 });
    assert.equal(oldLogs.length, 1);
    assert.equal(oldLogs[0].type, 'water_change');
    assert.equal(oldLogs[0].percentage, 30);

    // 2. Prüfen, dass neue Dosierpumpen-Funktion auf der migrierten Altdatenbank sofort funktioniert
    const pumpsBefore = await adapter.dosingPumps.listForAquarium(1);
    assert.deepEqual(pumpsBefore, []);

    const newPump = await adapter.dosingPumps.create({
      aquarium_id: 1,
      name: 'Kanal 1 - NPK',
      fertilizer_name: 'Aqua Rebell NPK',
      amount_ml: 3.5,
      interval_days: 1,
      time_of_day: '08:00',
      note: 'Tägliche Morgendosierung',
    });
    assert.ok(newPump && newPump.id);
    assert.equal(newPump.fertilizer_name, 'Aqua Rebell NPK');
    assert.equal(newPump.amount_ml, 3.5);

    // Dosierung ausführen und Logbuch-Eintrag prüfen
    const doseResult = await adapter.dosingPumps.logDosing(newPump.id, 1, 1);
    assert.ok(doseResult.success);

    // Logbuch mit Pagination prüfen
    const pagedLogs = await adapter.maintenance.getTimeline(1, { limit: 25, offset: 0, days: 1000 });
    assert.ok(pagedLogs.length >= 2);
    const dosingLog = pagedLogs.find((l) => l.type === 'dosing_pump');
    assert.ok(dosingLog, 'Dosierpumpen-Eintrag muss im Logbuch auftauchen');
    assert.match(dosingLog.details, /3\.5 ml Aqua Rebell NPK/);

    await adapter.close();
  });

  await t.test('2. Backup-Service Migration von Altdaten (v1 ohne Dosierpumpen)', async () => {
    const legacyBackup = {
      version: 1,
      appVersion: '0.9.0',
      exportedAt: '2025-01-01T00:00:00.000Z',
      data: {
        users: [
          { id: 10, username: 'backupuser', password_hash: 'hash456' },
        ],
        aquariums: [
          { id: 20, user_id: 10, name: 'Südamerika 180L', water_type: 'fresh' },
        ],
        measurements: [
          { id: 30, aquarium_id: 20, measured_at: '2025-01-01T12:00:00Z', note: 'Test' },
        ],
        measurement_values: [
          { measurement_id: 30, param: 'no3', value: 15 },
          { measurement_id: 30, param: 'po4', value: 0.8 },
        ],
        maintenance_logs: [
          { id: 40, aquarium_id: 20, logged_at: '2025-01-01T14:00:00Z', type: 'filter_clean' },
        ],
      },
      files: {},
    };

    const migrated = backupService.migrateBackupData(legacyBackup);
    assert.ok(migrated && migrated.data);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.data.users.length, 1);
    assert.equal(migrated.data.aquariums.length, 1);
    assert.equal(migrated.data.measurements.length, 1);
    assert.equal(migrated.data.measurements[0].values.no3, 15);
    assert.equal(migrated.data.measurements[0].values.po4, 0.8);
    assert.ok(Array.isArray(migrated.data.dosing_pumps), 'dosing_pumps muss als Array initialisiert sein');
    assert.equal(migrated.data.dosing_pumps.length, 0);

    // Wiederherstellung in frischer SQLite-DB testen
    const restoreDbPath = path.join(tmpDir, 'restore_test.db');
    const restoreAdapter = new SqliteAdapter({ dbPath: restoreDbPath, dataDir: tmpDir });
    await restoreAdapter.init();

    await restoreAdapter.importAllData(migrated.data);

    const user = await restoreAdapter.users.findById(10);
    assert.ok(user);
    assert.equal(user.username, 'backupuser');

    const aq = await restoreAdapter.aquariums.findById(20);
    assert.ok(aq);
    assert.equal(aq.name, 'Südamerika 180L');

    // Dosierpumpe im wiederhergestellten Altsystem anlegen
    const pump = await restoreAdapter.dosingPumps.create({
      aquarium_id: 20,
      name: 'Eisen-Pumpe',
      fertilizer_name: 'Eisen-Volldünger',
      amount_ml: 1.2,
    });
    assert.ok(pump && pump.id);

    await restoreAdapter.close();
  });

  await t.test('3. Mongo-Adapter Abwärtskompatibilität & Migration', async (subT) => {
    const mongoEnv = await createMongoTestEnvironment();
    if (!mongoEnv) {
      subT.skip('MongoDB In-Memory Server steht in dieser Umgebung nicht zur Verfügung.');
      return;
    }

    try {
      await mongoEnv.start();
      const mongoAdapter = require('../src/db');

      const testAqId = 99999;
      const pumps = await mongoAdapter.dosingPumps.listForAquarium(testAqId);
      assert.deepEqual(pumps, []);

      const created = await mongoAdapter.dosingPumps.create({
        aquarium_id: testAqId,
        name: 'Kanal A',
        fertilizer_name: 'Makro Basic Phosphat',
        amount_ml: 2.0,
        interval_days: 2,
      });
      assert.ok(created && created.id);
      assert.equal(created.fertilizer_name, 'Makro Basic Phosphat');

      const listed = await mongoAdapter.dosingPumps.listForAquarium(testAqId);
      assert.equal(listed.length, 1);

      const doseRes = await mongoAdapter.dosingPumps.logDosing(created.id, testAqId, 1);
      assert.ok(doseRes.success);

      const logs = await mongoAdapter.maintenance.getTimeline(testAqId, { limit: 10, offset: 0, days: 30 });
      assert.equal(logs.length, 1);
      assert.equal(logs[0].type, 'dosing_pump');

      // Cleanup
      await mongoAdapter.dosingPumps.delete(created.id, testAqId);
      await mongoAdapter.maintenance.delete(doseRes.log_id, testAqId);
    } finally {
      await mongoEnv.cleanup();
    }
  });
});
