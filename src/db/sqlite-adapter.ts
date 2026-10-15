import { AI_PROVIDERS, encryptPersonalAiFields } from '../services/ai-token-crypto';
import encryptedAiTokensMigration = require('./migrations/007_encrypted_ai_tokens');
import { PlantRepository } from './plant-repository';
import { SocialRepository } from "./social-repository";
import { NotificationRepository } from "./notification-repository";
import { buildAdminMetrics, normalizeAiUsage } from './admin-metrics';
import type { UserRecord, Aquarium, AccessRole, StockRecord, Measurement, DosingPump, AquariumImage, AquariumShare, Invitation } from '../types/domain';
import type { SqliteConnection } from '../types/database-driver';
import type { RepositoryContract, UserQueries, AquariumQueries, StockRepository, PumpRepository, MeasurementQueries } from '../types/repositories';
import type { DatabaseOptions } from '../types/domain';
import path = require('path');
import fs = require('fs');
import Database = require('better-sqlite3');
import envModule = require('../config/env');
const { DATA_DIR } = envModule;
import cfg = require('../config/app-config');
import aquarium_serviceModule = require('../services/aquarium-service');
const { isOverdue } = aquarium_serviceModule;
import reminder_serviceModule = require('../services/reminder-service');
const { calculateCycleStatus } = reminder_serviceModule;
import image_serviceModule = require('../services/image-service');
const { deleteImage } = image_serviceModule;
import migratorModule = require('./migrator');
const { runMigrations, getCurrentVersion } = migratorModule;

class SqliteAdapter {
  readonly type: 'sqlite';
  dataDir: string;
  dbPath: string;
  /** Dynamic rows/documents are validated by services; schemas differ across adapters. */
  db: SqliteConnection | null;
  _initialized: boolean;
  _initPromise: Promise<this> | null = null;
  users!: RepositoryContract<ReturnType<SqliteAdapter['build_users']>, UserQueries>;
  sessions!: ReturnType<SqliteAdapter['build_sessions']>;
  aquariums!: RepositoryContract<ReturnType<SqliteAdapter['build_aquariums']>, AquariumQueries>;
  aquariumImages!: ReturnType<SqliteAdapter['build_aquariumImages']>;
  shares!: ReturnType<SqliteAdapter['build_shares']>;
  plants!: PlantRepository;
  stock!: RepositoryContract<ReturnType<SqliteAdapter['build_stock']>, StockRepository>;
  measurements!: RepositoryContract<ReturnType<SqliteAdapter['build_measurements']>, MeasurementQueries>;
  alerts!: ReturnType<SqliteAdapter['build_alerts']>;
  maintenance!: ReturnType<SqliteAdapter['build_maintenance']>;
  invitations!: ReturnType<SqliteAdapter['build_invitations']>;
  aquariumChats!: ReturnType<SqliteAdapter['build_aquariumChats']>;
  social!: SocialRepository;
  notifications!: NotificationRepository;
  dosingPumps!: RepositoryContract<ReturnType<SqliteAdapter['build_dosingPumps']>, PumpRepository>;

  constructor(options: DatabaseOptions = {}) {
    this.type = 'sqlite';
    this.dataDir = options.dataDir || DATA_DIR;
    this.dbPath = options.dbPath || path.join(this.dataDir, 'aquarium.db');
    this.db = null;
    this._initialized = false;
  }

