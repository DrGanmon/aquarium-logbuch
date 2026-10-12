import { asError } from '../utils/app-error';
'use strict';
import path = require('path');
import fs = require('fs');
import logger = require('../utils/logger');

const SCHEMA_VERSION_TABLE = 'schema_version';

function getBackupService() {
  return require('../services/backup-service').backupService;
}

/**
 * Ermittelt die aktuelle Versionsnummer der SQLite-Datenbank.
 * Wenn keine Versionsnummer oder Tabelle gespeichert ist, wird Version 0 angenommen.
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getCurrentVersion(db?: any) {
  if (!db) return 0;
  try {
    const tableExists = Boolean(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(SCHEMA_VERSION_TABLE)
    );
    if (!tableExists) {
      return 0;
    }
    const row = db.prepare(`SELECT MAX(version) AS max_v FROM ${SCHEMA_VERSION_TABLE}`).get();
    if (!row || row.max_v == null) {
      return 0;
    }
    const ver = Number(row.max_v);
    return Number.isFinite(ver) && ver >= 0 ? ver : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Ermittelt die aktuelle Versionsnummer einer MongoDB-Datenbank.
 * Wenn keine Versionsnummer oder Collection gespeichert ist, wird Version 0 angenommen.
 * @param {import('mongodb').Db} db
 * @returns {Promise<number>}
 */
