'use strict';
const path = require('path');
const fs = require('fs');

const SCHEMA_VERSION_TABLE = 'schema_version';

/**
 * Ermittelt die aktuelle Versionsnummer der SQLite-Datenbank.
 * Wenn keine Versionsnummer oder Tabelle gespeichert ist, wird Version 0 angenommen.
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function getCurrentVersion(db) {
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
async function getCurrentVersionMongo(db) {
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
function setCurrentVersion(db, version, name = '') {
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
async function setCurrentVersionMongo(db, version, name = '') {
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
function loadMigrations(migrationsDir) {
  const dir = migrationsDir || path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir).filter((file) => file.endsWith('.js'));
  const migrations = [];

  for (const file of entries) {
    const fullPath = path.join(dir, file);
    try {
      const mod = require(fullPath);
      const versionParsed = Number.isFinite(Number(mod.version)) ? Number(mod.version) : parseInt(file.match(/^(\d+)/)?.[1], 10);
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
    } catch (err) {
      throw new Error(`Fehler beim Laden der Migration '${file}': ${err.message}`);
    }
  }

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

/**
 * Vergleicht die aktuelle SQLite-Datenbankversion mit den vorhandenen Migrationen
 * und führt alle noch ausstehenden Migrationen sequenziell nacheinander aus.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @param {string} [options.migrationsDir]
 * @returns {{ previousVersion: number, currentVersion: number, latestVersion: number, applied: Array<{ version: number, name: string }> }}
 */
function runMigrations(db, options = {}) {
  if (!db) {
    throw new Error('Keine gültige Datenbankverbindung übergeben.');
  }

  const migrationsDir = options.migrationsDir || path.join(__dirname, 'migrations');
  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations(migrationsDir);
  const latestVersion = migrations.length > 0 ? Math.max(...migrations.map((m) => m.version)) : 0;

  const applied = [];

  // Wenn die Datenbank auf Version 0 ist (z.B. neu oder Altdatenbank ohne Versionstabelle):
  // Stelle das Basisschema (Version 0) sicher
  if (currentVersion === 0) {
    const v0 = migrations.find((m) => m.version === 0);
    if (v0) {
      if (typeof v0.upSqlite === 'function') {
        v0.upSqlite(db);
      } else if (typeof v0.up === 'function') {
        v0.up(db, { type: 'sqlite' });
      }
    }
  }

  // Führe alle Migrationen mit Version > currentVersion sequenziell aus
  const toRun = migrations.filter((m) => m.version > currentVersion);

  if (toRun.length > 0) {
    for (const migration of toRun) {
      // Führe Migration aus
      if (typeof migration.upSqlite === 'function') {
        migration.upSqlite(db);
      } else if (typeof migration.up === 'function') {
        migration.up(db, { type: 'sqlite' });
      }
      // Speichere die neue Version in der Datenbank
      setCurrentVersion(db, migration.version, migration.name);
      applied.push({ version: migration.version, name: migration.name });
    }
  }

  const newVersion = getCurrentVersion(db);

  return {
    previousVersion: currentVersion,
    currentVersion: newVersion,
    latestVersion,
    applied,
  };
}

/**
 * Vergleicht die aktuelle MongoDB-Datenbankversion mit den vorhandenen Migrationen,
 * migriert alle Dokumente auf das neueste Schema und führt alle ausstehenden Migrationen sequenziell aus.
 * @param {import('mongodb').Db} db
 * @param {object} [options]
 * @param {string} [options.migrationsDir]
 * @returns {Promise<{ previousVersion: number, currentVersion: number, latestVersion: number, applied: Array<{ version: number, name: string }> }>}
 */
async function runMigrationsMongo(db, options = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('Keine gültige MongoDB-Datenbankverbindung übergeben.');
  }

  const migrationsDir = options.migrationsDir || path.join(__dirname, 'migrations');
  const currentVersion = await getCurrentVersionMongo(db);
  const migrations = loadMigrations(migrationsDir);
  const latestVersion = migrations.length > 0 ? Math.max(...migrations.map((m) => m.version)) : 0;

  const applied = [];

  // Wenn die MongoDB-Datenbank auf Version 0 ist (z.B. neu oder Altdatenbank ohne Versionstracking):
  // Führe Basisschema / v0-Migration für Mongo aus
  if (currentVersion === 0) {
    const v0 = migrations.find((m) => m.version === 0);
    if (v0) {
      if (typeof v0.upMongo === 'function') {
        await v0.upMongo(db);
      } else if (typeof v0.up === 'function') {
        await v0.up(db, { type: 'mongodb' });
      }
    }
  }

  // Führe alle Migrationen mit Version > currentVersion sequenziell aus
  const toRun = migrations.filter((m) => m.version > currentVersion);

  if (toRun.length > 0) {
    for (const migration of toRun) {
      if (typeof migration.upMongo === 'function') {
        await migration.upMongo(db);
      } else if (typeof migration.up === 'function') {
        await migration.up(db, { type: 'mongodb' });
      }
      await setCurrentVersionMongo(db, migration.version, migration.name);
      applied.push({ version: migration.version, name: migration.name });
    }
  }

  const newVersion = await getCurrentVersionMongo(db);

  return {
    previousVersion: currentVersion,
    currentVersion: newVersion,
    latestVersion,
    applied,
  };
}

module.exports = {
  SCHEMA_VERSION_TABLE,
  getCurrentVersion,
  getCurrentVersionMongo,
  setCurrentVersion,
  setCurrentVersionMongo,
  loadMigrations,
  runMigrations,
  runMigrationsMongo,
};