  async init(): Promise<this> {
    if (this._initialized && this.db) return this;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        if (this.dbPath !== ':memory:') {
          fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        }
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');

        // Führe alle anstehenden Migrationen sequenziell aus
        await runMigrations(this.db, { adapter: this, dbPath: this.dbPath });

        encryptedAiTokensMigration.upSqlite(this.db);
        this._setupRepositories();
        this._initialized = true;
        return this;
      } catch (error) {
        this.db?.close();
        this.db = null;
        this._initialized = false;
        throw error;
      } finally {
        this._initPromise = null;
      }
    })();

    return this._initPromise;
  }

  getSchemaVersion() {
    if (!this.db) return 0;
    return getCurrentVersion(this.db);
  }

  async getAdminMetrics() {
    const db = this.connection();
    const count = (table: string) => Number(db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()?.total || 0);
    const users = count('users');
    const verifiedUsers = Number(db.prepare('SELECT COUNT(*) AS total FROM users WHERE email_verified = 1').get()?.total || 0);
    const animals = Number(db.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM stock').get()?.total || 0);
    const activeSessions = Number(db.prepare('SELECT COUNT(*) AS total FROM sessions WHERE expires_at > ?').get(Date.now())?.total || 0);
    const usageRows = db.prepare('SELECT provider, input_tokens, output_tokens, total_tokens, request_count FROM ai_usage_metrics').all();
    return buildAdminMetrics({ users, verifiedUsers, aquariums: count('aquariums'), measurements: count('measurements'),
      logbookEntries: count('maintenance_logs'), socialPosts: count('social_posts'), animals, activeSessions }, usageRows);
  }

  async recordAiUsage(provider: string, usage: unknown) {
    const normalized = normalizeAiUsage(provider, usage);
    if (!normalized) return false;
    this.connection().prepare(`INSERT INTO ai_usage_metrics (provider, input_tokens, output_tokens, total_tokens, request_count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(provider) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens, total_tokens = total_tokens + excluded.total_tokens,
      request_count = request_count + 1, updated_at = excluded.updated_at`).run(provider, normalized.inputTokens,
      normalized.outputTokens, normalized.totalTokens, new Date().toISOString());
    return true;
  }

  async close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
    }
    this._initialized = false;
  }

  getRawDb() {
    return this.db;
  }

  private connection(): SqliteConnection {
    if (!this.db) throw new Error('Datenbank ist nicht initialisiert.');
    return this.db;
  }

  _setupRepositories() {
    this.connection();

    this.users = this.build_users();

    this.sessions = this.build_sessions();



    this.aquariums = this.build_aquariums();

    this.aquariumImages = this.build_aquariumImages();

    this.shares = this.build_shares();

    this.stock = this.build_stock();
    this.plants = new PlantRepository(this.type, this.connection());

    this.measurements = this.build_measurements();

    this.alerts = this.build_alerts();

    this.maintenance = this.build_maintenance();

    this.invitations = this.build_invitations();

    this.aquariumChats = this.build_aquariumChats();

    this.dosingPumps = this.build_dosingPumps();
    this.social = new SocialRepository(this.type, this.connection());
    this.notifications = new NotificationRepository(this.type, this.connection());
  }

  async exportAllData() {
    if (!this._initialized && !this.db) await this.init();
    const db = this.connection();

    const safeGetAll = (table?: any, order: any = 'id ASC') => {
      try {
        const exists = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table));
        if (!exists) return [];
        return db.prepare(`SELECT * FROM "${table}" ORDER BY ${order}`).all();
      } catch {
        return [];
      }
    };

    const users = safeGetAll('users', 'id ASC');
    const aquariums = safeGetAll('aquariums', 'id ASC');
    const aquarium_images = safeGetAll('aquarium_images', 'id ASC');
    const aquarium_shares = safeGetAll('aquarium_shares', 'aquarium_id ASC, user_id ASC');
    const stock = safeGetAll('stock', 'id ASC');
    const rawMeasurements = safeGetAll('measurements', 'id ASC');
    const rawValues = safeGetAll('measurement_values', 'measurement_id ASC, param ASC');
    const alerts = safeGetAll('alerts', 'id ASC');
    const maintenance_logs = safeGetAll('maintenance_logs', 'id ASC');
    const invitations = safeGetAll('invitations', 'id ASC');
    const aquarium_chats = safeGetAll('aquarium_chats', 'id ASC');
    const dosing_pumps = safeGetAll('dosing_pumps', 'id ASC');

    const valuesByMId = new Map();
    for (const row of rawValues) {
      if (!valuesByMId.has(row.measurement_id)) valuesByMId.set(row.measurement_id, {});
      valuesByMId.get(row.measurement_id)[row.param] = row.value;
    }

    const measurements = rawMeasurements.map((m: any) => ({
      id: m.id,
      aquarium_id: m.aquarium_id,
      measured_at: m.measured_at,
      note: m.note,
      created_by: m.created_by,
      values: valuesByMId.get(m.id) || {},
    }));

    return {
      users,
      aquariums,
      aquarium_images,
      aquarium_shares,
      stock,
      aquarium_plants: safeGetAll('aquarium_plants', 'aquarium_id ASC, plant_id ASC'),
      measurements,
      alerts,
      maintenance_logs,
      invitations,
      aquarium_chats,
      dosing_pumps,
      social_posts: safeGetAll('social_posts'),
      social_comments: safeGetAll('social_comments'),
      social_likes: safeGetAll('social_likes', 'post_id ASC, user_id ASC'),
      social_notifications: safeGetAll('social_notifications', 'id ASC'),
      ai_usage_metrics: safeGetAll('ai_usage_metrics', 'provider ASC'),
    };
  }

  async importAllData(data: any = {}) {
    if (!this._initialized) await this.init();
    const db = this.connection();

    // Validate/encrypt before destructive restore; legacy plaintext backups are upgraded here.
    const users = (Array.isArray(data.users) ? data.users : []).map((user: UserRecord) => encryptPersonalAiFields(user.id, user));
    const aquariums = Array.isArray(data.aquariums) ? data.aquariums : [];
    const aquarium_images = Array.isArray(data.aquarium_images) ? data.aquarium_images : [];
    const shares = Array.isArray(data.aquarium_shares) ? data.aquarium_shares : [];
    const stock = Array.isArray(data.stock) ? data.stock : [];
    const measurements = Array.isArray(data.measurements) ? data.measurements : [];
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const maintenance = Array.isArray(data.maintenance_logs) ? data.maintenance_logs : [];
    const invitations = Array.isArray(data.invitations) ? data.invitations : [];
    const chats = Array.isArray(data.aquarium_chats) ? data.aquarium_chats : [];
    const dosing_pumps = Array.isArray(data.dosing_pumps) ? data.dosing_pumps : [];
    const aiUsage = Array.isArray(data.ai_usage_metrics) ? data.ai_usage_metrics : [];
    const socialNotifications = Array.isArray(data.social_notifications) ? data.social_notifications : [];

    const validUserIds = new Set(users.map((u: any) => u.id));
    const currentSessions = db.prepare('SELECT * FROM sessions WHERE expires_at > ?').all(Date.now());

    const runImport = db.transaction(() => {
      db.pragma('foreign_keys = OFF');

      this.notifications.clear();
      this.social.clearSqlite();
      db.exec('DELETE FROM dosing_pumps');
      db.exec('DELETE FROM aquarium_chats');
      db.exec('DELETE FROM invitations');
      db.exec('DELETE FROM alerts');
      db.exec('DELETE FROM measurement_values');
      db.exec('DELETE FROM measurements');
      db.exec('DELETE FROM maintenance_logs');
      db.exec('DELETE FROM aquarium_plants');
      db.exec('DELETE FROM stock');
      db.exec('DELETE FROM aquarium_images');
      db.exec('DELETE FROM aquarium_shares');
      db.exec('DELETE FROM aquariums');
      db.exec('DELETE FROM sessions');
      db.exec('DELETE FROM users');
      db.exec('DELETE FROM ai_usage_metrics');

      // Users
      const insertUser = db.prepare(`
        INSERT INTO users (id, username, password_hash, email, oidc_sub, first_name, last_name, bio, avatar_file, selected_suite, selected_tests, default_graph_range, email_verified, email_verify_token, email_verify_expires, password_reset_token, password_reset_expires, created_at, is_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of users) {
        insertUser.run(
          u.id,
          u.username,
          u.password_hash || '',
          u.email || null,
          u.oidc_sub || null,
          u.first_name || null,
          u.last_name || null,
          u.bio || null,
          u.avatar_file || null,
          u.selected_suite || null,
          u.selected_tests || null,
          u.default_graph_range || null,
          u.email_verified !== undefined ? (u.email_verified ? 1 : 0) : 1,
          u.email_verify_token || null,
          u.email_verify_expires || null,
          u.password_reset_token || null,
          u.password_reset_expires || null,
          u.created_at || new Date().toISOString(),
          u.is_admin ? 1 : 0
        );
        db.prepare('UPDATE users SET test_inventory = ?, terms_version = ?, terms_accepted_at = ? WHERE id = ?').run(u.test_inventory || '{}', u.terms_version || null, u.terms_accepted_at || null, u.id);
        for (const provider of AI_PROVIDERS) db.prepare(`UPDATE users SET ${provider}_api_key = ?, ${provider}_api_key_prefix = ?, ${provider}_api_key_suffix = ?, ${provider}_model = ? WHERE id = ?`).run(u[`${provider}_api_key`] || null, u[`${provider}_api_key_prefix`] || null, u[`${provider}_api_key_suffix`] || null, u[`${provider}_model`] || null, u.id);
        db.prepare('UPDATE users SET ai_provider = ? WHERE id = ?').run(u.ai_provider || null, u.id);
      }

      // Aktive Sessions für vorhandene Benutzer wiederherstellen
      const insertSession = db.prepare(
        'INSERT OR IGNORE INTO sessions (token_hash, user_id, expires_at, id_token) VALUES (?, ?, ?, ?)'
      );
      for (const s of currentSessions) {
        if (validUserIds.has(s.user_id)) {
          insertSession.run(s.token_hash, s.user_id, s.expires_at, s.id_token || null);
        }
      }

      // Aquariums
      const insertAq = db.prepare(`
        INSERT INTO aquariums (
          id, user_id, name, volume_l, water_type, reminder_days, notes, image_file, motto, description,
          measure_cycle_interval, measure_cycle_unit, measure_cycle_day_of_week, measure_reminder_mail, last_measure_reminder_sent_at,
          fertilize_cycle_interval, fertilize_cycle_unit, fertilize_cycle_day_of_week, fertilize_reminder_mail, last_fertilize_reminder_sent_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of aquariums) {
        insertAq.run(
          a.id,
          a.user_id,
          a.name,
          a.volume_l != null ? a.volume_l : null,
          a.water_type || 'fresh',
          a.reminder_days || 7,
          a.notes || null,
          a.image_file || null,
          a.motto || null,
          a.description || null,
          a.measure_cycle_interval != null ? a.measure_cycle_interval : null,
          a.measure_cycle_unit || 'days',
          a.measure_cycle_day_of_week != null ? a.measure_cycle_day_of_week : null,
          a.measure_reminder_mail ? 1 : 0,
          a.last_measure_reminder_sent_at || null,
          a.fertilize_cycle_interval != null ? a.fertilize_cycle_interval : null,
          a.fertilize_cycle_unit || 'days',
          a.fertilize_cycle_day_of_week != null ? a.fertilize_cycle_day_of_week : null,
          a.fertilize_reminder_mail ? 1 : 0,
          a.last_fertilize_reminder_sent_at || null,
          a.created_at || new Date().toISOString()
        );
      }

      // Aquarium Images
      const insertAqImg = db.prepare(`
        INSERT INTO aquarium_images (id, aquarium_id, filename, caption, is_primary, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const ai of aquarium_images) {
        insertAqImg.run(
          ai.id,
          ai.aquarium_id,
          ai.filename,
          ai.caption || null,
          ai.is_primary ? 1 : 0,
          ai.created_at || new Date().toISOString()
        );
      }

      // Shares
      const insertShare = db.prepare(`
        INSERT INTO aquarium_shares (aquarium_id, user_id, role, status, token, token_expires, accepted_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of shares) {
        insertShare.run(
          s.aquarium_id,
          s.user_id,
          s.role || 'view',
          s.status || 'accepted',
          s.token || null,
          s.token_expires || null,
          s.accepted_at || null,
          s.created_at || new Date().toISOString()
        );
      }

      // Stock
      const insertStock = db.prepare(`
        INSERT INTO stock (id, aquarium_id, species, count, profile, name, image_file)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const st of stock) {
        insertStock.run(st.id, st.aquarium_id, st.species, st.count || 1, st.profile || 'allgemein', st.name || null, st.image_file || null);
      }

      // Measurements & Values
      const insertMeas = db.prepare(`
        INSERT INTO measurements (id, aquarium_id, measured_at, note, created_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertVal = db.prepare(`
        INSERT INTO measurement_values (measurement_id, param, value)
        VALUES (?, ?, ?)
      `);

      for (const m of measurements) {
        insertMeas.run(m.id, m.aquarium_id, m.measured_at, m.note || null, m.created_by || null);
        if (m.values && typeof m.values === 'object') {
          for (const [p, v] of Object.entries(m.values)) {
            if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
              insertVal.run(m.id, p, Number(v));
            }
          }
        }
      }

      // Alerts
      const insertAlert = db.prepare(`
        INSERT INTO alerts (id, aquarium_id, measurement_id, param, level, value, message, created_at, acked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const al of alerts) {
        insertAlert.run(
          al.id,
          al.aquarium_id,
          al.measurement_id || null,
          al.param,
          al.level || 'warn',
          al.value || 0,
          al.message || '',
          al.created_at || new Date().toISOString(),
          al.acked_at || null
        );
      }

      // Maintenance Logs
      const insertMaint = db.prepare(`
        INSERT INTO maintenance_logs (id, aquarium_id, logged_at, type, percentage, details, note, created_by, created_at, automation_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ml of maintenance) {
        insertMaint.run(
          ml.id,
          ml.aquarium_id,
          ml.logged_at,
          ml.type,
          ml.percentage != null ? ml.percentage : null,
          ml.details || null,
          ml.note || null,
          ml.created_by || null,
          ml.created_at || new Date().toISOString(), ml.automation_key || null
        );
      }

      // Invitations
      const insertInv = db.prepare(`
        INSERT INTO invitations (id, code, type, email, created_by, max_uses, used_count, expires_at, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const inv of invitations) {
        insertInv.run(
          inv.id,
          inv.code,
          inv.type || 'code',
          inv.email || null,
          inv.created_by || null,
          inv.max_uses != null ? inv.max_uses : 1,
          inv.used_count != null ? inv.used_count : 0,
          Number(inv.expires_at),
          inv.note || null,
          inv.created_at || new Date().toISOString()
        );
      }

      // Aquarium Chats
      const insertChat = db.prepare(`
        INSERT INTO aquarium_chats (id, aquarium_id, user_id, role, content, provider, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of chats) {
        if (c && c.aquarium_id) {
          insertChat.run(
            c.id,
            c.aquarium_id,
            c.user_id || null,
            c.role || 'user',
            c.content || '',
            c.provider || null,
            c.model || null,
            c.created_at || new Date().toISOString()
          );
        }
      }

      // Dosing Pumps
      const insertDosingPump = db.prepare(`
        INSERT INTO dosing_pumps (id, aquarium_id, name, fertilizer_name, amount_ml, interval_days, time_of_day, last_dosed_at, is_active, note, created_at, mode, reminder_mail, last_reminder_sent_at, schedule_started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const dp of dosing_pumps) {
        if (dp && dp.aquarium_id) {
          insertDosingPump.run(
            dp.id,
            dp.aquarium_id,
            dp.name || 'Dosierpumpe',
            dp.fertilizer_name || 'Dünger',
            Number(dp.amount_ml) || 1,
            Number(dp.interval_days) || 1,
            dp.time_of_day || null,
            dp.last_dosed_at || null,
            dp.is_active !== undefined ? (dp.is_active ? 1 : 0) : 1,
            dp.note || null,
            dp.created_at || new Date().toISOString(), dp.mode === 'manual' ? 'manual' : 'automatic', dp.reminder_mail ? 1 : 0, dp.last_reminder_sent_at || null, dp.schedule_started_at || new Date().toISOString()
          );
        }
      }

      for (const plant of data.aquarium_plants || []) {
        db.prepare('INSERT INTO aquarium_plants (aquarium_id, plant_id, count) VALUES (?, ?, ?)').run(plant.aquarium_id, plant.plant_id, plant.count);
      }
      this.social.importSqliteData(data);
      this.notifications.importData(socialNotifications);
      const insertUsage = db.prepare('INSERT INTO ai_usage_metrics (provider, input_tokens, output_tokens, total_tokens, request_count, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const row of aiUsage) {
        if (!['openai', 'gemini', 'claude'].includes(row?.provider)) continue;
        const value = (count: unknown) => Number.isSafeInteger(Number(count)) && Number(count) >= 0 ? Number(count) : 0;
        insertUsage.run(row.provider, value(row.input_tokens), value(row.output_tokens), value(row.total_tokens), value(row.request_count),
          typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString());
      }
      db.pragma('foreign_keys = ON');
    });

    runImport();
    return true;
  }

  private build_users() {
    const db = this.connection();
    const self = this;
    return {
      async findById(id?: any) {
        if (!id) return null;
        return db.prepare<UserRecord>('SELECT * FROM users WHERE id = ?').get(id) || null;
      },
      async findByUsername(username?: any, excludeId: any = null) {
        if (!username) return null;
        if (excludeId != null) {
          return db.prepare<UserRecord>('SELECT * FROM users WHERE username = ? AND id != ?').get(username, excludeId) || null;
        }
        return db.prepare<UserRecord>('SELECT * FROM users WHERE username = ?').get(username) || null;
      },
      async findByEmail(email?: any, excludeId: any = null) {
        if (!email) return null;
        if (excludeId != null) {
          return db.prepare<UserRecord>('SELECT * FROM users WHERE email = ? AND id != ?').get(email, excludeId) || null;
        }
        return db.prepare<UserRecord>('SELECT * FROM users WHERE email = ?').get(email) || null;
      },
      async findByOidcSub(oidcSub?: any, excludeId: any = null) {
        if (!oidcSub) return null;
        if (excludeId != null) {
          return db.prepare<UserRecord>('SELECT * FROM users WHERE oidc_sub = ? AND id != ?').get(oidcSub, excludeId) || null;
        }
        return db.prepare<UserRecord>('SELECT * FROM users WHERE oidc_sub = ?').get(oidcSub) || null;
      },
      async findByEmailVerifyToken(token?: any) {
        if (!token) return null;
        return db.prepare<UserRecord>('SELECT * FROM users WHERE email_verify_token = ?').get(token) || null;
      },
      async findByPasswordResetToken(token?: any) {
        if (!token) return null;
        return db.prepare<UserRecord>('SELECT * FROM users WHERE password_reset_token = ?').get(token) || null;
      },
      async findByDeleteToken(token?: any) {
        if (!token) return null;
        return db.prepare<UserRecord>('SELECT * FROM users WHERE account_delete_token = ?').get(token) || null;
      },
      async create({
        username,
        password_hash = '',
        email = null,
        oidc_sub = null,
        email_verified = 0,
        email_verify_token = null,
        email_verify_expires = null,
        password_reset_token = null,
        password_reset_expires = null,
        language = 'de',
        terms_version = null, terms_accepted_at = null, is_admin = 0,
      }: any) {
        const info = db
          .prepare(
            'INSERT INTO users (username, password_hash, email, oidc_sub, email_verified, email_verify_token, email_verify_expires, password_reset_token, password_reset_expires, language, terms_version, terms_accepted_at, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            username,
            password_hash,
            email,
            oidc_sub,
            email_verified ? 1 : 0,
            email_verify_token,
            email_verify_expires,
            password_reset_token,
            password_reset_expires,
            language === 'en' ? 'en' : 'de', terms_version, terms_accepted_at, is_admin ? 1 : 0
          );
        const id = Number(info.lastInsertRowid);
        return {
          id,
          username,
          email,
          oidc_sub,
          email_verified: email_verified ? 1 : 0,
          email_verify_token,
          email_verify_expires,
          language: language === 'en' ? 'en' : 'de', terms_version, terms_accepted_at, is_admin: is_admin ? 1 : 0,
        };
      },
      async mutateTestInventory(id?: any, mutate?: any) {
        return db.transaction(() => {
          const user = db.prepare<UserRecord>('SELECT * FROM users WHERE id = ?').get(id);
          if (!user) return null;
          const inventory = JSON.parse(user.test_inventory || '{}');
          const result = mutate(inventory, user);
          db.prepare('UPDATE users SET test_inventory = ? WHERE id = ?').run(JSON.stringify(inventory), id);
          return { inventory, user, result };
        }).immediate();
      },
      async update(id: number, fields: Partial<UserRecord> = {}, expected: Partial<UserRecord> = {}) {
        fields = encryptPersonalAiFields(Number(id), fields);
        const setClauses = [];
        const params = [];
        const allowed = [
          'username',
          'first_name',
          'last_name',
          'bio',
          'email',
          'password_hash',
          'oidc_sub',
          'avatar_file',
          'selected_suite',
          'selected_tests',
          'default_graph_range',
          'email_verified',
          'email_verify_token',
          'email_verify_expires',
          'password_reset_token',
          'password_reset_expires',
          'account_delete_token',
          'account_delete_expires',
          ...AI_PROVIDERS.flatMap(provider => [`${provider}_api_key_prefix`, `${provider}_api_key_suffix`]),
          'openai_api_key',
          'openai_model',
          'gemini_api_key',
          'gemini_model',
          'claude_api_key',
          'claude_model',
          'ai_provider',
          'language', 'terms_version', 'terms_accepted_at', 'is_admin',
        ];

        for (const k of allowed) {
          if (fields[k as keyof UserRecord] !== undefined) {
            setClauses.push(`${k} = ?`);
            let val = fields[k as keyof UserRecord];
            if (k === 'email_verified' || k === 'is_admin') val = val ? 1 : 0;
            params.push(val);
          }
        }

        if (setClauses.length === 0) return true;
        params.push(id);
        const conditions = Object.entries(expected).map(([key, value]) => {
          if (!allowed.includes(key)) throw new Error('Ungültige Benutzer-Bedingung.');
          params.push(value);
          return `${key} IS ?`;
        });
        const res = db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?${conditions.length ? ' AND ' + conditions.join(' AND ') : ''}`).run(...params);
        return res.changes > 0;
      },
      async delete(id?: any) {
        const numId = Number(id);
        const user = db.prepare<UserRecord>('SELECT * FROM users WHERE id = ?').get(numId);
        if (!user) return false;
        await require('../services/backup-service').backupService.purgeUserImages(user);
        await self.social.deleteUser(numId);
        if (user && user.avatar_file) {
          deleteImage(user.avatar_file, true);
        }
        const userAqs = db.prepare<Aquarium>('SELECT id FROM aquariums WHERE user_id = ?').all(numId);
        for (const aq of userAqs) {
          await self.aquariums.delete(aq.id, true);
        }
        db.prepare('DELETE FROM aquarium_shares WHERE user_id = ?').run(numId);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(numId);
        db.prepare('UPDATE maintenance_logs SET created_by = NULL WHERE created_by = ?').run(numId);
        db.prepare('UPDATE measurements SET created_by = NULL WHERE created_by = ?').run(numId);
        const res = db.prepare('DELETE FROM users WHERE id = ?').run(numId);
        return res.changes > 0;
      },
      async listForAdmin() {
        return db
          .prepare<UserRecord>(
            `
          SELECT u.id, u.username, u.email, u.oidc_sub, u.password_hash, u.created_at, u.email_verified, u.is_admin,
                 COUNT(a.id) AS aquarium_count
          FROM users u
          LEFT JOIN aquariums a ON a.user_id = u.id
          GROUP BY u.id
          ORDER BY u.created_at ASC, u.id ASC
        `
          )
          .all();
      },
      async count() {
        return db.prepare('SELECT COUNT(*) as n FROM users').get()?.n ?? 0;
      },
    };
  }

  private build_sessions() {
    const db = this.connection();

    return {
      async create(tokenHash?: any, userId?: any, expiresAt?: any, idToken: any = null) {
        db.prepare(
          'INSERT INTO sessions (token_hash, user_id, expires_at, id_token) VALUES (?, ?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at, id_token = excluded.id_token'
        ).run(tokenHash, userId, expiresAt, idToken);
      },
      async find(tokenHash?: any) {
        if (!tokenHash) return null;
        return (
          db
            .prepare(
              `
          SELECT s.token_hash, s.user_id, s.expires_at, s.id_token, u.username, u.email, u.email_verified, u.language, u.is_admin
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?
        `
            )
            .get(tokenHash) || null
        );
      },
      async delete(tokenHash?: any) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      },
      async deleteForUser(userId?: any) {
        if (!userId) return;
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      },
      async cleanExpired() {
        db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      },
    };
  }

  private build_aquariums() {
    const db = this.connection();
    const self = this;
    return {
      async listForUser(userId?: any) {
        const ownRows = db
          .prepare<Aquarium>(
            `
          SELECT a.*, u.username as owner_username, 'owner' as role
          FROM aquariums a
          JOIN users u ON u.id = a.user_id
          WHERE a.user_id = ?
          ORDER BY a.name
        `
          )
          .all(userId);

        const sharedRows = db
          .prepare<AquariumShare>(
            `
          SELECT a.*, u.username as owner_username, s.role as role
          FROM aquarium_shares s
          JOIN aquariums a ON a.id = s.aquarium_id
          JOIN users u ON u.id = a.user_id
          WHERE s.user_id = ? AND (s.status = 'accepted' OR s.status IS NULL)
          ORDER BY a.name
        `
          )
          .all(userId);

        const all = [...ownRows, ...sharedRows];
        return all.map((aq: any) => self.aquariums.getSummary(aq, aq.role));
      },
      async findById(id?: any) {
        const numId = Number(id);
        if (!Number.isInteger(numId)) return null;
        return (
          db
            .prepare<Aquarium>(
              `
          SELECT a.*, u.username AS owner_username, u.email AS owner_email
          FROM aquariums a
          JOIN users u ON u.id = a.user_id
          WHERE a.id = ?
        `
            )
            .get(numId) || null
        );
      },
      async create({
        user_id,
        name,
        volume_l = null,
        water_type = 'fresh',
        reminder_days = 7,
        notes = null,
        motto = null,
        description = null,
        measure_cycle_interval = null,
        measure_cycle_unit = 'days',
        measure_cycle_day_of_week = null,
        measure_reminder_mail = 0,
        fertilize_cycle_interval = null,
        fertilize_cycle_unit = 'days',
        fertilize_cycle_day_of_week = null,
        fertilize_reminder_mail = 0,
      }: any) {
        const info = db
          .prepare(
            `INSERT INTO aquariums (
              user_id, name, volume_l, water_type, reminder_days, notes, motto, description,
              measure_cycle_interval, measure_cycle_unit, measure_cycle_day_of_week, measure_reminder_mail,
              fertilize_cycle_interval, fertilize_cycle_unit, fertilize_cycle_day_of_week, fertilize_reminder_mail
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            user_id,
            name,
            volume_l,
            water_type,
            reminder_days,
            notes,
            motto,
            description,
            measure_cycle_interval,
            measure_cycle_unit,
            measure_cycle_day_of_week,
            measure_reminder_mail,
            fertilize_cycle_interval,
            fertilize_cycle_unit,
            fertilize_cycle_day_of_week,
            fertilize_reminder_mail
          );
        return { id: Number(info.lastInsertRowid) };
      },
      async update(id?: any, fields: any = {}) {
        const setClauses = [];
        const params = [];
        const allowed = [
          'name',
          'volume_l',
          'water_type',
          'reminder_days',
          'notes',
          'image_file',
          'motto',
          'description',
          'measure_cycle_interval',
          'measure_cycle_unit',
          'measure_cycle_day_of_week',
          'measure_reminder_mail',
          'last_measure_reminder_sent_at',
          'fertilize_cycle_interval',
          'fertilize_cycle_unit',
          'fertilize_cycle_day_of_week',
          'fertilize_reminder_mail',
          'last_fertilize_reminder_sent_at',
        ];

        for (const k of allowed) {
          if (fields[k] !== undefined) {
            setClauses.push(`${k} = ?`);
            params.push(fields[k]);
          }
        }

        if (setClauses.length === 0) return true;
        params.push(id);
        const res = db.prepare(`UPDATE aquariums SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
        return res.changes > 0;
      },
      async listAllRaw() {
        return db.prepare<Aquarium>('SELECT * FROM aquariums ORDER BY id ASC').all();
      },
      async updateReminderSent(id: number, type: 'measure' | 'fertilize', timestamp: string | null, expected?: string | null) {
        const col = type === 'measure' ? 'last_measure_reminder_sent_at' : 'last_fertilize_reminder_sent_at';
        const res = expected === undefined
          ? db.prepare(`UPDATE aquariums SET ${col} = ? WHERE id = ?`).run(timestamp, Number(id))
          : db.prepare(`UPDATE aquariums SET ${col} = ? WHERE id = ? AND ${col} IS ?`).run(timestamp, Number(id), expected);
        return res.changes > 0;
      },
      async updateImage(id?: any, filename?: any) {
        const res = db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(filename, id);
        return res.changes > 0;
      },
      async delete(id?: any, strictImages = false) {
        const numId = Number(id);
        const aq = db.prepare<Aquarium>('SELECT image_file FROM aquariums WHERE id = ?').get(numId);
        const images = db.prepare<AquariumImage>('SELECT filename FROM aquarium_images WHERE aquarium_id = ?').all(numId);
        const stocks = db.prepare<StockRecord>('SELECT image_file FROM stock WHERE aquarium_id = ?').all(numId);
        if (strictImages) {
          deleteImage(aq?.image_file, true);
          for (const image of images) deleteImage(image.filename, true);
          for (const stock of stocks) deleteImage(stock.image_file, true);
        }
        const res = db.prepare('DELETE FROM aquariums WHERE id = ?').run(numId);
        if (!res.changes) return false;
        deleteImage(aq?.image_file);
        for (const img of images) deleteImage(img.filename);
        for (const stock of stocks) deleteImage(stock.image_file);
        return true;
      },
      async countForUser(userId?: any) {
        return db.prepare('SELECT COUNT(*) as n FROM aquariums WHERE user_id = ?').get(userId)?.n ?? 0;
      },
      async getAccess(aquariumId: number | string, user: { id: number; isAdmin?: boolean }): Promise<{ aq: Aquarium; role: AccessRole } | null> {
        const id = Number(aquariumId);
        if (!Number.isInteger(id)) return null;
        const aq = await self.aquariums.findById(id);
        if (!aq) return null;

        if (aq.user_id === user.id) {
          return { aq, role: 'owner' };
        }
        const share = await self.shares.find(id, user.id);
        if (share && (share.status === 'accepted' || !share.status)) {
          return { aq, role: share.role };
        }
        if (user.isAdmin) {
          return { aq, role: 'owner' };
        }
        return null;
      },
      getSummary(aq?: any, role: any = null) {
        const last = db.prepare<Measurement>('SELECT measured_at FROM measurements WHERE aquarium_id = ? ORDER BY measured_at DESC LIMIT 1').get(aq.id);
        const lastWaterChange = db
          .prepare("SELECT logged_at, percentage FROM maintenance_logs WHERE aquarium_id = ? AND type = 'water_change' ORDER BY logged_at DESC LIMIT 1")
          .get(aq.id);
        const lastMaintenance = db.prepare('SELECT logged_at, type FROM maintenance_logs WHERE aquarium_id = ? ORDER BY logged_at DESC LIMIT 1').get(aq.id);
        const lastFertilize = db.prepare("SELECT logged_at, details, note FROM maintenance_logs WHERE aquarium_id = ? AND type IN ('fertilize', 'dosing_pump') ORDER BY logged_at DESC LIMIT 1").get(aq.id);
        const alerts = db.prepare(`SELECT level, COUNT(*) n FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL GROUP BY level`).all(aq.id);
        const crit = alerts.find((a: any) => a.level === 'crit')?.n || 0;
        const warn = alerts.find((a: any) => a.level === 'warn')?.n || 0;
        const sharesCount = db.prepare("SELECT COUNT(*) as n FROM aquarium_shares WHERE aquarium_id = ? AND (status = 'accepted' OR status IS NULL)").get(aq.id)?.n || 0;
        const imagesCount = db.prepare('SELECT COUNT(*) as n FROM aquarium_images WHERE aquarium_id = ?').get(aq.id)?.n || 0;

        const measureCycleStatus = calculateCycleStatus(
          {
            interval: aq.measure_cycle_interval,
            unit: aq.measure_cycle_unit,
            day_of_week: aq.measure_cycle_day_of_week,
            reminder_mail: aq.measure_reminder_mail,
          },
          last ? last.measured_at : null,
          aq.created_at
        );

        const fertilizeCycleStatus = calculateCycleStatus(
          {
            interval: aq.fertilize_cycle_interval,
            unit: aq.fertilize_cycle_unit,
            day_of_week: aq.fertilize_cycle_day_of_week,
            reminder_mail: aq.fertilize_reminder_mail,
          },
          lastFertilize ? lastFertilize.logged_at : null,
          aq.created_at
        );

        return {
          ...aq,
          role: role || aq.role || 'owner',
          owner_username: aq.owner_username || null,
          has_image: !!aq.image_file || imagesCount > 0,
          image_url: aq.image_file ? `api/aquariums/${aq.id}/image` : null,
          images_count: imagesCount,
          motto: aq.motto || null,
          description: aq.description || null,
          shares_count: sharesCount,
          last_measured_at: last ? last.measured_at : null,
          last_water_change_at: lastWaterChange ? lastWaterChange.logged_at : null,
          last_water_change_percent: lastWaterChange ? lastWaterChange.percentage : null,
          last_maintenance_at: lastMaintenance ? lastMaintenance.logged_at : null,
          last_maintenance_type: lastMaintenance ? lastMaintenance.type : null,
          last_fertilized_at: lastFertilize ? lastFertilize.logged_at : null,
          open_crit: crit,
          open_warn: warn,
          overdue: isOverdue(aq, last) || (measureCycleStatus.configured && measureCycleStatus.is_due),
          measure_cycle_status: measureCycleStatus,
          fertilize_cycle_status: fertilizeCycleStatus,
          fertilize_overdue: fertilizeCycleStatus.configured && fertilizeCycleStatus.is_due,
        };
      },
    };
  }

  private build_aquariumImages() {
    const db = this.connection();

    return {
      async listForAquarium(aquariumId?: any) {
        const numId = Number(aquariumId);
        const rows = db.prepare<AquariumImage>('SELECT * FROM aquarium_images WHERE aquarium_id = ? ORDER BY is_primary DESC, id ASC').all(numId);
        return rows.map((r: any) => ({
          ...r,
          is_primary: Boolean(r.is_primary),
          url: `api/aquariums/${numId}/images/${r.id}`,
        }));
      },
      async findById(id?: any) {
        const row = db.prepare<AquariumImage>('SELECT * FROM aquarium_images WHERE id = ?').get(Number(id));
        if (!row) return null;
        return {
          ...row,
          is_primary: Boolean(row.is_primary),
          url: `api/aquariums/${row.aquarium_id}/images/${row.id}`,
        };
      },
      async create({ aquarium_id, filename, caption = null, is_primary = 0 }: any) {
        const numAqId = Number(aquarium_id);
        const count = db.prepare('SELECT COUNT(*) as n FROM aquarium_images WHERE aquarium_id = ?').get(numAqId)?.n ?? 0;
        const makePrimary = is_primary ? 1 : count === 0 ? 1 : 0;
        if (makePrimary) {
          db.prepare('UPDATE aquarium_images SET is_primary = 0 WHERE aquarium_id = ?').run(numAqId);
          db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(filename, numAqId);
        }
        const info = db
          .prepare('INSERT INTO aquarium_images (aquarium_id, filename, caption, is_primary) VALUES (?, ?, ?, ?)')
          .run(numAqId, filename, caption, makePrimary);
        return { id: Number(info.lastInsertRowid), filename, caption, is_primary: Boolean(makePrimary) };
      },
      async setPrimary(id?: any, aquariumId?: any) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = db.prepare<AquariumImage>('SELECT * FROM aquarium_images WHERE id = ? AND aquarium_id = ?').get(numId, numAqId);
        if (!img) return false;
        db.prepare('UPDATE aquarium_images SET is_primary = 0 WHERE aquarium_id = ?').run(numAqId);
        db.prepare('UPDATE aquarium_images SET is_primary = 1 WHERE id = ?').run(numId);
        db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(img.filename, numAqId);
        return true;
      },
      async updateCaption(id?: any, aquariumId?: any, caption?: any) {
        const res = db.prepare('UPDATE aquarium_images SET caption = ? WHERE id = ? AND aquarium_id = ?').run(caption, Number(id), Number(aquariumId));
        return res.changes > 0;
      },
      async delete(id?: any, aquariumId?: any) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = db.prepare<AquariumImage>('SELECT * FROM aquarium_images WHERE id = ? AND aquarium_id = ?').get(numId, numAqId);
        if (!img) return false;
        deleteImage(img.filename);
        const res = db.prepare('DELETE FROM aquarium_images WHERE id = ?').run(numId);
        const nextImg = db.prepare<AquariumImage>('SELECT * FROM aquarium_images WHERE aquarium_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1').get(numAqId);
        if (nextImg) {
          if (!nextImg.is_primary) {
            db.prepare('UPDATE aquarium_images SET is_primary = 1 WHERE id = ?').run(nextImg.id);
          }
          db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(nextImg.filename, numAqId);
        } else {
          db.prepare('UPDATE aquariums SET image_file = NULL WHERE id = ?').run(numAqId);
        }
        return res.changes > 0;
      },
      async deleteAllForAquarium(aquariumId?: any) {
        const numAqId = Number(aquariumId);
        const rows = db.prepare<AquariumImage>('SELECT filename FROM aquarium_images WHERE aquarium_id = ?').all(numAqId);
        for (const r of rows) {
          deleteImage(r.filename);
        }
        db.prepare('DELETE FROM aquarium_images WHERE aquarium_id = ?').run(numAqId);
      },
    };
  }

  private build_shares() {
    const db = this.connection();

    return {
      async listForAquarium(aquariumId?: any) {
        return db
          .prepare<AquariumShare>(
            `
          SELECT s.aquarium_id, s.user_id, s.role, s.status, s.token, s.token_expires, s.created_at, s.accepted_at, u.username, u.email
          FROM aquarium_shares s
          JOIN users u ON u.id = s.user_id
          WHERE s.aquarium_id = ?
          ORDER BY s.created_at ASC
        `
          )
          .all(Number(aquariumId));
      },
      async listPendingForUser(userId?: any) {
        return db
          .prepare<AquariumShare>(
            `
          SELECT s.aquarium_id, s.user_id, s.role, s.status, s.token, s.token_expires, s.created_at,
                 a.name AS aquarium_name, a.water_type, a.volume_l,
                 u.username AS owner_username, u.email AS owner_email
          FROM aquarium_shares s
          JOIN aquariums a ON a.id = s.aquarium_id
          JOIN users u ON u.id = a.user_id
          WHERE s.user_id = ? AND s.status = 'pending'
          ORDER BY s.created_at DESC
        `
          )
          .all(Number(userId));
      },
      async find(aquariumId?: any, userId?: any) {
        return db.prepare<AquariumShare>('SELECT * FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?').get(Number(aquariumId), Number(userId)) || null;
      },
      async findByToken(token?: any) {
        if (!token) return null;
        return (
          db
            .prepare<AquariumShare>(
              `
          SELECT s.*,
                 a.name AS aquarium_name, a.water_type, a.volume_l,
                 u.username AS owner_username, u.email AS owner_email,
                 target_user.username AS target_username, target_user.email AS target_email
          FROM aquarium_shares s
          JOIN aquariums a ON a.id = s.aquarium_id
          JOIN users u ON u.id = a.user_id
          JOIN users target_user ON target_user.id = s.user_id
          WHERE s.token = ?
        `
            )
            .get(String(token)) || null
        );
      },
      async upsert(aquariumId?: any, userId?: any, role?: any, status: any = 'pending', token: any = null, tokenExpires: any = null) {
        db.prepare(
          `
          INSERT INTO aquarium_shares (aquarium_id, user_id, role, status, token, token_expires, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(aquarium_id, user_id) DO UPDATE SET
            role = excluded.role,
            status = excluded.status,
            token = excluded.token,
            token_expires = excluded.token_expires
        `
        ).run(Number(aquariumId), Number(userId), role, status, token, tokenExpires);
      },
      async updateRole(aquariumId?: any, userId?: any, role?: any) {
        const res = db.prepare('UPDATE aquarium_shares SET role = ? WHERE aquarium_id = ? AND user_id = ?').run(role, Number(aquariumId), Number(userId));
        return res.changes > 0;
      },
      async accept(aquariumId?: any, userId?: any) {
        const res = db
          .prepare(
            "UPDATE aquarium_shares SET status = 'accepted', accepted_at = datetime('now'), token = NULL, token_expires = NULL WHERE aquarium_id = ? AND user_id = ? AND status = 'pending' AND (token_expires IS NULL OR token_expires >= ?)"
          )
          .run(Number(aquariumId), Number(userId), Date.now());
        return res.changes > 0;
      },
      async acceptByToken(token?: any, userId: any = null) {
        if (!token) return false;
        let res;
        if (userId != null) {
          res = db
            .prepare(
              "UPDATE aquarium_shares SET status = 'accepted', accepted_at = datetime('now'), token = NULL, token_expires = NULL WHERE token = ? AND user_id = ? AND status = 'pending' AND (token_expires IS NULL OR token_expires >= ?)"
            )
            .run(String(token), Number(userId), Date.now());
        } else {
          res = db
            .prepare(
              "UPDATE aquarium_shares SET status = 'accepted', accepted_at = datetime('now'), token = NULL, token_expires = NULL WHERE token = ? AND status = 'pending' AND (token_expires IS NULL OR token_expires >= ?)"
            )
            .run(String(token), Date.now());
        }
        return res.changes > 0;
      },
      async decline(aquariumId?: any, userId?: any) {
        const res = db.prepare('DELETE FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?').run(Number(aquariumId), Number(userId));
        return res.changes > 0;
      },
      async declineByToken(token?: any) {
        if (!token) return false;
        const res = db.prepare('DELETE FROM aquarium_shares WHERE token = ?').run(String(token));
        return res.changes > 0;
      },
      async delete(aquariumId?: any, userId?: any) {
        const res = db.prepare('DELETE FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?').run(Number(aquariumId), Number(userId));
        return res.changes > 0;
      },
      async count(aquariumId?: any) {
        return db.prepare("SELECT COUNT(*) as n FROM aquarium_shares WHERE aquarium_id = ? AND (status = 'accepted' OR status IS NULL)").get(Number(aquariumId))?.n || 0;
      },
    };
  }

  private build_stock() {
    const db = this.connection();

    return {
      async listForAquarium(aquariumId?: any) {
        const rows = db.prepare<StockRecord>('SELECT id, aquarium_id, species, count, profile, name, image_file FROM stock WHERE aquarium_id = ? ORDER BY species, id').all(Number(aquariumId));
        return rows.map((s: any) => ({
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        }));
      },
      async findById(id?: any) {
        const s = db.prepare<StockRecord>('SELECT id, aquarium_id, species, count, profile, name, image_file FROM stock WHERE id = ?').get(Number(id));
        if (!s) return null;
        return {
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        };
      },
      async create({ aquarium_id, species, count = 1, profile = 'allgemein', name = null, image_file = null }: any) {
        const info = db.prepare('INSERT INTO stock (aquarium_id, species, count, profile, name, image_file) VALUES (?, ?, ?, ?, ?, ?)').run(aquarium_id, species, count, profile, name, image_file);
        return { id: Number(info.lastInsertRowid) };
      },
      async createMany(rows?: any) {
        const insert = db.prepare('INSERT INTO stock (aquarium_id, species, count, profile, name, image_file) VALUES (?, ?, ?, ?, ?, ?)');
        return db.transaction(() => rows.map((row: any) => ({
          id: Number(insert.run(row.aquarium_id, row.species, row.count, row.profile, row.name || null, null).lastInsertRowid),
        })))();
      },
      async update(id?: any, fields: any = {}) {
        const setClauses = [];
        const params = [];
        const allowed = ['species', 'count', 'profile', 'name', 'image_file'];
        for (const k of allowed) {
          if (fields[k] !== undefined) {
            setClauses.push(`${k} = ?`);
            params.push(fields[k]);
          }
        }
        if (setClauses.length === 0) return true;
        params.push(Number(id));
        const res = db.prepare(`UPDATE stock SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
        return res.changes > 0;
      },
      async updateImage(id?: any, filename?: any) {
        const res = db.prepare('UPDATE stock SET image_file = ? WHERE id = ?').run(filename, Number(id));
        return res.changes > 0;
      },
      async delete(id?: any, aquariumId: any = null) {
        const numId = Number(id);
        const s = db.prepare<StockRecord>('SELECT * FROM stock WHERE id = ?').get(numId);
        if (s?.image_file) {
          deleteImage(s.image_file);
        }
        let res;
        if (aquariumId != null) {
          res = db.prepare('DELETE FROM stock WHERE id = ? AND aquarium_id = ?').run(numId, Number(aquariumId));
        } else {
          res = db.prepare('DELETE FROM stock WHERE id = ?').run(numId);
        }
        return res.changes > 0;
      },
      async deleteAllForAquarium(aquariumId?: any) {
        const numAqId = Number(aquariumId);
        const rows = db.prepare<StockRecord>('SELECT image_file FROM stock WHERE aquarium_id = ?').all(numAqId);
        for (const r of rows) {
          if (r.image_file) deleteImage(r.image_file);
        }
        db.prepare('DELETE FROM stock WHERE aquarium_id = ?').run(numAqId);
      },
    };
  }

  private build_measurements() {
    const db = this.connection();
    const self = this;
    return {
      async listForAquarium(aquariumId?: any, options: any = {}) {
        let since;
        let until = null;
        if (options.all || options.days === 'all' || options.days === 0) {
          since = '1970-01-01T00:00:00.000Z';
        } else if (options.from || options.since) {
          const fromStr = String(options.from || options.since).trim();
          const fromDate = fromStr.length === 10 ? new Date(`${fromStr}T00:00:00.000Z`) : new Date(fromStr);
          since = !Number.isNaN(fromDate.getTime()) ? fromDate.toISOString() : new Date(Date.now() - 90 * 86400000).toISOString();
        } else {
          const days = Math.min(Math.max(Number(options.days) || 90, 1), 3650);
          since = new Date(Date.now() - days * 86400000).toISOString();
        }

        if (options.to || options.until) {
          const toStr = String(options.to || options.until).trim();
          const toDate = toStr.length === 10 ? new Date(`${toStr}T23:59:59.999Z`) : new Date(toStr);
          if (!Number.isNaN(toDate.getTime())) {
            until = toDate.toISOString();
          }
        }

        let sql = `SELECT m.id, m.measured_at, m.note, m.created_by, u.username as created_by_username
             FROM measurements m
             LEFT JOIN users u ON u.id = m.created_by
             WHERE m.aquarium_id = ? AND m.measured_at >= ?`;
        const sqlParams = [aquariumId, since];
        if (until) {
          sql += ` AND m.measured_at <= ?`;
          sqlParams.push(until);
        }
        sql += ` ORDER BY m.measured_at DESC`;

        const ms = db.prepare(sql).all(...sqlParams);

        if (ms.length === 0) return [];

        let valSql = `SELECT mv.measurement_id, mv.param, mv.value
             FROM measurement_values mv
             JOIN measurements m ON m.id = mv.measurement_id
             WHERE m.aquarium_id = ? AND m.measured_at >= ?`;
        const valParams = [aquariumId, since];
        if (until) {
          valSql += ` AND m.measured_at <= ?`;
          valParams.push(until);
        }
        const vals = db.prepare(valSql).all(...valParams);

        const alerts = db
          .prepare(
            `SELECT a.id, a.measurement_id, a.param, a.level, a.value, a.message
             FROM alerts a
             WHERE a.aquarium_id = ? AND a.measurement_id IS NOT NULL`
          )
          .all(aquariumId);

        const alertsByMeas = new Map();
        for (const al of alerts) {
          if (!alertsByMeas.has(al.measurement_id)) alertsByMeas.set(al.measurement_id, []);
          alertsByMeas.get(al.measurement_id).push(al);
        }

        const valsByMeas = new Map();
        for (const v of vals) {
          if (!valsByMeas.has(v.measurement_id)) valsByMeas.set(v.measurement_id, {});
          valsByMeas.get(v.measurement_id)[v.param] = v.value;
        }

        let result = ms.map((m: any) => ({
          id: m.id,
          measured_at: m.measured_at,
          note: m.note,
          created_by: m.created_by,
          created_by_username: m.created_by_username,
          values: valsByMeas.get(m.id) || {},
          alerts: alertsByMeas.get(m.id) || [],
        }));

        if (options.limit && Number.isFinite(Number(options.limit))) {
          result = result.slice(0, Number(options.limit));
        }

        return result;
      },
      async findById(id?: any) {
        const m = db.prepare<Measurement>('SELECT * FROM measurements WHERE id = ?').get(id);
        if (!m) return null;
        const vals = db.prepare('SELECT param, value FROM measurement_values WHERE measurement_id = ?').all(id);
        const values: Record<string, any> = {};
        for (const v of vals) values[v.param] = v.value;
        return { ...m, values };
      },
      async findLastForAquarium(aquariumId?: any) {
        const m = db.prepare<Measurement>('SELECT * FROM measurements WHERE aquarium_id = ? ORDER BY measured_at DESC LIMIT 1').get(Number(aquariumId));
        if (!m) return null;
        const vals = db.prepare('SELECT param, value FROM measurement_values WHERE measurement_id = ?').all(m.id);
        const values: Record<string, any> = {};
        for (const v of vals) values[v.param] = v.value;
        return { ...m, values };
      },
      async create({ aquarium_id, measured_at, note = null, created_by = null, values = {}, alerts = [], suite_id = null, test_selection = undefined }: any) {
        const insertMeas = db.prepare('INSERT INTO measurements (aquarium_id, measured_at, note, created_by) VALUES (?, ?, ?, ?)');
        const insertVal = db.prepare('INSERT INTO measurement_values (measurement_id, param, value) VALUES (?, ?, ?)');
        const insertAlert = db.prepare(
          'INSERT INTO alerts (aquarium_id, measurement_id, param, level, value, message) VALUES (?, ?, ?, ?, ?, ?)'
        );

        let measId;
        const tx = db.transaction(() => {
          const info = insertMeas.run(aquarium_id, measured_at, note, created_by);
          measId = Number(info.lastInsertRowid);
          for (const [param, val] of Object.entries(values)) {
            insertVal.run(measId, param, val);
          }
          for (const a of alerts) {
            insertAlert.run(aquarium_id, measId, a.param, a.level, a.value, a.message);
          }
          if (created_by) {
            const user = db.prepare<UserRecord>('SELECT * FROM users WHERE id = ?').get(created_by);
            if (user) {
              const inventory = JSON.parse(user.test_inventory || '{}');
              require('../services/test-inventory-service').applyUsage(inventory, user, values, suite_id, test_selection);
              db.prepare('UPDATE users SET test_inventory = ? WHERE id = ?').run(JSON.stringify(inventory), created_by);
            }
          }
        });

        tx();
        if (created_by) await require('../services/test-inventory-service').checkUserReminders(self, created_by);
        return { id: measId };
      },
      async delete(id?: any, aquariumId: any = null) {
        let res;
        if (aquariumId != null) {
          res = db.prepare('DELETE FROM measurements WHERE id = ? AND aquarium_id = ?').run(id, aquariumId);
        } else {
          res = db.prepare('DELETE FROM measurements WHERE id = ?').run(id);
        }
        return res.changes > 0;
      },
      async getLatestValues(aquariumId?: any, thresholds: any = {}) {
        const rows = db
          .prepare<{ param: string; value: number; measured_at: string }>(
            `
          SELECT mv.param, mv.value, m.measured_at FROM measurement_values mv
          JOIN measurements m ON m.id = mv.measurement_id
          WHERE m.aquarium_id = ? AND m.measured_at = (
            SELECT MAX(m2.measured_at) FROM measurements m2 JOIN measurement_values v2 ON v2.measurement_id = m2.id
            WHERE m2.aquarium_id = m.aquarium_id AND v2.param = mv.param)
        `
          )
          .all(aquariumId);

        const latest: Record<string, any> = {};
        for (const r of rows) {
          latest[r.param] = {
            value: r.value,
            measured_at: r.measured_at,
            status: cfg.evaluate(thresholds[r.param], r.value),
          };
        }
        return latest;
      },
    };
  }

  private build_alerts() {
    const db = this.connection();

    return {
      async listOpenForAquarium(aquariumId?: any) {
        return db
          .prepare(
            `SELECT id, param, level, value, message, created_at FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL ORDER BY (level = 'crit') DESC, created_at DESC`
          )
          .all(aquariumId);
      },
      async listAllForAquarium(aquariumId?: any) {
        return db.prepare('SELECT * FROM alerts WHERE aquarium_id = ? ORDER BY created_at DESC').all(aquariumId);
      },
      async create({ aquarium_id, measurement_id = null, param, level, value, message }: any) {
        const info = db
          .prepare('INSERT INTO alerts (aquarium_id, measurement_id, param, level, value, message) VALUES (?, ?, ?, ?, ?, ?)')
          .run(aquarium_id, measurement_id, param, level, value, message);
        return { id: Number(info.lastInsertRowid) };
      },
      async ack(id?: any, aquariumId?: any) {
        const res = db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE id = ? AND aquarium_id = ? AND acked_at IS NULL").run(id, aquariumId);
        return res.changes > 0;
      },
      async ackAll(aquariumId?: any) {
        const res = db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE aquarium_id = ? AND acked_at IS NULL").run(aquariumId);
        return res.changes;
      },
      async countOpen(aquariumId?: any) {
        const alerts = db.prepare(`SELECT level, COUNT(*) n FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL GROUP BY level`).all(aquariumId);
        const crit = alerts.find((a: any) => a.level === 'crit')?.n || 0;
        const warn = alerts.find((a: any) => a.level === 'warn')?.n || 0;
        return { crit, warn };
      },
    };
  }

  private build_maintenance() {
    const db = this.connection();
    const self = this;
    return {
      async listForAquarium(aquariumId?: any, options: any = {}) {
        const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        let sql = `
          SELECT ml.*, u.username as created_by_username
          FROM maintenance_logs ml
          LEFT JOIN users u ON u.id = ml.created_by
          WHERE ml.aquarium_id = ? AND ml.logged_at >= ?
        `;
        const params = [aquariumId, since];
        if (options.type) {
          sql += ' AND ml.type = ?';
          params.push(options.type);
        }
        sql += ' ORDER BY ml.logged_at DESC';
        if (options.limit && Number.isFinite(Number(options.limit))) {
          sql += ' LIMIT ?';
          params.push(Number(options.limit));
        }
        return db.prepare(sql).all(...params);
      },
      async findById(id?: any) {
        return db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(id) || null;
      },
      async findLastByType(aquariumId?: any, type?: any) {
        return (
          db
            .prepare('SELECT * FROM maintenance_logs WHERE aquarium_id = ? AND type = ? ORDER BY logged_at DESC LIMIT 1')
            .get(Number(aquariumId), String(type)) || null
        );
      },
      async create({ aquarium_id, logged_at, type, percentage = null, details = null, note = null, created_by = null }: any) {
        const info = db
          .prepare('INSERT INTO maintenance_logs (aquarium_id, logged_at, type, percentage, details, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(aquarium_id, logged_at, type, percentage, details, note, created_by);
        return { id: Number(info.lastInsertRowid) };
      },
      async update(id?: any, aquariumId?: any, fields: any = {}) {
        const setClauses = [];
        const params = [];
        const allowed = ['logged_at', 'type', 'percentage', 'details', 'note'];

        for (const k of allowed) {
          if (fields[k] !== undefined) {
            setClauses.push(`${k} = ?`);
            params.push(fields[k]);
          }
        }

        if (setClauses.length === 0) return true;
        params.push(id, aquariumId);
        const res = db.prepare(`UPDATE maintenance_logs SET ${setClauses.join(', ')} WHERE id = ? AND aquarium_id = ?`).run(...params);
        return res.changes > 0;
      },
      async delete(id?: any, aquariumId: any = null) {
        let res;
        if (aquariumId != null) {
          res = db.prepare('DELETE FROM maintenance_logs WHERE id = ? AND aquarium_id = ?').run(id, aquariumId);
        } else {
          res = db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(id);
        }
        return res.changes > 0;
      },
      async getTimeline(aquariumId?: any, options: any = {}) {
        const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const filterKind = options.kind || 'all';

        const timeline = [];

        if (filterKind === 'all' || filterKind === 'maintenance' || cfg.maintenanceService.MAINTENANCE_TYPES[filterKind]) {
          let sql = `
            SELECT ml.*, u.username as created_by_username
            FROM maintenance_logs ml
            LEFT JOIN users u ON u.id = ml.created_by
            WHERE ml.aquarium_id = ? AND ml.logged_at >= ?
          `;
          const params = [aquariumId, since];
          if (cfg.maintenanceService.MAINTENANCE_TYPES[filterKind]) {
            sql += ' AND ml.type = ?';
            params.push(filterKind);
          }
          sql += ' ORDER BY ml.logged_at DESC';

          const maintRows = db.prepare(sql).all(...params);
          for (const row of maintRows) {
            const typeDef = cfg.maintenanceService.MAINTENANCE_TYPES[row.type] || { label: row.type, icon: '📝' };
            timeline.push({
              kind: 'maintenance',
              id: row.id,
              timestamp: row.logged_at,
              type: row.type,
              typeName: typeDef.label,
              icon: typeDef.icon,
              percentage: row.percentage,
              details: row.details,
              note: row.note,
              created_by: row.created_by,
              created_by_username: row.created_by_username,
              created_at: row.created_at,
            });
          }
        }

        if (filterKind === 'all' || filterKind === 'measurement') {
          const ms = await self.measurements.listForAquarium(aquariumId, { days });
          for (const m of ms) {
            timeline.push({
              kind: 'measurement',
              id: m.id,
              timestamp: m.measured_at,
              type: 'measurement',
              typeName: 'Wassermessung',
              icon: '🧪',
              values: m.values,
              paramCount: Object.keys(m.values).length,
              note: m.note,
              alerts: m.alerts || [],
              created_by: m.created_by,
              created_by_username: m.created_by_username,
            });
          }
        }

        timeline.sort((a?: any, b?: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const offset = options.offset != null ? Math.max(0, Number(options.offset) || 0) : 0;
        if (options.limit && Number.isFinite(Number(options.limit))) {
          return timeline.slice(offset, offset + Number(options.limit));
        } else if (offset > 0) {
          return timeline.slice(offset);
        }

        return timeline;
      },
      async getLatest(aquariumId?: any) {
        return db.prepare('SELECT logged_at, type FROM maintenance_logs WHERE aquarium_id = ? ORDER BY logged_at DESC LIMIT 1').get(aquariumId) || null;
      },
      async getLatestWaterChange(aquariumId?: any) {
        return (
          db
            .prepare("SELECT logged_at, percentage FROM maintenance_logs WHERE aquarium_id = ? AND type = 'water_change' ORDER BY logged_at DESC LIMIT 1")
            .get(aquariumId) || null
        );
      },
    };
  }

  private build_invitations() {
    const db = this.connection();

    return {
      async findById(id?: any) {
        if (!id) return null;
        return (
          db.prepare<Invitation>(`
            SELECT i.*, u.username as created_by_username
            FROM invitations i
            LEFT JOIN users u ON u.id = i.created_by
            WHERE i.id = ?
          `).get(Number(id)) || null
        );
      },
      async findByCode(code?: any) {
        if (!code) return null;
        return (
          db.prepare<Invitation>(`
            SELECT i.*, u.username as created_by_username
            FROM invitations i
            LEFT JOIN users u ON u.id = i.created_by
            WHERE i.code = ?
          `).get(String(code).trim()) || null
        );
      },
      async findByEmail(email?: any) {
        if (!email) return [];
        return db.prepare<Invitation>(`
          SELECT i.*, u.username as created_by_username
          FROM invitations i
          LEFT JOIN users u ON u.id = i.created_by
          WHERE i.email = ?
          ORDER BY i.id DESC
        `).all(String(email).trim());
      },
      async listAll() {
        return db.prepare<Invitation>(`
          SELECT i.*, u.username as created_by_username
          FROM invitations i
          LEFT JOIN users u ON u.id = i.created_by
          ORDER BY i.id DESC
        `).all();
      },
      async listForUser(userId?: any) {
        return db.prepare<Invitation>(`
          SELECT i.*, u.username as created_by_username
          FROM invitations i
          LEFT JOIN users u ON u.id = i.created_by
          WHERE i.created_by = ?
          ORDER BY i.id DESC
        `).all(Number(userId));
      },
      async create({
        code,
        type = 'code',
        email = null,
        created_by = null,
        max_uses = 1,
        used_count = 0,
        expires_at,
        note = null,
      }: any) {
        const info = db.prepare(`
          INSERT INTO invitations (code, type, email, created_by, max_uses, used_count, expires_at, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          code,
          type,
          email || null,
          created_by != null ? Number(created_by) : null,
          max_uses != null ? Number(max_uses) : 1,
          used_count != null ? Number(used_count) : 0,
          Number(expires_at),
          note || null
        );
        return this.findById(info.lastInsertRowid);
      },
      async use(id?: any) {
        const res = db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ? AND expires_at >= ? AND (max_uses IS NULL OR max_uses <= 0 OR used_count < max_uses)').run(Number(id), Date.now());
        return res.changes > 0;
      },
      async releaseUse(id: number) {
        db.prepare('UPDATE invitations SET used_count = used_count - 1 WHERE id = ? AND used_count > 0').run(id);
      },
      async delete(id?: any, createdBy: any = null) {
        let res;
        if (createdBy != null) {
          res = db.prepare('DELETE FROM invitations WHERE id = ? AND created_by = ?').run(Number(id), Number(createdBy));
        } else {
          res = db.prepare('DELETE FROM invitations WHERE id = ?').run(Number(id));
        }
        return res.changes > 0;
      },
    };
  }

  private build_aquariumChats() {
    const db = this.connection();

    return {
      async listForAquarium(aquariumId?: any, options: any = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
        const rows = db.prepare(`
          SELECT id, aquarium_id, user_id, role, content, provider, model, created_at
          FROM aquarium_chats
          WHERE aquarium_id = ?
          ORDER BY id DESC
          LIMIT ?
        `).all(Number(aquariumId), limit);
        return rows.reverse();
      },
      async create({ aquariumId, userId = null, role, content, provider = null, model = null, createdAt = null }: any) {
        const ts = createdAt || new Date().toISOString();
        const info = db.prepare(`
          INSERT INTO aquarium_chats (aquarium_id, user_id, role, content, provider, model, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(aquariumId),
          userId ? Number(userId) : null,
          String(role || 'user'),
          String(content || ''),
          provider ? String(provider) : null,
          model ? String(model) : null,
          ts
        );
        return {
          id: info.lastInsertRowid,
          aquarium_id: Number(aquariumId),
          user_id: userId ? Number(userId) : null,
          role: String(role || 'user'),
          content: String(content || ''),
          provider: provider ? String(provider) : null,
          model: model ? String(model) : null,
          created_at: ts,
        };
      },
      async clearForAquarium(aquariumId?: any) {
        const res = db.prepare('DELETE FROM aquarium_chats WHERE aquarium_id = ?').run(Number(aquariumId));
        return res.changes > 0;
      },
      async countForAquarium(aquariumId?: any) {
        const row = db.prepare('SELECT COUNT(*) AS count FROM aquarium_chats WHERE aquarium_id = ?').get(Number(aquariumId));
        return row ? row.count : 0;
      },
    };
  }

  private build_dosingPumps() {
    const db = this.connection();
    return {
      async listForAquarium(aquariumId?: any) {
        return db.prepare<DosingPump>('SELECT * FROM dosing_pumps WHERE aquarium_id = ? ORDER BY id ASC').all(Number(aquariumId));
      },
      async findById(id?: any) {
        if (!id) return null;
        return db.prepare<DosingPump>('SELECT * FROM dosing_pumps WHERE id = ?').get(Number(id)) || null;
      },
      async create({
        aquarium_id,
        name,
        fertilizer_name,
        amount_ml,
        interval_days = 1,
        time_of_day = null,
        is_active = 1,
        note = null,
        mode = 'automatic',
        reminder_mail = 0,
      }: any) {
        const info = db.prepare(`
          INSERT INTO dosing_pumps (aquarium_id, name, fertilizer_name, amount_ml, interval_days, time_of_day, is_active, note, mode, reminder_mail, schedule_started_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(aquarium_id),
          String(name).trim(),
          String(fertilizer_name).trim(),
          Number(amount_ml),
          Number(interval_days) || 1,
          time_of_day ? String(time_of_day).trim() : null,
          is_active ? 1 : 0,
          note ? String(note).trim() : null, mode, reminder_mail ? 1 : 0, new Date().toISOString()
        );
        return this.findById(info.lastInsertRowid);
      },
      async update(id?: any, aquariumId?: any, fields: any = {}) {
        const allowed = ['name', 'fertilizer_name', 'amount_ml', 'interval_days', 'time_of_day', 'is_active', 'note', 'last_dosed_at', 'mode', 'reminder_mail', 'schedule_started_at', 'last_reminder_sent_at'];
        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(fields)) {
          if (!allowed.includes(k)) continue;
          sets.push(`${k} = ?`);
          if (k === 'amount_ml') params.push(Number(v));
          else if (k === 'interval_days' || k === 'is_active' || k === 'reminder_mail') params.push(Number(v));
          else if (v == null) params.push(null);
          else params.push(String(v).trim());
        }
        if (!sets.length) return this.findById(id);
        params.push(Number(id));
        let sql = `UPDATE dosing_pumps SET ${sets.join(', ')} WHERE id = ?`;
        if (aquariumId != null) {
          sql += ' AND aquarium_id = ?';
          params.push(Number(aquariumId));
        }
        db.prepare(sql).run(...params);
        return this.findById(id);
      },
      async delete(id?: any, aquariumId: any = null) {
        let res;
        if (aquariumId != null) {
          res = db.prepare('DELETE FROM dosing_pumps WHERE id = ? AND aquarium_id = ?').run(Number(id), Number(aquariumId));
        } else {
          res = db.prepare('DELETE FROM dosing_pumps WHERE id = ?').run(Number(id));
        }
        return res.changes > 0;
      },
      async updateReminderSent(id: number, aquariumId: number, timestamp: string | null, expected: string | null) {
        return db.prepare("UPDATE dosing_pumps SET last_reminder_sent_at = ? WHERE id = ? AND aquarium_id = ? AND mode = 'manual' AND reminder_mail = 1 AND is_active = 1 AND last_reminder_sent_at IS ?")
          .run(timestamp, id, aquariumId, expected).changes > 0;
      },
      async logDosing(id?: any, aquariumId?: any, userId: any = null, timestamp: any = null, automatic = false) {
        return db.transaction(() => {
          const pump = db.prepare<DosingPump>('SELECT * FROM dosing_pumps WHERE id = ? AND aquarium_id = ?').get(Number(id), Number(aquariumId));
          if (!pump || (automatic ? pump.mode !== 'automatic' || !pump.is_active : pump.mode !== 'manual')) return null;
          const loggedAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
          if (automatic && new Date(loggedAt) < new Date(pump.schedule_started_at)) return null;
          const key = automatic ? `pump:${pump.id}:${loggedAt}` : null;
          const info = db.prepare(`INSERT INTO maintenance_logs (aquarium_id, logged_at, type, details, note, created_by, automation_key)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(automation_key) DO NOTHING`).run(pump.aquarium_id, loggedAt, automatic ? 'dosing_pump' : 'fertilize',
            `${pump.amount_ml} ml ${pump.fertilizer_name} (${pump.name})`, pump.note, automatic ? null : userId, key);
          db.prepare("UPDATE dosing_pumps SET last_dosed_at = ?, last_reminder_sent_at = NULL WHERE id = ? AND (last_dosed_at IS NULL OR last_dosed_at < ?)").run(loggedAt, pump.id, loggedAt);
          const logId = info.changes ? Number(info.lastInsertRowid) : db.prepare('SELECT id FROM maintenance_logs WHERE automation_key = ?').get(key)?.id;
          return { success: true, created: info.changes > 0, log_id: logId, logged_at: loggedAt };
        })();
      },
    };
  }
}

export = SqliteAdapter;
