'use strict';

/**
 * Migration Version 1: Einführung der Dosierpumpe und Migration von Bestandsdaten
 * Enthält die Tabelle/Collection dosing_pumps, Indizes und die Datenmigration für bestehende Aquarien und Wartungs-/Dünge-Logs.
 */
module.exports = {
  version: 1,
  name: '001_dosing_pumps',

  /**
   * Führt die Migration auf Version 1 für SQLite oder MongoDB aus.
   * @param {import('better-sqlite3').Database | import('mongodb').Db} db
   * @param {object} [context]
   */
  async up(db, context = {}) {
    if (context?.type === 'mongodb' || (db && typeof db.collection === 'function')) {
      return this.upMongo(db);
    }
    return this.upSqlite(db);
  },

  /**
   * SQLite DDL und Migration von Bestandsdaten
   * @param {import('better-sqlite3').Database} db
   */
  upSqlite(db) {
    // 1. Tabelle für Dosierpumpen anlegen
    db.exec(`
      CREATE TABLE IF NOT EXISTS dosing_pumps (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        fertilizer_name TEXT NOT NULL,
        amount_ml REAL NOT NULL,
        interval_days INTEGER NOT NULL DEFAULT 1,
        time_of_day TEXT,
        last_dosed_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_dosing_pumps_aq ON dosing_pumps(aquarium_id);
    `);

    // Spaltenabsicherung für dosing_pumps
    const hasTable = (table) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table));
    const hasColumn = (table, col) => hasTable(table) && db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

    if (hasTable('dosing_pumps')) {
      if (!hasColumn('dosing_pumps', 'name')) db.exec("ALTER TABLE dosing_pumps ADD COLUMN name TEXT NOT NULL DEFAULT 'Dosierpumpe'");
      if (!hasColumn('dosing_pumps', 'fertilizer_name')) db.exec("ALTER TABLE dosing_pumps ADD COLUMN fertilizer_name TEXT NOT NULL DEFAULT 'Dünger'");
      if (!hasColumn('dosing_pumps', 'amount_ml')) db.exec('ALTER TABLE dosing_pumps ADD COLUMN amount_ml REAL NOT NULL DEFAULT 1');
      if (!hasColumn('dosing_pumps', 'interval_days')) db.exec('ALTER TABLE dosing_pumps ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 1');
      if (!hasColumn('dosing_pumps', 'time_of_day')) db.exec('ALTER TABLE dosing_pumps ADD COLUMN time_of_day TEXT');
      if (!hasColumn('dosing_pumps', 'last_dosed_at')) db.exec('ALTER TABLE dosing_pumps ADD COLUMN last_dosed_at TEXT');
      if (!hasColumn('dosing_pumps', 'is_active')) db.exec('ALTER TABLE dosing_pumps ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
      if (!hasColumn('dosing_pumps', 'note')) db.exec('ALTER TABLE dosing_pumps ADD COLUMN note TEXT');
      if (!hasColumn('dosing_pumps', 'created_at')) db.exec("ALTER TABLE dosing_pumps ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))");
    }

    // 2. Migration der Bestandsdaten (Data Migration)
    // 2.1 Bestandsdaten in maintenance_logs: Normalisierung von Düngeeinträgen und Details
    if (hasTable('maintenance_logs')) {
      try {
        const fertilizeLogs = db.prepare("SELECT id, type, details, note FROM maintenance_logs WHERE type IN ('fertilize', 'dosing_pump')").all();
        const updateLog = db.prepare('UPDATE maintenance_logs SET details = ? WHERE id = ?');

        for (const log of fertilizeLogs) {
          if (!log.details && log.note) {
            // Falls in Altdaten Notizen mit Düngerhinweisen vorhanden sind, strukturiere Details
            try {
              const detailsObj = { note: log.note };
              updateLog.run(JSON.stringify(detailsObj), log.id);
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (err) {
        // Nicht blockierend bei Altdaten
      }
    }

    // 2.2 Bestandsdaten in aquariums: Validierung und Absicherung vorhandener Düngeeinstellungen
    if (hasTable('aquariums')) {
      try {
        db.exec(`
          UPDATE aquariums
          SET fertilize_cycle_unit = 'days'
          WHERE fertilize_cycle_unit IS NULL OR fertilize_cycle_unit = '';
        `);
        db.exec(`
          UPDATE aquariums
          SET fertilize_reminder_mail = 0
          WHERE fertilize_reminder_mail IS NULL;
        `);
        db.exec(`
          UPDATE aquariums
          SET measure_reminder_mail = 0
          WHERE measure_reminder_mail IS NULL;
        `);
      } catch (err) {
        // ignore
      }
    }

    // 2.3 Bestandsdaten in users und stock absichern
    if (hasTable('users')) {
      try {
        db.exec("UPDATE users SET language = 'de' WHERE language IS NULL OR language = '';");
      } catch (err) {
        // ignore
      }
    }

    if (hasTable('stock')) {
      try {
        db.exec("UPDATE stock SET profile = 'allgemein' WHERE profile IS NULL OR profile = '';");
        db.exec('UPDATE stock SET count = 1 WHERE count IS NULL OR count <= 0;');
      } catch (err) {
        // ignore
      }
    }
  },

  /**
   * MongoDB Migration von Bestandsdaten (Aktualisierung aller Dokumente)
   * @param {import('mongodb').Db} db
   */
  async upMongo(db) {
    // 1. Bestandsdaten in aquariums: Dünge- und Messeinstellungen absichern
    await db.collection('aquariums').updateMany(
      { $or: [{ fertilize_cycle_unit: { $exists: false } }, { fertilize_cycle_unit: null }, { fertilize_cycle_unit: '' }] },
      { $set: { fertilize_cycle_unit: 'days' } }
    );
    await db.collection('aquariums').updateMany(
      { $or: [{ fertilize_reminder_mail: { $exists: false } }, { fertilize_reminder_mail: null }] },
      { $set: { fertilize_reminder_mail: 0 } }
    );
    await db.collection('aquariums').updateMany(
      { $or: [{ measure_reminder_mail: { $exists: false } }, { measure_reminder_mail: null }] },
      { $set: { measure_reminder_mail: 0 } }
    );

    // 2. Bestandsdaten in maintenance_logs: Normalisierung von Düngeeinträgen und Details
    const fertilizeLogs = await db.collection('maintenance_logs').find({
      type: { $in: ['fertilize', 'dosing_pump'] },
      $or: [{ details: { $exists: false } }, { details: null }, { details: '' }],
      note: { $exists: true, $ne: null, $ne: '' },
    }).toArray();

    for (const log of fertilizeLogs) {
      if (log.note) {
        await db.collection('maintenance_logs').updateOne(
          { _id: log._id },
          { $set: { details: JSON.stringify({ note: log.note }) } }
        );
      }
    }

    // 3. Bestandsdaten in users und stock absichern
    await db.collection('users').updateMany(
      { $or: [{ language: { $exists: false } }, { language: null }, { language: '' }] },
      { $set: { language: 'de' } }
    );

    await db.collection('stock').updateMany(
      { $or: [{ profile: { $exists: false } }, { profile: null }, { profile: '' }] },
      { $set: { profile: 'allgemein' } }
    );
    await db.collection('stock').updateMany(
      { $or: [{ count: { $exists: false } }, { count: null }, { count: { $lte: 0 } }] },
      { $set: { count: 1 } }
    );

    // 4. dosing_pumps Collection: Vorhandene Dokumente absichern
    await db.collection('dosing_pumps').updateMany(
      { is_active: { $exists: false } },
      { $set: { is_active: 1 } }
    );
    await db.collection('dosing_pumps').updateMany(
      { interval_days: { $exists: false } },
      { $set: { interval_days: 1 } }
    );
    await db.collection('dosing_pumps').updateMany(
      { amount_ml: { $exists: false } },
      { $set: { amount_ml: 1 } }
    );
    await db.collection('dosing_pumps').updateMany(
      { fertilizer_name: { $exists: false } },
      { $set: { fertilizer_name: 'Dünger' } }
    );
    await db.collection('dosing_pumps').updateMany(
      { name: { $exists: false } },
      { $set: { name: 'Dosierpumpe' } }
    );
  },
};
