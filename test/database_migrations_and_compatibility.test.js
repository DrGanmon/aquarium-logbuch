'use strict';
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const SqliteAdapter = require('../dist/backend/src/db/sqlite-adapter');
const migrator = require('../dist/backend/src/db/migrator');
const { backupService } = require('../dist/backend/src/services/backup-service');
const logger = require('../dist/backend/src/utils/logger');
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

  await t.test('3. Mongo-Adapter Abwärtskompatibilität, Schema-Version & Dokumenten-Migration', async (subT) => {
    const mongoEnv = await createMongoTestEnvironment();
    if (!mongoEnv) {
      subT.skip('MongoDB In-Memory Server steht in dieser Umgebung nicht zur Verfügung.');
      return;
    }

    try {
      await mongoEnv.start();
      const mongoAdapter = require('../dist/backend/src/db');
      const rawDb = mongoAdapter.getRawDb();

      // 1. Schema-Version prüfen
      assert.equal(mongoAdapter.getSchemaVersion(), 2, 'MongoAdapter muss Schema-Version 2 melden');
      const v = await migrator.getCurrentVersionMongo(rawDb);
      assert.equal(v, 2, 'migrator.getCurrentVersionMongo muss Version 2 zurückgeben');

      // 2. Testen, dass Dosierpumpen auf Mongo einwandfrei funktionieren
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

      // 3. Dokumenten-Migration von Bestandsdaten in MongoDB testen
      // Setze Schema-Version zurück auf 0, um den Upgrade-Prozess einer Altdatenbank zu simulieren
      await rawDb.collection('schema_version').deleteMany({});
      assert.equal(await migrator.getCurrentVersionMongo(rawDb), 0, 'Ohne Versionseintrag muss MongoDB Version 0 melden');

      // Füge unvollständige Altdaten direkt in MongoDB ein (wie aus alter MongoDB-Version vor Migrationen)
      await rawDb.collection('users').insertOne({ id: 888, username: 'mongo_legacy_user', password_hash: 'hash' });
      await rawDb.collection('aquariums').insertOne({ id: 888, user_id: 888, name: 'Legacy Nano' });
      await rawDb.collection('stock').insertOne({ id: 888, aquarium_id: 888, species: 'Garnelen' });
      await rawDb.collection('maintenance_logs').insertOne({ id: 888, aquarium_id: 888, logged_at: '2025-01-01T10:00:00Z', type: 'fertilize', note: '5ml NPK Dünger' });

      // Führe Migrationen auf MongoDB explizit aus (v0 -> v1)
      const mongoMigRes = await migrator.runMigrationsMongo(rawDb);
      assert.equal(mongoMigRes.previousVersion, 0);
      assert.equal(mongoMigRes.currentVersion, 2);

      // Verifiziere, dass alle Dokumente in MongoDB nun die erforderlichen Felder besitzen
      const legacyUserDoc = await rawDb.collection('users').findOne({ id: 888 });
      assert.equal(legacyUserDoc.language, 'de', 'Users-Dokument muss language besitzen');
      assert.equal(legacyUserDoc.email_verified, 1, 'Users-Dokument muss email_verified besitzen');
      assert.equal(legacyUserDoc.email, null);

      const legacyAqDoc = await rawDb.collection('aquariums').findOne({ id: 888 });
      assert.equal(legacyAqDoc.water_type, 'fresh');
      assert.equal(legacyAqDoc.fertilize_cycle_unit, 'days');
      assert.equal(legacyAqDoc.fertilize_reminder_mail, 0);
      assert.equal(legacyAqDoc.measure_reminder_mail, 0);

      const legacyStockDoc = await rawDb.collection('stock').findOne({ id: 888 });
      assert.equal(legacyStockDoc.profile, 'allgemein');
      assert.equal(legacyStockDoc.count, 1);

      const legacyLogDoc = await rawDb.collection('maintenance_logs').findOne({ id: 888 });
      assert.ok(legacyLogDoc.details, 'Maintenance log details muss migriert worden sein');
      assert.match(legacyLogDoc.details, /5ml NPK Dünger/);

      // 4. Sequenzielle MongoDB-Migrationen mit benutzerdefiniertem Migrationsordner testen
      await rawDb.collection('schema_version').deleteMany({});
      const customMongoMigDir = path.join(tmpDir, 'custom_mongo_migrations');
      fs.mkdirSync(customMongoMigDir, { recursive: true });

      fs.writeFileSync(
        path.join(customMongoMigDir, '001_initial.js'),
        `module.exports = {
          version: 1,
          name: '001_initial',
          async upMongo(db) {
            await db.collection('test_mongo_col').insertOne({ key: 'init' });
          }
        };`
      );

      fs.writeFileSync(
        path.join(customMongoMigDir, '002_add_field.js'),
        `module.exports = {
          version: 2,
          name: '002_add_field',
          async upMongo(db) {
            await db.collection('test_mongo_col').updateMany({}, { $set: { migrated_v2: true } });
          }
        };`
      );

      // Migrationen in isolierter MongoDB Collection ausführen
      const customMigRes = await migrator.runMigrationsMongo(rawDb, { migrationsDir: customMongoMigDir });
      assert.equal(customMigRes.previousVersion, 0);
      assert.equal(customMigRes.currentVersion, 2);
      assert.equal(customMigRes.latestVersion, 2);
      assert.deepEqual(
        customMigRes.applied.map((a) => a.version),
        [1, 2],
        'Migrationen 1 und 2 müssen sequenziell auf MongoDB ausgeführt worden sein'
      );

      const testColDoc = await rawDb.collection('test_mongo_col').findOne({ key: 'init' });
      assert.ok(testColDoc);
      assert.equal(testColDoc.migrated_v2, true, 'Dokument in MongoDB muss durch v2 Migration aktualisiert worden sein');

      // Cleanup
      await mongoAdapter.dosingPumps.delete(created.id, testAqId);
      await mongoAdapter.maintenance.delete(doseRes.log_id, testAqId);
      await rawDb.collection('users').deleteOne({ id: 888 });
      await rawDb.collection('aquariums').deleteOne({ id: 888 });
      await rawDb.collection('stock').deleteOne({ id: 888 });
      await rawDb.collection('maintenance_logs').deleteOne({ id: 888 });
      await rawDb.collection('test_mongo_col').drop().catch(() => {});
    } finally {
      await mongoEnv.cleanup();
    }
  });

  await t.test('4. Dateibasiertes Versions- & Migrationssystem (v0 Schema, v1 Dosing Pumps & Bestandsdaten-Migration)', async () => {
    const migDbPath = path.join(tmpDir, 'migration_test.db');
    const rawDb = new Database(migDbPath);

    // 1. Wenn keine Nummer gespeichert ist, wird Version 0 angenommen
    assert.equal(migrator.getCurrentVersion(rawDb), 0, 'Ohne Versionstabelle/Eintrag muss Version 0 zurückgegeben werden');

    // 2. Migrationen ausführen (Default: v0 -> v1 aus src/db/migrations/001_dosing_pumps.js)
    const runRes = await migrator.runMigrations(rawDb);
    assert.equal(runRes.previousVersion, 0);
    assert.equal(runRes.currentVersion, 2);
    assert.equal(runRes.latestVersion, 2);
    assert.equal(runRes.applied.length, 2);
    assert.equal(runRes.applied[0].version, 1);
    assert.equal(runRes.applied[0].name, '001_dosing_pumps');
    assert.equal(runRes.applied[1].name, '002_test_inventory');
    assert.ok(rawDb.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'test_inventory'));

    // Versionsnummer nach Migration prüfen
    assert.equal(migrator.getCurrentVersion(rawDb), 2);
    const verRow = rawDb.prepare('SELECT version, name, applied_at FROM schema_version WHERE version = 1').get();
    assert.ok(verRow, 'schema_version Tabelle muss Version 1 enthalten');
    assert.equal(verRow.version, 1);
    assert.ok(verRow.applied_at);

    // 3. Erneuter Start: Version vergleichen und nichts erneut ausführen
    const runResAgain = await migrator.runMigrations(rawDb);
    assert.equal(runResAgain.previousVersion, 2);
    assert.equal(runResAgain.currentVersion, 2);
    assert.equal(runResAgain.applied.length, 0, 'Bereits migrierte Versionen dürfen nicht erneut ausgeführt werden');

    rawDb.close();

    // 4. SqliteAdapter Schema-Version-Methode und Bestandsdatenmigration testen
    const adapter = new SqliteAdapter({ dbPath: migDbPath, dataDir: tmpDir });
    await adapter.init();
    assert.equal(adapter.getSchemaVersion(), 2, 'Adapter muss aktuelle Schema-Version 2 melden');
    await adapter.close();

    // 5. Test mit Altdatenbank auf v0 mit Bestandsdaten (Dünge-Logs und Aquarien), die auf v1 migriert werden
    const legacyBestandDbPath = path.join(tmpDir, 'legacy_bestand.db');
    const bestandDb = new Database(legacyBestandDbPath);

    // Initialisiere v0 Schema direkt
    const baseMigration = require('../dist/backend/src/db/migrations/000_base_schema');
    baseMigration.up(bestandDb);

    // Füge Bestandsdaten ein (vor Dosierpumpe)
    bestandDb.prepare("INSERT INTO users (id, username, password_hash, language) VALUES (1, 'tester', 'hash', NULL)").run();
    bestandDb.prepare("INSERT INTO aquariums (id, user_id, name, fertilize_cycle_unit) VALUES (1, 1, 'Pflanzenbecken', NULL)").run();
    bestandDb.prepare("INSERT INTO stock (id, aquarium_id, species) VALUES (1, 1, 'Neons')").run();
    bestandDb.prepare("INSERT INTO maintenance_logs (id, aquarium_id, logged_at, type, note) VALUES (1, 1, '2025-01-01 10:00:00', 'fertilize', 'Eisen-Volldünger 5ml')").run();

    // Führe Migration auf v1 aus
    const bestandMigRes = await migrator.runMigrations(bestandDb);
    assert.equal(bestandMigRes.previousVersion, 0);
    assert.equal(bestandMigRes.currentVersion, 2);

    // Prüfe Bestandsdatenmigration
    const updatedUser = bestandDb.prepare('SELECT language FROM users WHERE id = 1').get();
    assert.equal(updatedUser.language, 'de', 'Sprache muss standardisiert worden sein');

    const updatedAq = bestandDb.prepare('SELECT fertilize_cycle_unit, fertilize_reminder_mail FROM aquariums WHERE id = 1').get();
    assert.equal(updatedAq.fertilize_cycle_unit, 'days');
    assert.equal(updatedAq.fertilize_reminder_mail, 0);

    const updatedStock = bestandDb.prepare('SELECT count, profile FROM stock WHERE id = 1').get();
    assert.equal(updatedStock.count, 1);
    assert.equal(updatedStock.profile, 'allgemein');

    const updatedLog = bestandDb.prepare('SELECT details FROM maintenance_logs WHERE id = 1').get();
    assert.ok(updatedLog.details, 'Log details müssen migriert worden sein');
    assert.match(updatedLog.details, /Eisen-Volldünger 5ml/);

    bestandDb.close();

    // 5. Test mit dynamischem Multi-File-Migrationsordner (v1 -> v2 -> v3)
    const customMigDir = path.join(tmpDir, 'custom_migrations');
    fs.mkdirSync(customMigDir, { recursive: true });

    fs.writeFileSync(
      path.join(customMigDir, '001_step_one.js'),
      `module.exports = {
        version: 1,
        name: '001_step_one',
        up(db) {
          db.exec('CREATE TABLE test_table_a (id INTEGER PRIMARY KEY, title TEXT)');
        }
      };`
    );

    fs.writeFileSync(
      path.join(customMigDir, '002_step_two.js'),
      `module.exports = {
        version: 2,
        name: '002_step_two',
        up(db) {
          db.exec('CREATE TABLE test_table_b (id INTEGER PRIMARY KEY, count INTEGER)');
        }
      };`
    );

    fs.writeFileSync(
      path.join(customMigDir, '003_step_three.js'),
      `module.exports = {
        version: 3,
        name: '003_step_three',
        up(db) {
          db.exec('ALTER TABLE test_table_b ADD COLUMN note TEXT');
        }
      };`
    );

    const stepDbPath = path.join(tmpDir, 'step_migration.db');
    const stepDb = new Database(stepDbPath);

    // Initial v0
    assert.equal(migrator.getCurrentVersion(stepDb), 0);

    // Sequenzielle Ausführung aller 3 Migrationen
    const stepRes = await migrator.runMigrations(stepDb, { migrationsDir: customMigDir });
    assert.equal(stepRes.previousVersion, 0);
    assert.equal(stepRes.currentVersion, 3);
    assert.equal(stepRes.latestVersion, 3);
    assert.deepEqual(
      stepRes.applied.map((a) => a.version),
      [1, 2, 3],
      'Migrationen 1, 2 und 3 müssen sequenziell ausgeführt worden sein'
    );

    // Tabellenstrukturen prüfen
    stepDb.prepare('INSERT INTO test_table_a (id, title) VALUES (1, ?)').run('Test A');
    stepDb.prepare('INSERT INTO test_table_b (id, count, note) VALUES (1, ?, ?)').run(42, 'Notiz');

    const rowA = stepDb.prepare('SELECT * FROM test_table_a WHERE id = 1').get();
    const rowB = stepDb.prepare('SELECT * FROM test_table_b WHERE id = 1').get();
    assert.equal(rowA.title, 'Test A');
    assert.equal(rowB.count, 42);
    assert.equal(rowB.note, 'Notiz');

    // Schrittweise Migration: DB auf v1 setzen, dann auf v3 aktualisieren
    const partialDbPath = path.join(tmpDir, 'partial_migration.db');
    const partialDb = new Database(partialDbPath);
    partialDb.exec('CREATE TABLE test_table_a (id INTEGER PRIMARY KEY, title TEXT)');
    migrator.setCurrentVersion(partialDb, 1, 'manual_v1');
    assert.equal(migrator.getCurrentVersion(partialDb), 1);

    const partialRes = await migrator.runMigrations(partialDb, { migrationsDir: customMigDir });
    assert.equal(partialRes.previousVersion, 1);
    assert.equal(partialRes.currentVersion, 3);
    assert.deepEqual(
      partialRes.applied.map((a) => a.version),
      [2, 3],
      'Nur noch ausstehende Migrationen (2 und 3) dürfen ausgeführt werden'
    );

    stepDb.close();
    partialDb.close();
  });

  await t.test('6. Mandatory pre-migration backup & info logging (SQLite)', async () => {
    const backupTestDir = path.join(tmpDir, 'backup_test_sqlite');
    const backupsDir = path.join(backupTestDir, 'backups');
    fs.mkdirSync(backupTestDir, { recursive: true });

    const testDbPath = path.join(backupTestDir, 'pre_mig_test.db');
    const db = new Database(testDbPath);

    // Initialisiere Basistabelle und Daten vor Migration
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
      INSERT INTO users (id, username) VALUES (1, 'backup_user');
    `);

    // Führe Migration aus mit speziellem backupsDir
    const migRes = await migrator.runMigrations(db, { backupsDir });
    assert.equal(migRes.currentVersion, 2);
    assert.ok(migRes.backup, 'Ein Backup-Objekt muss bei Migrationen zurückgegeben werden');
    assert.ok(fs.existsSync(migRes.backup.fullPath), 'Die Backup-Datei muss existieren');
    assert.match(migRes.backup.filename, /^aquarium-auto-backup-pre-migration-v0-/);

    // Prüfe Inhalt des Gzip-Backups
    const zlib = require('zlib');
    const backupContent = fs.readFileSync(migRes.backup.fullPath);
    const unzipped = zlib.gunzipSync(backupContent).toString('utf8');
    const backupJson = JSON.parse(unzipped);
    assert.equal(backupJson.dbType, 'sqlite');
    assert.ok(Array.isArray(backupJson.data.users));
    assert.equal(backupJson.data.users[0].username, 'backup_user');

    // Prüfe Logs
    const recentLogs = logger.readRecentLogs(50).join('\n');
    assert.match(recentLogs, /Prüfe SQLite-Datenbankversion/);
    assert.match(recentLogs, /Erstelle zwingendes Sicherheits-Backup über den Backup-Service/);
    assert.match(recentLogs, /Migration Version 1 .* erfolgreich abgeschlossen/);

    db.close();
  });

  await t.test('7. Mandatory pre-migration backup & info logging (MongoDB)', async () => {
    const MongoAdapter = require('../dist/backend/src/db/mongo-adapter');
    const mongoEnv = await createMongoTestEnvironment('mongo_migration_backup_log_test');
    if (!mongoEnv) return;

    try {
      const mongoAdapter = new MongoAdapter({ uri: mongoEnv.getMongoUri(), dbName: 'mongo_backup_log_db' });
      await mongoAdapter.init();
      const rawDb = mongoAdapter.getRawDb();

      const mongoBackupDir = path.join(tmpDir, 'mongo_backups');
      fs.mkdirSync(mongoBackupDir, { recursive: true });

      // Vorab Altdaten in Collection einfügen und Version auf 0 zurücksetzen
      await rawDb.collection('schema_version').deleteMany({});
      await rawDb.collection('users').insertOne({ id: 99, username: 'mongo_backup_user' });

      // Migration ausführen mit benutzerdefiniertem backupsDir
      const migRes = await migrator.runMigrationsMongo(rawDb, { backupsDir: mongoBackupDir, adapter: mongoAdapter });
      assert.equal(migRes.currentVersion, 2);
      assert.ok(migRes.backup, 'Backup-Objekt muss bei Mongo-Migration vorhanden sein');
      assert.ok(fs.existsSync(migRes.backup.fullPath), 'Mongo-Backup-Datei muss existieren');

      // Inhalt des Mongo-Backups prüfen
      const zlib = require('zlib');
      const backupContent = fs.readFileSync(migRes.backup.fullPath);
      const unzipped = zlib.gunzipSync(backupContent).toString('utf8');
      const backupJson = JSON.parse(unzipped);
      assert.equal(backupJson.dbType, 'mongodb');
      assert.ok(Array.isArray(backupJson.data.users));
      assert.equal(backupJson.data.users[0].username, 'mongo_backup_user');

      // Prüfe Logs
      const recentLogs = logger.readRecentLogs(50).join('\n');
      assert.match(recentLogs, /Prüfe MongoDB-Datenbankversion/);
      assert.match(recentLogs, /Erstelle zwingendes Sicherheits-Backup über den Backup-Service/);
      assert.match(recentLogs, /MongoDB-Migration Version 1 .* erfolgreich abgeschlossen/);

      await mongoAdapter.close();
    } finally {
      await mongoEnv.cleanup();
    }
  });
});
