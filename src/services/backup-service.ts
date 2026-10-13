import { writeJsonFile } from './json-config-store';
import { asError } from '../utils/app-error';
'use strict';
import path = require('path');
import fs = require('fs');
import zlib = require('zlib');
import { promisify } from 'util';
import envModule = require('../config/env');
const { DATA_DIR } = envModule;
import image_serviceModule = require('./image-service');
const { UPLOADS_DIR } = image_serviceModule;
import logger = require('../utils/logger');

function getDb() {
  return require('../db');
}

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const CONFIG_FILE = path.join(DATA_DIR, 'backup-config.json');

const CURRENT_SCHEMA_VERSION = 3;
const APP_VERSION = require('./version-service').getAppVersion();

const DEFAULT_CONFIG: Record<string, any> = {
  enabled: false,
  intervalHours: 24,
  retentionCount: 10,
  includeFiles: true,
  lastBackupAt: null,
  lastBackupFile: null,
};

class BackupService {
  backupsDir: string;
  configFile: string;
  schedulerTimer: ReturnType<typeof setInterval> | null;
  isBackingUp: boolean;
  isRestoring: boolean;

  constructor() {
    this.backupsDir = BACKUPS_DIR;
    this.configFile = CONFIG_FILE;
    this.schedulerTimer = null;
    this.isBackingUp = false;
    this.isRestoring = false;
    this._ensureDirs();
  }