async function getCurrentVersionMongo(db?: any) {
  if (!db || typeof db.collection !== 'function') return 0;
  try {
    const doc = await db.collection(SCHEMA_VERSION_TABLE).find().sort({ version: -1 }).limit(1).next();
    if (!doc || doc.version == null) {
      return 0;
    }
    const ver = Number(doc.version);
    return Number.isFinite(ver) && ver >= 0 ? ver : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Setzt bzw. speichert eine neue Versionsnummer in der SQLite-Datenbank.
 * @param {import('better-sqlite3').Database} db
 * @param {number} version
 * @param {string} [name]
 */
function setCurrentVersion(db?: any, version?: any, name: any = '') {
  if (!db) return;
  const ver = Number(version);
  if (!Number.isFinite(ver) || ver < 0) {
    throw new Error(`Ungültige Versionsnummer: ${version}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_VERSION_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.prepare(`
    INSERT OR REPLACE INTO ${SCHEMA_VERSION_TABLE} (version, name, applied_at)
    VALUES (?, ?, datetime('now'))
  `).run(ver, name || '');

  try {
    db.pragma(`user_version = ${Math.floor(ver)}`);
  } catch (e) {
    // ignore
  }
}

/**
 * Setzt bzw. speichert eine neue Versionsnummer in der MongoDB-Datenbank.
 * @param {import('mongodb').Db} db
 * @param {number} version
 * @param {string} [name]
 */
async function setCurrentVersionMongo(db?: any, version?: any, name: any = '') {
  if (!db || typeof db.collection !== 'function') return;
  const ver = Number(version);
  if (!Number.isFinite(ver) || ver < 0) {
    throw new Error(`Ungültige Versionsnummer: ${version}`);
  }

  await db.collection(SCHEMA_VERSION_TABLE).updateOne(
    { version: ver },
    {
      $set: {
        version: ver,
        name: name || '',
        applied_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

/**
 * Lädt alle Migrationsdateien aus dem angegebenen Verzeichnis und sortiert sie nach Version aufsteigend.
 * @param {string} [migrationsDir]
 * @returns {Array<{ version: number, name: string, up: Function, upSqlite?: Function, upMongo?: Function, down?: Function, file: string }>}
 */
function loadMigrations(migrationsDir?: any) {
  const dir = migrationsDir || path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir).filter((file: any) => file.endsWith('.js'));
  const migrations = [];

  for (const file of entries) {
    const fullPath = path.join(dir, file);
    try {
      const mod = require(fullPath);
      const versionParsed = Number.isFinite(Number(mod.version)) ? Number(mod.version) : parseInt(file.match(/^(\d+)/)?.[1] || '', 10);
      if (!Number.isFinite(versionParsed) || versionParsed < 0) {
        continue;
      }
      if (typeof mod.up !== 'function' && typeof mod.upSqlite !== 'function' && typeof mod.upMongo !== 'function') {
        continue;
      }
      migrations.push({
        version: versionParsed,
        name: mod.name || file.replace(/\.js$/, ''),
        up: mod.up,
        upSqlite: mod.upSqlite,
        upMongo: mod.upMongo,
        down: mod.down,
        file,
        path: fullPath,
      });
    } catch (caught: unknown) {
      const err = asError(caught);
      throw new Error(`Fehler beim Laden der Migration '${file}': ${err.message}`);
    }
  }

  migrations.sort((a?: any, b?: any) => a.version - b.version);
  return migrations;
}

/**
 * Vergleicht die aktuelle SQLite-Datenbankversion mit den vorhandenen Migrationen
 * und führt alle noch ausstehenden Migrationen sequenziell nacheinander aus.
 * Vor Ausführung der ersten Migration wird über den integrierten Backup-Service ein zwingendes Backup erstellt.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @param {string} [options.migrationsDir]
 * @param {string} [options.backupsDir]
 * @param {object} [options.adapter]
 * @param {boolean} [options.skipBackup]
 * @returns {Promise<{ previousVersion: number, currentVersion: number, latestVersion: number, applied: Array<{ version: number, name: string }>, backup?: object }>}
 */
async function runMigrations(db?: any, options: any = {}) {
  if (!db) {
    throw new Error('Keine gültige Datenbankverbindung übergeben.');
  }

  const migrationsDir = options.migrationsDir || path.join(__dirname, 'migrations');
  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations(migrationsDir);
  const latestVersion = migrations.length > 0 ? Math.max(...migrations.map((m: any) => m.version)) : 0;

  const applied = [];
  let backupInfo = null;

  logger.info(`Prüfe SQLite-Datenbankversion (Aktuelle Version: v${currentVersion}, Neueste verfügbare Version: v${latestVersion}, Geladene Migrationen: ${migrations.length})...`, 'db');

  // Wenn die Datenbank auf Version 0 ist (z.B. neu oder Altdatenbank ohne Versionstabelle):
  // Stelle das Basisschema (Version 0) sicher
  if (currentVersion === 0) {
    const v0 = migrations.find((m: any) => m.version === 0);
    if (v0) {
      logger.info(`Initialisiere / überprüfe Basisschema (Version 0: '${v0.name}')...`, 'db');
      if (typeof v0.upSqlite === 'function') {
        v0.upSqlite(db);
      } else if (typeof v0.up === 'function') {
        v0.up(db, { type: 'sqlite' });
      }
    }
  }

  // Führe alle Migrationen mit Version > currentVersion sequenziell aus
  const toRun = migrations.filter((m: any) => m.version > currentVersion);

  if (toRun.length > 0) {
    logger.info(`Es stehen ${toRun.length} SQLite-Migration(en) an (Upgrade von v${currentVersion} auf v${latestVersion}).`, 'db');

    // Zwingendes Backup über den integrierten BackupService vor dem Start der ersten Migration erstellen
    if (!options.skipBackup) {
      logger.info(`Erstelle zwingendes Sicherheits-Backup über den Backup-Service vor Start der ersten Migration (v${toRun[0].version})...`, 'db');
      const backupService = getBackupService();
      backupInfo = await backupService.createPreMigrationBackup({
        db,
        dbAdapter: options.adapter,
        currentVersion,
        backupsDir: options.backupsDir,
      });
    }

    for (const migration of toRun) {
      logger.info(`Starte Migration Version ${migration.version} ('${migration.name}')...`, 'db');
      if (typeof migration.upSqlite === 'function') {
        migration.upSqlite(db);
      } else if (typeof migration.up === 'function') {
        migration.up(db, { type: 'sqlite' });
      }
      // Speichere die neue Version in der Datenbank
      setCurrentVersion(db, migration.version, migration.name);
      applied.push({ version: migration.version, name: migration.name });
      logger.info(`Migration Version ${migration.version} ('${migration.name}') erfolgreich abgeschlossen.`, 'db');
    }
  } else {
    logger.info(`SQLite-Datenbank ist auf dem aktuellen Stand (Version v${currentVersion}). Keine weiteren Migrationen erforderlich.`, 'db');
  }

  const newVersion = getCurrentVersion(db);

  if (applied.length > 0) {
    logger.info(`Alle SQLite-Migrationen erfolgreich abgeschlossen. Aktuelle Schema-Version: v${newVersion}.`, 'db');
  }

  return {
    previousVersion: currentVersion,
    currentVersion: newVersion,
    latestVersion,
    applied,
    backup: backupInfo,
  };
}

/**
 * Vergleicht die aktuelle MongoDB-Datenbankversion mit den vorhandenen Migrationen,
 * migriert alle Dokumente auf das neueste Schema und führt alle ausstehenden Migrationen sequenziell aus.
 * Vor Ausführung der ersten Migration wird über den integrierten Backup-Service ein zwingendes Backup erstellt.
 * @param {import('mongodb').Db} db
 * @param {object} [options]
 * @param {string} [options.migrationsDir]
 * @param {string} [options.backupsDir]
 * @param {object} [options.adapter]
 * @param {boolean} [options.skipBackup]
 * @returns {Promise<{ previousVersion: number, currentVersion: number, latestVersion: number, applied: Array<{ version: number, name: string }>, backup?: object }>}
 */
async function runMigrationsMongo(db?: any, options: any = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('Keine gültige MongoDB-Datenbankverbindung übergeben.');
  }

  const migrationsDir = options.migrationsDir || path.join(__dirname, 'migrations');
  const currentVersion = await getCurrentVersionMongo(db);
  const migrations = loadMigrations(migrationsDir);
  const latestVersion = migrations.length > 0 ? Math.max(...migrations.map((m: any) => m.version)) : 0;

  const applied = [];
  let backupInfo = null;

  logger.info(`Prüfe MongoDB-Datenbankversion (Aktuelle Version: v${currentVersion}, Neueste verfügbare Version: v${latestVersion}, Geladene Migrationen: ${migrations.length})...`, 'db');

  // Wenn die MongoDB-Datenbank auf Version 0 ist (z.B. neu oder Altdatenbank ohne Versionstracking):
  // Führe Basisschema / v0-Migration für Mongo aus
  if (currentVersion === 0) {
    const v0 = migrations.find((m: any) => m.version === 0);
    if (v0) {
      logger.info(`Initialisiere / überprüfe MongoDB-Basisschema (Version 0: '${v0.name}')...`, 'db');
      if (typeof v0.upMongo === 'function') {
        await v0.upMongo(db);
      } else if (typeof v0.up === 'function') {
        await v0.up(db, { type: 'mongodb' });
      }
    }
  }

  // Führe alle Migrationen mit Version > currentVersion sequenziell aus
  const toRun = migrations.filter((m: any) => m.version > currentVersion);

  if (toRun.length > 0) {
    logger.info(`Es stehen ${toRun.length} MongoDB-Migration(en) an (Upgrade von v${currentVersion} auf v${latestVersion}).`, 'db');

    // Zwingendes Backup über den integrierten BackupService vor dem Start der ersten Migration erstellen
    if (!options.skipBackup) {
      logger.info(`Erstelle zwingendes Sicherheits-Backup über den Backup-Service vor Start der ersten MongoDB-Migration (v${toRun[0].version})...`, 'db');
      const backupService = getBackupService();
      backupInfo = await backupService.createPreMigrationBackup({
        db,
        dbAdapter: options.adapter,
        currentVersion,
        backupsDir: options.backupsDir,
      });
    }

    for (const migration of toRun) {
      logger.info(`Starte MongoDB-Migration Version ${migration.version} ('${migration.name}')...`, 'db');
      if (typeof migration.upMongo === 'function') {
        await migration.upMongo(db);
      } else if (typeof migration.up === 'function') {
        await migration.up(db, { type: 'mongodb' });
      }
      await setCurrentVersionMongo(db, migration.version, migration.name);
      applied.push({ version: migration.version, name: migration.name });
      logger.info(`MongoDB-Migration Version ${migration.version} ('${migration.name}') erfolgreich abgeschlossen.`, 'db');
    }
  } else {
    logger.info(`MongoDB-Datenbank ist auf dem aktuellen Stand (Version v${currentVersion}). Keine weiteren Migrationen erforderlich.`, 'db');
  }

  const newVersion = await getCurrentVersionMongo(db);

  if (applied.length > 0) {
    logger.info(`Alle MongoDB-Migrationen erfolgreich abgeschlossen. Aktuelle Schema-Version: v${newVersion}.`, 'db');
  }

  return {
    previousVersion: currentVersion,
    currentVersion: newVersion,
    latestVersion,
    applied,
    backup: backupInfo,
  };
}

export = {
  SCHEMA_VERSION_TABLE,
  getCurrentVersion,
  getCurrentVersionMongo,
  setCurrentVersion,
  setCurrentVersionMongo,
  loadMigrations,
  runMigrations,
  runMigrationsMongo,
};