  _ensureDirs() {
    try {
      fs.mkdirSync(this.backupsDir, { recursive: true });
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Lädt die aktuelle Backup-Konfiguration.
   */
  getConfig() {
    this._ensureDirs();
    if (!fs.existsSync(this.configFile)) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      return {
        ...DEFAULT_CONFIG,
        ...data,
        enabled: Boolean(data.enabled),
        intervalHours: Math.max(1, Math.min(720, Number(data.intervalHours) || 24)),
        retentionCount: Math.max(1, Math.min(100, Number(data.retentionCount) || 10)),
        includeFiles: data.includeFiles !== false,
      };
    } catch (caught: unknown) {
      const err = asError(caught);
      logger.error(`Fehler beim Lesen der Backup-Konfiguration: ${err.message}`, 'backup');
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Speichert die Backup-Konfiguration.
   */
  saveConfig(newConfig: any = {}) {
    this._ensureDirs();
    const current = this.getConfig();
    const merged: Record<string, any> = {
      ...current,
      ...newConfig,
      enabled: newConfig.enabled !== undefined ? Boolean(newConfig.enabled) : current.enabled,
      intervalHours: newConfig.intervalHours !== undefined
        ? Math.max(1, Math.min(720, Number(newConfig.intervalHours) || 24))
        : current.intervalHours,
      retentionCount: newConfig.retentionCount !== undefined
        ? Math.max(1, Math.min(100, Number(newConfig.retentionCount) || 10))
        : current.retentionCount,
      includeFiles: newConfig.includeFiles !== undefined
        ? Boolean(newConfig.includeFiles)
        : current.includeFiles,
    };
    writeJsonFile(this.configFile, merged);
    if (newConfig.enabled !== undefined || newConfig.intervalHours !== undefined || newConfig.retentionCount !== undefined) {
      logger.info(
        `Backup-Konfiguration aktualisiert: Aktiv=${merged.enabled}, Intervall=${merged.intervalHours}h, Vorhalteanzahl=${merged.retentionCount}`,
        'backup'
      );
    }
    return merged;
  }

  /**
   * Exportiert alle hochgeladenen Dateien als Base64-Map.
   */
  async exportFiles() {
    const files: Record<string, any> = {};
    if (!fs.existsSync(UPLOADS_DIR)) return files;
    const entries = fs.readdirSync(UPLOADS_DIR);
    for (const filename of entries) {
      const safe = path.basename(filename);
      const fullPath = path.join(UPLOADS_DIR, safe);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          const buf = fs.readFileSync(fullPath);
          files[safe] = buf.toString('base64');
        }
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.warn(`Datei ${safe} konnte nicht für Backup gelesen werden: ${err.message}`, 'backup');
      }
    }
    return files;
  }

  /**
   * Stellt Dateien aus der Base64-Map wieder her.
   */
  async importFiles(filesMap: any = {}, { clearExisting = true }: any = {}) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (clearExisting && fs.existsSync(UPLOADS_DIR)) {
      const existing = fs.readdirSync(UPLOADS_DIR);
      for (const f of existing) {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, f));
        } catch (e) {
          // ignore
        }
      }
    }

    if (!filesMap || typeof filesMap !== 'object') return;
    for (const [filename, base64Data] of Object.entries(filesMap)) {
      if (!filename || typeof base64Data !== 'string') continue;
      const safe = path.basename(filename);
      const fullPath = path.join(UPLOADS_DIR, safe);
      try {
        const buf = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(fullPath, buf);
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.error(`Fehler beim Wiederherstellen der Datei ${safe}: ${err.message}`, 'backup');
      }
    }
  }

  /**
   * Erzeugt ein vollständiges Daten-Backup-Objekt.
   */
  async generateBackupData({ includeFiles = true, dbAdapter = null, db: rawDb = null }: any = {}) {
    if (this.isRestoring) {
      throw new Error('Während einer laufenden Wiederherstellung kann kein Backup erstellt werden.');
    }

    let rawData: Record<string, any> = {};
    let dbType = 'sqlite';

    if (dbAdapter && typeof dbAdapter.exportAllData === 'function') {
      try {
        rawData = await dbAdapter.exportAllData();
        dbType = dbAdapter.type || 'sqlite';
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.warn(`Fehler beim Export über Adapter für Backup: ${err.message}`, 'backup');
      }
    } else if (rawDb) {
      if (typeof rawDb.collection === 'function') {
        dbType = 'mongodb';
        try {
          const collections = await rawDb.listCollections().toArray();
          for (const col of collections) {
            if (col.name.startsWith('system.')) continue;
            try {
              rawData[col.name] = await rawDb.collection(col.name).find().toArray();
            } catch (e) {
              rawData[col.name] = [];
            }
          }
        } catch (caught: unknown) {
          const e = asError(caught);
          logger.warn(`Fehler beim Auslesen von MongoDB-Collections für Backup: ${e.message}`, 'backup');
        }
      } else if (typeof rawDb.prepare === 'function') {
        dbType = 'sqlite';
        try {
          const tables = rawDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .all()
            .map((r: any) => r.name);
          for (const table of tables) {
            try {
              rawData[table] = rawDb.prepare(`SELECT * FROM "${table}"`).all();
            } catch (e) {
              rawData[table] = [];
            }
          }
        } catch (caught: unknown) {
          const e = asError(caught);
          logger.warn(`Fehler beim Auslesen von SQLite-Tabellen für Backup: ${e.message}`, 'backup');
        }
      }
    } else {
      const activeDb = getDb();
      if (activeDb && typeof activeDb.exportAllData === 'function') {
        try {
          rawData = await activeDb.exportAllData();
          dbType = activeDb.type || 'sqlite';
        } catch (caught: unknown) {
          const err = asError(caught);
          logger.warn(`Fehler beim Export über Default-DB für Backup: ${err.message}`, 'backup');
        }
      }
    }

    const files = includeFiles ? await this.exportFiles() : {};

    const backupPayload: Record<string, any> = {
      version: CURRENT_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      dbType,
      data: rawData,
      files,
    };

    return backupPayload;
  }

  /**
   * Erstellt ein Backup und speichert es lokal als komprimierte .json.gz Datei.
   */
  async createBackup({ isAuto = false, includeFiles = null, customFilename = null, dbAdapter = null, db: rawDb = null, backupsDir = null }: any = {}) {
    while (this.isBackingUp) {
      await new Promise((resolve: any) => setTimeout(resolve, 50));
    }
    if (this.isRestoring) throw new Error('Während einer Wiederherstellung kann kein Backup erstellt werden.');
    this.isBackingUp = true;
    try {
      this._ensureDirs();
      const targetBackupsDir = backupsDir || this.backupsDir;
      fs.mkdirSync(targetBackupsDir, { recursive: true });

      const cfg = this.getConfig();
      const shouldIncludeFiles = includeFiles !== null ? Boolean(includeFiles) : cfg.includeFiles;

      const backupData = await this.generateBackupData({ includeFiles: shouldIncludeFiles, dbAdapter, db: rawDb });
      const jsonStr = JSON.stringify(backupData);
      const gzipped = await gzipAsync(Buffer.from(jsonStr, 'utf8'));

      const now = new Date();
      const pad = (n: any) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const prefix = isAuto ? 'auto-backup' : 'manual-backup';
      const filename = customFilename || `aquarium-${prefix}-${dateStr}.json.gz`;
      const fullPath = path.join(targetBackupsDir, filename);

      fs.writeFileSync(fullPath, gzipped);

      const stat = fs.statSync(fullPath);
      logger.info(
        `Backup erfolgreich erstellt: ${filename} (${(stat.size / 1024).toFixed(1)} KB, Typ: ${isAuto ? 'Automatisch' : 'Manuell'})`,
        'backup'
      );

      // Aktualisiere Konfigurationsmetadaten
      try {
        this.saveConfig({
          lastBackupAt: now.toISOString(),
          lastBackupFile: filename,
        });
      } catch (cfgErr) {
        // ignore
      }

      // Bereinige alte Backups gemäß Retention
      await this.pruneOldBackups();

      return {
        filename,
        fullPath,
        size: stat.size,
        createdAt: now.toISOString(),
        isAuto,
        backupData,
        gzippedBuffer: gzipped,
      };
    } finally {
      this.isBackingUp = false;
    }
  }

  /**
   * Erstellt ein zwingendes Backup vor Ausführung von Datenbankmigrationen.
   */
  async createPreMigrationBackup({ dbAdapter = null, db: rawDb = null, currentVersion = 0, backupsDir = null }: any = {}) {
    const now = new Date();
    const pad = (n: any) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `aquarium-auto-backup-pre-migration-v${currentVersion}-${dateStr}.json.gz`;

    logger.info(`Erstelle zwingendes Sicherheits-Backup vor Start der ersten Migration (Ausgangsversion v${currentVersion})...`, 'backup');

    return this.createBackup({
      isAuto: true,
      includeFiles: false,
      customFilename: filename,
      dbAdapter,
      db: rawDb,
      backupsDir,
    });
  }

  /**
   * Bereinigt alte Backups, sodass maximal retentionCount Backups verbleiben.
   */
  async pruneOldBackups() {
    try {
      const cfg = this.getConfig();
      const files = this.listBackups();
      if (files.length <= cfg.retentionCount) return;

      const toDelete = files.slice(cfg.retentionCount);
      for (const item of toDelete) {
        const fullPath = path.join(this.backupsDir, item.filename);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            logger.info(`Altes Backup entfernt (Retention-Pruning): ${item.filename}`, 'backup');
          }
        } catch (caught: unknown) {
          const err = asError(caught);
          logger.warn(`Fehler beim Löschen des alten Backups ${item.filename}: ${err.message}`, 'backup');
        }
      }
    } catch (caught: unknown) {
      const err = asError(caught);
      logger.error(`Fehler beim Backup-Pruning: ${err.message}`, 'backup');
    }
  }

  /**
   * Listet alle lokal vorhandenen Backups auf.
   */
  listBackups() {
    this._ensureDirs();
    if (!fs.existsSync(this.backupsDir)) return [];

    const entries = fs.readdirSync(this.backupsDir);
    const list = [];

    for (const filename of entries) {
      if (!filename.endsWith('.json') && !filename.endsWith('.json.gz')) continue;
      const safe = path.basename(filename);
      const fullPath = path.join(this.backupsDir, safe);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          list.push({
            filename: safe,
            size: stat.size,
            sizeFormatted: this._formatSize(stat.size),
            createdAt: stat.mtime.toISOString(),
            mtimeMs: stat.mtimeMs,
            isAuto: safe.includes('auto-backup'),
          });
        }
      } catch (e) {
        // ignore
      }
    }

    // Sortiere neueste zuerst
    list.sort((a?: any, b?: any) => b.mtimeMs - a.mtimeMs);
    return list;
  }

  _formatSize(bytes?: any) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Liest ein lokales Backup und gibt den Buffer zurück.
   */
  getBackupBuffer(filename?: any) {
    const safe = path.basename(filename);
    const fullPath = path.join(this.backupsDir, safe);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Backup-Datei ${safe} nicht gefunden.`);
    }
    return fs.readFileSync(fullPath);
  }

  /**
   * Löscht eine lokale Backup-Datei.
   */
  deleteBackup(filename?: any) {
    const safe = path.basename(filename);
    const fullPath = path.join(this.backupsDir, safe);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Backup-Datei ${safe} nicht gefunden.`);
    }
    fs.unlinkSync(fullPath);
    logger.info(`Backup-Datei gelöscht: ${safe}`, 'backup');
    return true;
  }

  /**
   * Migriert und normalisiert Backup-Daten aus beliebigen früheren Versionen.
   */
  migrateBackupData(raw?: any) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Ungültiges Backup-Format: Daten müssen ein JSON-Objekt sein.');
    }

    // Falls das Backup direkt eine Tabellenstruktur ist (v1 ohne Hülle)
    let version = Number(raw.version) || 1;
    let data = raw.data || raw;
    let files = raw.files || {};

    // Standardstrukturen vorbereiten
    const users = Array.isArray(data.users) ? data.users : [];
    const aquariums = Array.isArray(data.aquariums) ? data.aquariums : [];
    const aquarium_images = Array.isArray(data.aquarium_images) ? data.aquarium_images : [];
    const aquarium_shares = Array.isArray(data.aquarium_shares) ? data.aquarium_shares : [];
    const stock = Array.isArray(data.stock) ? data.stock : [];
    let measurements = Array.isArray(data.measurements) ? data.measurements : [];
    const measurement_values = Array.isArray(data.measurement_values) ? data.measurement_values : [];
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const maintenance_logs = Array.isArray(data.maintenance_logs) ? data.maintenance_logs : [];
    const dosing_pumps = Array.isArray(data.dosing_pumps) ? data.dosing_pumps : [];

    // Migration von v1 (flache measurement_values Tabelle -> verschachteltes values Objekt in measurements)
    if (measurement_values.length > 0 && measurements.length > 0) {
      const valuesMap = new Map();
      for (const mv of measurement_values) {
        if (!mv || mv.measurement_id == null || mv.param == null) continue;
        const mid = Number(mv.measurement_id);
        if (!valuesMap.has(mid)) valuesMap.set(mid, {});
        valuesMap.get(mid)[String(mv.param)] = Number(mv.value);
      }

      measurements = measurements.map((m: any) => {
        const mid = Number(m.id);
        const existingVals = m.values && typeof m.values === 'object' ? m.values : {};
        const combined: Record<string, any> = { ...existingVals, ...(valuesMap.get(mid) || {}) };
        return { ...m, values: combined };
      });
    }

    // Normalisierung: Benutzer (users)
    const normalizedUsers = users.map((u: any) => {
      if (!u || typeof u !== 'object') return null;
      return {
        id: Number(u.id),
        username: String(u.username || '').trim(),
        email: u.email ? String(u.email).trim().toLowerCase() : null,
        password_hash: String(u.password_hash || ''),
        oidc_sub: u.oidc_sub ? String(u.oidc_sub).trim() : null,
        first_name: u.first_name ? String(u.first_name).trim() : null,
        last_name: u.last_name ? String(u.last_name).trim() : null,
        bio: u.bio ? String(u.bio).trim() : null,
        avatar_file: u.avatar_file ? path.basename(String(u.avatar_file)) : null,
        selected_suite: u.selected_suite ? String(u.selected_suite) : null,
        selected_tests: u.selected_tests ? String(u.selected_tests) : null,
        test_inventory: require('./test-inventory-service').normalizeInventory(u.test_inventory),
        email_verified: u.email_verified !== undefined ? (u.email_verified ? 1 : 0) : 1,
        email_verify_token: u.email_verify_token ? String(u.email_verify_token) : null,
        email_verify_expires: u.email_verify_expires ? Number(u.email_verify_expires) : null,
        password_reset_token: u.password_reset_token ? String(u.password_reset_token) : null,
        password_reset_expires: u.password_reset_expires ? Number(u.password_reset_expires) : null,
        created_at: u.created_at || new Date().toISOString(),
      };
    }).filter((u: any) => u && u.id && u.username);

    const validUserIds = new Set(normalizedUsers.map((u: any) => u.id));

    // Normalisierung: Aquarien (aquariums)
    const normalizedAquariums = aquariums.map((a: any) => {
      if (!a || typeof a !== 'object') return null;
      const userId = Number(a.user_id);
      if (!validUserIds.has(userId)) return null;
      return {
        id: Number(a.id),
        user_id: userId,
        name: String(a.name || 'Unbenanntes Aquarium').trim(),
        volume_l: a.volume_l != null ? Math.max(1, Number(a.volume_l)) : null,
        water_type: a.water_type === 'salt' ? 'salt' : 'fresh',
        reminder_days: Math.max(1, Number(a.reminder_days) || 7),
        notes: a.notes ? String(a.notes) : null,
        image_file: a.image_file ? path.basename(String(a.image_file)) : null,
        motto: a.motto ? String(a.motto).trim() : null,
        description: a.description ? String(a.description).trim() : null,
        measure_cycle_interval: a.measure_cycle_interval != null ? Number(a.measure_cycle_interval) : null,
        measure_cycle_unit: a.measure_cycle_unit === 'weeks' ? 'weeks' : 'days',
        measure_cycle_day_of_week: a.measure_cycle_day_of_week != null ? Number(a.measure_cycle_day_of_week) : null,
        measure_reminder_mail: a.measure_reminder_mail ? 1 : 0,
        last_measure_reminder_sent_at: a.last_measure_reminder_sent_at ? String(a.last_measure_reminder_sent_at) : null,
        fertilize_cycle_interval: a.fertilize_cycle_interval != null ? Number(a.fertilize_cycle_interval) : null,
        fertilize_cycle_unit: a.fertilize_cycle_unit === 'weeks' ? 'weeks' : 'days',
        fertilize_cycle_day_of_week: a.fertilize_cycle_day_of_week != null ? Number(a.fertilize_cycle_day_of_week) : null,
        fertilize_reminder_mail: a.fertilize_reminder_mail ? 1 : 0,
        last_fertilize_reminder_sent_at: a.last_fertilize_reminder_sent_at ? String(a.last_fertilize_reminder_sent_at) : null,
        created_at: a.created_at || new Date().toISOString(),
      };
    }).filter((a: any) => a && a.id);

    const validAquariumIds = new Set(normalizedAquariums.map((a: any) => a.id));

    // Normalisierung: Aquarium Bilder (aquarium_images)
    let aqImgIdCounter = 1;
    const normalizedAquariumImages = aquarium_images.map((ai: any) => {
      if (!ai || typeof ai !== 'object') return null;
      const aqId = Number(ai.aquarium_id);
      if (!validAquariumIds.has(aqId)) return null;
      const id = ai.id != null ? Number(ai.id) : aqImgIdCounter++;
      const filename = ai.filename ? path.basename(String(ai.filename)) : null;
      if (!filename) return null;
      return {
        id,
        aquarium_id: aqId,
        filename,
        caption: ai.caption ? String(ai.caption).trim() : null,
        is_primary: Boolean(ai.is_primary),
        created_at: ai.created_at || new Date().toISOString(),
      };
    }).filter(Boolean);

    // Normalisierung: Freigaben (aquarium_shares)
    const normalizedShares = aquarium_shares.map((s: any) => {
      if (!s || typeof s !== 'object') return null;
      const aqId = Number(s.aquarium_id);
      const userId = Number(s.user_id);
      if (!validAquariumIds.has(aqId) || !validUserIds.has(userId)) return null;
      const role = s.role === 'write' ? 'write' : 'view';
      const status = s.status === 'pending' ? 'pending' : 'accepted';
      return {
        aquarium_id: aqId,
        user_id: userId,
        role,
        status,
        token: s.token ? String(s.token) : null,
        token_expires: s.token_expires ? Number(s.token_expires) : null,
        accepted_at: s.accepted_at ? String(s.accepted_at) : null,
        created_at: s.created_at || new Date().toISOString(),
      };
    }).filter(Boolean);

    // Normalisierung: Besatz (stock)
    let stockIdCounter = 1;
    const normalizedStock = stock.map((st: any) => {
      if (!st || typeof st !== 'object') return null;
      const aqId = Number(st.aquarium_id);
      if (!validAquariumIds.has(aqId)) return null;
      const id = st.id != null ? Number(st.id) : stockIdCounter++;
      return {
        id,
        aquarium_id: aqId,
        species: String(st.species || 'Unbekannte Art').trim(),
        count: Math.max(1, Number(st.count) || 1),
        profile: String(st.profile || 'allgemein'),
        name: st.name ? String(st.name).trim() : null,
        image_file: st.image_file ? path.basename(String(st.image_file)) : null,
      };
    }).filter(Boolean);

    // Normalisierung: Messungen (measurements)
    const normalizedMeasurements = measurements.map((m: any) => {
      if (!m || typeof m !== 'object') return null;
      const aqId = Number(m.aquarium_id);
      if (!validAquariumIds.has(aqId)) return null;
      const createdBy = m.created_by != null && validUserIds.has(Number(m.created_by)) ? Number(m.created_by) : null;

      // Bereinige Werte: nur numerische Messwerte zulassen
      const rawValues = m.values && typeof m.values === 'object' ? m.values : {};
      const cleanValues: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawValues)) {
        if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
          cleanValues[k] = Number(v);
        }
      }

      return {
        id: Number(m.id),
        aquarium_id: aqId,
        measured_at: m.measured_at || new Date().toISOString(),
        note: m.note ? String(m.note) : null,
        created_by: createdBy,
        values: cleanValues,
      };
    }).filter((m: any) => m && m.id);

    const validMeasurementIds = new Set(normalizedMeasurements.map((m: any) => m.id));

    // Normalisierung: Alarme (alerts)
    let alertIdCounter = 1;
    const normalizedAlerts = alerts.map((al: any) => {
      if (!al || typeof al !== 'object') return null;
      const aqId = Number(al.aquarium_id);
      if (!validAquariumIds.has(aqId)) return null;
      const mId = al.measurement_id != null && validMeasurementIds.has(Number(al.measurement_id)) ? Number(al.measurement_id) : null;
      const id = al.id != null ? Number(al.id) : alertIdCounter++;
      return {
        id,
        aquarium_id: aqId,
        measurement_id: mId,
        param: String(al.param || 'unbekannt'),
        level: al.level === 'crit' ? 'crit' : 'warn',
        value: Number(al.value) || 0,
        message: String(al.message || 'Grenzwert überschritten'),
        created_at: al.created_at || new Date().toISOString(),
        acked_at: al.acked_at ? String(al.acked_at) : null,
      };
    }).filter(Boolean);

    // Normalisierung: Logbuch & Pflege (maintenance_logs)
    let maintIdCounter = 1;
    const normalizedMaint = maintenance_logs.map((ml: any) => {
      if (!ml || typeof ml !== 'object') return null;
      const aqId = Number(ml.aquarium_id);
      if (!validAquariumIds.has(aqId)) return null;
      const createdBy = ml.created_by != null && validUserIds.has(Number(ml.created_by)) ? Number(ml.created_by) : null;
      const id = ml.id != null ? Number(ml.id) : maintIdCounter++;
      return {
        id,
        aquarium_id: aqId,
        logged_at: ml.logged_at || new Date().toISOString(),
        type: String(ml.type || 'care'),
        percentage: ml.percentage != null ? Number(ml.percentage) : null,
        details: ml.details ? String(ml.details) : null,
        note: ml.note ? String(ml.note) : null,
        created_by: createdBy,
        created_at: ml.created_at || new Date().toISOString(),
      };
    }).filter(Boolean);

    // Normalisierung: Dosierpumpen (dosing_pumps)
    let dosingPumpIdCounter = 1;
    const normalizedDosingPumps = dosing_pumps.map((dp: any) => {
      if (!dp || typeof dp !== 'object') return null;
      const aqId = Number(dp.aquarium_id);
      if (!validAquariumIds.has(aqId)) return null;
      const id = dp.id != null ? Number(dp.id) : dosingPumpIdCounter++;
      return {
        id,
        aquarium_id: aqId,
        name: String(dp.name || 'Dosierpumpe').trim(),
        fertilizer_name: String(dp.fertilizer_name || 'Dünger').trim(),
        amount_ml: Number(dp.amount_ml) || 1,
        interval_days: Number(dp.interval_days) || 1,
        time_of_day: dp.time_of_day ? String(dp.time_of_day).trim() : null,
        last_dosed_at: dp.last_dosed_at ? String(dp.last_dosed_at) : null,
        is_active: dp.is_active !== undefined ? (dp.is_active ? 1 : 0) : 1,
        note: dp.note ? String(dp.note).trim() : null,
        created_at: dp.created_at || new Date().toISOString(),
      };
    }).filter(Boolean);

    // Social data from v3 backups; old backups have an empty public feed.
    const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    const socialPosts = (Array.isArray(data.social_posts) ? data.social_posts : []).filter((post: any) =>
      validId(post.id) && validUserIds.has(post.user_id) && typeof post.filename === 'string'
      && typeof post.text === 'string' && post.width > 0 && post.width <= 1600 && post.height > 0 && post.height <= 1600)
      .map((post: any) => ({ id: post.id, user_id: post.user_id, filename: path.basename(post.filename), width: post.width,
        height: post.height, text: post.text.slice(0, 2200), created_at: post.created_at || new Date().toISOString() }));
    const socialIds = new Set(socialPosts.map((post: any) => post.id));
    const socialComments = (Array.isArray(data.social_comments) ? data.social_comments : []).filter((comment: any) =>
      validId(comment.id) && socialIds.has(comment.post_id) && validUserIds.has(comment.user_id) && typeof comment.text === 'string')
      .map((comment: any) => ({ id: comment.id, post_id: comment.post_id, user_id: comment.user_id,
        text: comment.text.slice(0, 1000), created_at: comment.created_at || new Date().toISOString() }));
    const socialLikes = (Array.isArray(data.social_likes) ? data.social_likes : []).filter((like: any) => socialIds.has(like.post_id) && validUserIds.has(like.user_id))
      .map((like: any) => ({ post_id: like.post_id, user_id: like.user_id }));

    // Bereinige Files (Path Traversal Protection)
    const cleanFiles: Record<string, any> = {};
    if (files && typeof files === 'object') {
      for (const [fName, b64] of Object.entries(files)) {
        if (!fName || typeof b64 !== 'string') continue;
        const safeName = path.basename(fName);
        cleanFiles[safeName] = b64;
      }
    }

    return {
      version: CURRENT_SCHEMA_VERSION,
      migratedFromVersion: version,
      exportedAt: raw.exportedAt || new Date().toISOString(),
      appVersion: raw.appVersion || '1.0.0',
      data: {
        users: normalizedUsers,
        aquariums: normalizedAquariums,
        aquarium_images: normalizedAquariumImages,
        aquarium_shares: normalizedShares,
        stock: normalizedStock,
        measurements: normalizedMeasurements,
        alerts: normalizedAlerts,
        maintenance_logs: normalizedMaint,
        dosing_pumps: normalizedDosingPumps,
        social_posts: socialPosts,
        social_comments: socialComments,
        social_likes: socialLikes,
      },
      files: cleanFiles,
    };
  }

  /**
   * Stellt ein Backup (als Buffer oder Objekt) vollständig in die Datenbank und Dateiverzeichnis wieder her.
   */
  async restoreBackup(backupInput?: any) {
    if (this.isRestoring) {
      throw new Error('Eine Wiederherstellung läuft bereits.');
    }
    if (this.isBackingUp) {
      throw new Error('Während eines laufenden Backups kann keine Wiederherstellung durchgeführt werden.');
    }

    this.isRestoring = true;
    try {
      let rawObj = backupInput;
      if (Buffer.isBuffer(backupInput)) {
        // Prüfe ob GZIP (Magic Bytes 0x1f, 0x8b)
        if (backupInput.length >= 2 && backupInput[0] === 0x1f && backupInput[1] === 0x8b) {
          const unzipped = await gunzipAsync(backupInput, { maxOutputLength: 256 * 1024 * 1024 });
          rawObj = JSON.parse(unzipped.toString('utf8'));
        } else {
          rawObj = JSON.parse(backupInput.toString('utf8'));
        }
      } else if (typeof backupInput === 'string') {
        rawObj = JSON.parse(backupInput);
      }

      // Migriere & normalisiere Datenstruktur
      const normalized = this.migrateBackupData(rawObj);

      // 1. Spiele Daten in Datenbank ein
      await getDb().importAllData(normalized.data);

      // 2. Spiele zugehörige Dateien ein
      if (normalized.files && Object.keys(normalized.files).length > 0) {
        await this.importFiles(normalized.files, { clearExisting: true });
      }

      logger.info(
        `Backup erfolgreich wiederhergestellt: ${normalized.data.users.length} Benutzer, ${normalized.data.aquariums.length} Aquarien, ${normalized.data.measurements.length} Messungen, ${Object.keys(normalized.files).length} Dateien (Schema v${normalized.version})`,
        'backup'
      );

      return {
        success: true,
        stats: {
          users: normalized.data.users.length,
          aquariums: normalized.data.aquariums.length,
          aquariumImages: normalized.data.aquarium_images.length,
          shares: normalized.data.aquarium_shares.length,
          stock: normalized.data.stock.length,
          measurements: normalized.data.measurements.length,
          alerts: normalized.data.alerts.length,
          maintenanceLogs: normalized.data.maintenance_logs.length,
          files: Object.keys(normalized.files).length,
        },
      };
    } finally {
      this.isRestoring = false;
    }
  }

  /**
   * Stellt ein lokales Backup anhand des Dateinamens wieder her.
   */
  async restoreFromLocalFile(filename?: any) {
    const buf = this.getBackupBuffer(filename);
    return this.restoreBackup(buf);
  }

  /**
   * Startet den Scheduler für automatische periodische Backups.
   */
  startScheduler() {
    if (this.schedulerTimer) return;

    const checkIntervalMs = 60 * 1000; // Prüfe jede Minute
    this.schedulerTimer = setInterval(async () => {
      try {
        const cfg = this.getConfig();
        if (!cfg.enabled) return;

        const intervalMs = cfg.intervalHours * 3600 * 1000;
        const lastTime = cfg.lastBackupAt ? new Date(cfg.lastBackupAt).getTime() : 0;
        const now = Date.now();

        if (now - lastTime >= intervalMs && !this.isBackingUp && !this.isRestoring) {
          logger.info(`Automatisches Backup fällig (Intervall: ${cfg.intervalHours}h). Starte Backup...`, 'backup');
          await this.createBackup({ isAuto: true });
        }
      } catch (caught: unknown) {
        const err = asError(caught);
        logger.error(`Fehler im automatischen Backup-Scheduler: ${err.message}`, 'backup');
      }
    }, checkIntervalMs);

    if (this.schedulerTimer.unref) {
      this.schedulerTimer.unref();
    }
    logger.info('Automatischer Backup-Scheduler gestartet.', 'backup');
  }

  /**
   * Stoppt den Backup-Scheduler.
   */
  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}

const backupService = new BackupService();

export = {
  BackupService,
  backupService,
};
