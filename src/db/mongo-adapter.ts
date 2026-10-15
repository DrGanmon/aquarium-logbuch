import { AI_PROVIDERS, encryptPersonalAiFields } from '../services/ai-token-crypto';
import encryptedAiTokensMigration = require('./migrations/007_encrypted_ai_tokens');
import { PlantRepository } from './plant-repository';
import { SocialRepository } from "./social-repository";
import { buildAdminMetrics, normalizeAiUsage } from './admin-metrics';
import type { UserRecord, Aquarium, AccessRole, StockRecord, Measurement, AquariumImage, AquariumShare, Invitation } from '../types/domain';
import type { MongoConnection } from '../types/database-driver';
import type { RepositoryContract, UserQueries, AquariumQueries, StockRepository, PumpRepository, MeasurementQueries } from '../types/repositories';
import { asError } from '../utils/app-error';
import type { DatabaseOptions } from '../types/domain';
import { MongoClient, type ClientSession } from 'mongodb';
import envModule = require('../config/env');
const { MONGODB_URI, MONGODB_DB_NAME } = envModule;
import cfg = require('../config/app-config');
import aquarium_serviceModule = require('../services/aquarium-service');
const { isOverdue } = aquarium_serviceModule;
import reminder_serviceModule = require('../services/reminder-service');
const { calculateCycleStatus } = reminder_serviceModule;
import image_serviceModule = require('../services/image-service');
const { deleteImage } = image_serviceModule;
import migratorModule = require('./migrator');
const { runMigrationsMongo } = migratorModule;

function escapeRegex(string?: any) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class MongoAdapter {
  readonly type: 'mongodb';
  uri: string;
  dbName: string;
  client: MongoClient | null;
  /** Dynamic rows/documents are validated by services; schemas differ across adapters. */
  db: MongoConnection | null;
  _initialized: boolean;
  schemaVersion: number;
  _initPromise: Promise<this> | null = null;
  users!: RepositoryContract<ReturnType<MongoAdapter['build_users']>, UserQueries>;
  sessions!: ReturnType<MongoAdapter['build_sessions']>;
  aquariums!: RepositoryContract<ReturnType<MongoAdapter['build_aquariums']>, AquariumQueries>;
  aquariumImages!: ReturnType<MongoAdapter['build_aquariumImages']>;
  shares!: ReturnType<MongoAdapter['build_shares']>;
  plants!: PlantRepository;
  stock!: RepositoryContract<ReturnType<MongoAdapter['build_stock']>, StockRepository>;
  measurements!: RepositoryContract<ReturnType<MongoAdapter['build_measurements']>, MeasurementQueries>;
  alerts!: ReturnType<MongoAdapter['build_alerts']>;
  maintenance!: ReturnType<MongoAdapter['build_maintenance']>;
  invitations!: ReturnType<MongoAdapter['build_invitations']>;
  aquariumChats!: ReturnType<MongoAdapter['build_aquariumChats']>;
  social!: SocialRepository;
  dosingPumps!: RepositoryContract<ReturnType<MongoAdapter['build_dosingPumps']>, PumpRepository>;

  constructor(options: DatabaseOptions = {}) {
    this.type = 'mongodb';
    this.uri = options.uri || MONGODB_URI;
    this.dbName = options.dbName || MONGODB_DB_NAME || '';
    this.client = null;
    this.db = null;
    this._initialized = false;
    this.schemaVersion = 0;
  }

  async init(): Promise<this> {
    if (this._initialized && this.db) return this;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        this.client = new MongoClient(this.uri);
        await this.client.connect();

        // Ermittle den Datenbanknamen aus der URI oder den Optionen
        if (this.dbName) {
          this.db = this.client.db(this.dbName);
        } else {
          try {
            const parsed = new URL(this.uri);
            const pathName = parsed.pathname.replace(/^\/+/, '');
            this.db = this.client.db(pathName || 'aquarium');
          } catch {
            this.db = this.client.db('aquarium');
          }
        }

        await this._createIndexes();
        const migRes = await runMigrationsMongo(this.db, { adapter: this });
        this.schemaVersion = migRes.currentVersion;
        await encryptedAiTokensMigration.upMongo(this.db);
        this._setupRepositories();
        this._initialized = true;
        return this;
      } catch (error) {
        const client = this.client;
        this.client = null;
        this.db = null;
        this._initialized = false;
        await client?.close().catch(() => {});
        throw error;
      } finally {
        this._initPromise = null;
      }
    })();

    return this._initPromise;
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
      this.db = null;
    }
    this._initialized = false;
  }

  getRawDb() {
    return this.db;
  }

  getSchemaVersion() {
    return this.schemaVersion;
  }

  async getAdminMetrics() {
    const db = this.connection();
    const count = (collection: string) => db.collection(collection).countDocuments();
    const [users, verifiedUsers, aquariums, measurements, logbookEntries, socialPosts, activeSessions, animalRows, usageRows] = await Promise.all([
      count('users'), db.collection('users').countDocuments({ email_verified: 1 }), count('aquariums'), count('measurements'),
      count('maintenance_logs'), count('social_posts'), db.collection('sessions').countDocuments({ expires_at: { $gt: Date.now() } }),
      db.collection('stock').aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$count', 0] } } } }]).toArray(),
      db.collection('ai_usage_metrics').find({}, { projection: { _id: 0 } }).toArray(),
    ]);
    return buildAdminMetrics({ users, verifiedUsers, aquariums, measurements, logbookEntries, socialPosts,
      animals: Number(animalRows[0]?.total) || 0, activeSessions }, usageRows as Array<Record<string, unknown>>);
  }

  async recordAiUsage(provider: string, usage: unknown) {
    const normalized = normalizeAiUsage(provider, usage);
    if (!normalized) return false;
    const collection = this.connection().collection('ai_usage_metrics');
    const update = { $inc: { input_tokens: normalized.inputTokens, output_tokens: normalized.outputTokens,
      total_tokens: normalized.totalTokens, request_count: 1 }, $set: { updated_at: new Date().toISOString() } };
    try {
      await collection.updateOne({ provider }, update, { upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      await collection.updateOne({ provider }, update);
    }
    return true;
  }

  async getNextSequence(name: string, amount: number = 1) {
    const res = await this.connection().collection<{ _id: string; seq: number }>('counters').findOneAndUpdate(
      { _id: name },
      { $inc: { seq: amount } },
      { upsert: true, returnDocument: 'after' }
    );
    return res?.seq ?? amount;
  }

  async _createIndexes() {
    const db = this.connection();
    try {
      // Users
      await db.collection('users').createIndex(
        { username: 1 },
        { unique: true, collation: { locale: 'en', strength: 2 } }
      );
      await db.collection('users').createIndex(
        { email: 1 },
        { unique: true, partialFilterExpression: { email: { $type: 'string' } }, collation: { locale: 'en', strength: 2 } }
      );
      await db.collection('users').createIndex(
        { oidc_sub: 1 },
        { unique: true, partialFilterExpression: { oidc_sub: { $type: 'string' } } }
      );
      await db.collection('users').createIndex({ email_verify_token: 1 }, { sparse: true });
      await db.collection('users').createIndex({ password_reset_token: 1 }, { sparse: true });
      await db.collection('users').createIndex({ account_delete_token: 1 }, { sparse: true });
      await db.collection('users').createIndex({ id: 1 }, { unique: true });

      // Sessions
      await db.collection('sessions').createIndex({ token_hash: 1 }, { unique: true });
      await db.collection('sessions').createIndex({ expires_at: 1 });

      // Aquariums
      await db.collection('aquariums').createIndex({ id: 1 }, { unique: true });
      await db.collection('aquariums').createIndex({ user_id: 1 });

      // Aquarium Images
      await db.collection('aquarium_images').createIndex({ id: 1 }, { unique: true });
      await db.collection('aquarium_images').createIndex({ aquarium_id: 1 });

      // Aquarium shares
      await db.collection('aquarium_shares').createIndex({ aquarium_id: 1, user_id: 1 }, { unique: true });
      await db.collection('aquarium_shares').createIndex({ user_id: 1, status: 1 });
      await db.collection('aquarium_shares').createIndex({ token: 1 }, { sparse: true });

      // Stock
      await db.collection('stock').createIndex({ id: 1 }, { unique: true });
      await db.collection('stock').createIndex({ aquarium_id: 1 });

      // Measurements
      await db.collection('measurements').createIndex({ id: 1 }, { unique: true });
      await db.collection('measurements').createIndex({ aquarium_id: 1, measured_at: -1 });

      // Alerts
      await db.collection('alerts').createIndex({ id: 1 }, { unique: true });
      await db.collection('alerts').createIndex({ aquarium_id: 1, acked_at: 1 });
      await db.collection('alerts').createIndex({ measurement_id: 1 });

      // Maintenance logs
      await db.collection('maintenance_logs').createIndex({ id: 1 }, { unique: true });
      await db.collection('maintenance_logs').createIndex({ aquarium_id: 1, logged_at: -1 });

      // Invitations
      await db.collection('invitations').createIndex({ id: 1 }, { unique: true });
      await db.collection('invitations').createIndex({ code: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
      await db.collection('invitations').createIndex({ created_by: 1 });
      await db.collection('invitations').createIndex({ expires_at: 1 });

      // Aquarium Chats
      await db.collection('aquarium_chats').createIndex({ id: 1 }, { unique: true });
      await db.collection('aquarium_chats').createIndex({ aquarium_id: 1, created_at: 1 });
      await db.collection('aquarium_chats').createIndex({ aquarium_id: 1, id: 1 });

      // Dosing pumps
      await db.collection('dosing_pumps').createIndex({ id: 1 }, { unique: true });
      await db.collection('dosing_pumps').createIndex({ aquarium_id: 1, id: 1 });

      // Restore transactions cannot create collections implicitly.
      try { await db.createCollection('counters'); }
      catch (error: any) { if (error?.code !== 48 && error?.codeName !== 'NamespaceExists') throw error; }
    } catch (error) {
      // Missing uniqueness indexes would make account creation and linking unsafe.
      throw asError(error);
    }
  }

  private connection(): MongoConnection {
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
    this.social = new SocialRepository(this.type, this.connection(), name => this.getNextSequence(name));
  }

  async exportAllData() {
    if (!this._initialized && !this.db) await this.init();
    if (!this.client) return {};
    const session = this.client.startSession();
    try {
      let data: Record<string, any> = {};
      await session.withTransaction(async () => {
        data = await this.exportAllDataInSession(session);
      }, { readConcern: { level: 'snapshot' } });
      return data;
    } finally { await session.endSession(); }
  }

  private async exportAllDataInSession(session: ClientSession) {
    const db = this.connection();
    if (!db) return {};

    const stripId = (docs: any) =>
      docs.map((d: any) => {
        const copy: Record<string, any> = { ...d };
        delete copy._id;
        return copy;
      });

    const safeGetDocs = async (collectionName?: any, sort: any = { id: 1 }) => {
      return stripId(await db.collection(collectionName).find({}, { session }).sort(sort).toArray());
    };

    const users = await safeGetDocs('users');
    const aquariums = await safeGetDocs('aquariums');
    const aquarium_images = await safeGetDocs('aquarium_images');
    const aquarium_shares = await safeGetDocs('aquarium_shares', { aquarium_id: 1, user_id: 1 });
    const stock = await safeGetDocs('stock');
    const measurements = await safeGetDocs('measurements');
    const alerts = await safeGetDocs('alerts');
    const maintenance_logs = await safeGetDocs('maintenance_logs');
    const invitations = await safeGetDocs('invitations');
    const aquarium_chats = await safeGetDocs('aquarium_chats');
    const dosing_pumps = await safeGetDocs('dosing_pumps');

    return {
      users,
      aquariums,
      aquarium_images,
      aquarium_shares,
      stock,
      aquarium_plants: await safeGetDocs('aquarium_plants'),
      measurements,
      alerts,
      maintenance_logs,
      invitations,
      aquarium_chats,
      dosing_pumps,
      ...(await new SocialRepository(this.type, db).exportData(session)),
      ai_usage_metrics: await safeGetDocs('ai_usage_metrics', { provider: 1 }),
    };
  }

  async importAllData(data: any = {}) {
    if (!this._initialized && !this.db) await this.init();
    if (!this.client) throw new Error('MongoDB-Verbindung ist nicht initialisiert.');
    const session = this.client.startSession();
    try {
      await session.withTransaction(() => this.importAllDataInSession(data, session));
      return true;
    } finally { await session.endSession(); }
  }

  private async importAllDataInSession(data: any, session: ClientSession) {
    const db = this.connection();
    const sessionOptions = { session };

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

    const userIds = users.map((u: any) => u.id);
    const currentSessions = await db.collection('sessions').find({ expires_at: { $gt: Date.now() } }, sessionOptions).toArray();

    await this.social.clear(session);
    // Collections leeren
    for (const name of ['users', 'sessions', 'aquariums', 'aquarium_images', 'aquarium_shares', 'aquarium_plants', 'stock', 'measurements', 'alerts', 'maintenance_logs', 'invitations', 'aquarium_chats', 'dosing_pumps', 'ai_usage_metrics', 'counters']) {
      await db.collection(name).deleteMany({}, sessionOptions);
    }

    // Daten einfügen
    if (users.length > 0) await db.collection('users').insertMany(users, sessionOptions);
    if (aquariums.length > 0) await db.collection('aquariums').insertMany(aquariums, sessionOptions);
    if (aquarium_images.length > 0) await db.collection('aquarium_images').insertMany(aquarium_images, sessionOptions);
    if (shares.length > 0) await db.collection('aquarium_shares').insertMany(shares, sessionOptions);
    if (data.aquarium_plants?.length) await db.collection('aquarium_plants').insertMany(data.aquarium_plants, sessionOptions);
    if (stock.length > 0) await db.collection('stock').insertMany(stock, sessionOptions);
    if (measurements.length > 0) await db.collection('measurements').insertMany(measurements, sessionOptions);
    if (alerts.length > 0) await db.collection('alerts').insertMany(alerts, sessionOptions);
    if (maintenance.length > 0) await db.collection('maintenance_logs').insertMany(maintenance, sessionOptions);
    if (invitations.length > 0) await db.collection('invitations').insertMany(invitations, sessionOptions);
    if (chats.length > 0) await db.collection('aquarium_chats').insertMany(chats, sessionOptions);
    if (dosing_pumps.length > 0) await db.collection('dosing_pumps').insertMany(dosing_pumps, sessionOptions);
    const aiUsage = (Array.isArray(data.ai_usage_metrics) ? data.ai_usage_metrics : []).filter((row: any) => ['openai', 'gemini', 'claude'].includes(row?.provider)).map((row: any) => {
      const value = (count: unknown) => Number.isSafeInteger(Number(count)) && Number(count) >= 0 ? Number(count) : 0;
      return { provider: row.provider, input_tokens: value(row.input_tokens), output_tokens: value(row.output_tokens),
        total_tokens: value(row.total_tokens), request_count: value(row.request_count),
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString() };
    });
    if (aiUsage.length) await db.collection('ai_usage_metrics').insertMany(aiUsage, sessionOptions);

    // Aktive Sessions für bestehende Benutzer wiederherstellen
    const validSessions = currentSessions.filter((s: any) => userIds.includes(s.user_id));
    if (validSessions.length > 0) {
      await db.collection('sessions').insertMany(validSessions, sessionOptions);
    }

    // Zähler (counters) für Sequenzen aktualisieren
    const maxUserId = users.reduce((m?: any, u?: any) => Math.max(m, u.id || 0), 0);
    const maxAqId = aquariums.reduce((m?: any, a?: any) => Math.max(m, a.id || 0), 0);
    const maxAqImgId = aquarium_images.reduce((m?: any, ai?: any) => Math.max(m, ai.id || 0), 0);
    const maxStockId = stock.reduce((m?: any, s?: any) => Math.max(m, s.id || 0), 0);
    const maxMeasId = measurements.reduce((m?: any, ms?: any) => Math.max(m, ms.id || 0), 0);
    const maxAlertId = alerts.reduce((m?: any, al?: any) => Math.max(m, al.id || 0), 0);
    const maxMaintId = maintenance.reduce((m?: any, ml?: any) => Math.max(m, ml.id || 0), 0);
    const maxInvId = invitations.reduce((m?: any, iv?: any) => Math.max(m, iv.id || 0), 0);
    const maxChatId = chats.reduce((m?: any, c?: any) => Math.max(m, c.id || 0), 0);
    const maxDosingPumpId = dosing_pumps.reduce((m?: any, dp?: any) => Math.max(m, dp.id || 0), 0);

    const counterOps = [
      { _id: 'users', seq: maxUserId },
      { _id: 'aquariums', seq: maxAqId },
      { _id: 'aquarium_images', seq: maxAqImgId },
      { _id: 'stock', seq: maxStockId },
      { _id: 'measurements', seq: maxMeasId },
      { _id: 'alerts', seq: maxAlertId },
      { _id: 'maintenance_logs', seq: maxMaintId },
      { _id: 'invitations', seq: maxInvId },
      { _id: 'aquarium_chats', seq: maxChatId },
      { _id: 'dosing_pumps', seq: maxDosingPumpId },
    ];

    for (const c of counterOps) {
      if (c.seq > 0) {
        await db.collection('counters').updateOne({ _id: c._id }, { $set: { seq: c.seq } }, { upsert: true, ...sessionOptions });
      }
    }

    await this.social.importData(data, session);
    return true;
  }

  private build_users() {
    const db = this.connection();
    const self = this;
    return {
      async findById(id?: any) {
        if (!id) return null;
        const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: Number(id) });
        return u || null;
      },
      async findByUsername(username?: any, excludeId: any = null) {
        if (!username) return null;
        const filter: Record<string, any> = { username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } };
        if (excludeId != null) filter.id = { $ne: Number(excludeId) };
        return (await db.collection<UserRecord & { _id?: number }>('users').findOne(filter)) || null;
      },
      async findByEmail(email?: any, excludeId: any = null) {
        if (!email) return null;
        const filter: Record<string, any> = { email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } };
        if (excludeId != null) filter.id = { $ne: Number(excludeId) };
        return (await db.collection<UserRecord & { _id?: number }>('users').findOne(filter)) || null;
      },
      async findByOidcSub(oidcSub?: any, excludeId: any = null) {
        if (!oidcSub) return null;
        const filter: Record<string, any> = { oidc_sub: String(oidcSub) };
        if (excludeId != null) filter.id = { $ne: Number(excludeId) };
        return (await db.collection<UserRecord & { _id?: number }>('users').findOne(filter)) || null;
      },
      async findByEmailVerifyToken(token?: any) {
        if (!token) return null;
        return (await db.collection<UserRecord & { _id?: number }>('users').findOne({ email_verify_token: String(token) })) || null;
      },
      async findByPasswordResetToken(token?: any) {
        if (!token) return null;
        return (await db.collection<UserRecord & { _id?: number }>('users').findOne({ password_reset_token: String(token) })) || null;
      },
      async findByDeleteToken(token?: any) {
        if (!token) return null;
        return (await db.collection<UserRecord & { _id?: number }>('users').findOne({ account_delete_token: String(token) })) || null;
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
        terms_version = null, terms_accepted_at = null,
      }: any) {
        const id = await self.getNextSequence('users');
        const doc: Record<string, any> = {
          _id: id,
          id,
          username,
          password_hash,
          email: email || null,
          first_name: null,
          last_name: null,
          bio: null,
          avatar_file: null,
          selected_suite: null,
          selected_tests: null,
          default_graph_range: null,
          oidc_sub: oidc_sub || null,
          email_verified: email_verified ? 1 : 0,
          email_verify_token: email_verify_token || null,
          email_verify_expires: email_verify_expires || null,
          password_reset_token: password_reset_token || null,
          password_reset_expires: password_reset_expires || null,
          openai_api_key: null,
          openai_model: null,
          gemini_api_key: null,
          gemini_model: null,
          claude_api_key: null,
          claude_model: null,
          ai_provider: null,
          language: language === 'en' ? 'en' : 'de', terms_version, terms_accepted_at,
          created_at: new Date().toISOString(),
        };
        await db.collection('users').insertOne(doc);
        return { id, username, email, oidc_sub, email_verified: email_verified ? 1 : 0, language: doc.language, terms_version, terms_accepted_at };
      },
      async mutateTestInventory(id?: any, mutate?: any) {
        const users = db.collection<UserRecord & { _id?: number }>('users');
        for (let attempt = 0; attempt < 50; attempt++) {
          const user = await users.findOne({ id: Number(id) });
          if (!user) return null;
          const inventory = JSON.parse(user.test_inventory || '{}');
          const result = mutate(inventory, user);
          const updated = await users.updateOne(
            { id: user.id, test_inventory: user.test_inventory ?? null },
            { $set: { test_inventory: JSON.stringify(inventory) } },
          );
          if (updated.matchedCount) return { inventory, user, result };
        }
        throw new Error('Testverbrauch konnte wegen gleichzeitiger Änderungen nicht gespeichert werden.');
      },
      async update(id: number, fields: Partial<UserRecord> = {}, expected: Partial<UserRecord> = {}) {
        fields = encryptPersonalAiFields(Number(id), fields);
        const numId = Number(id);
        const updateFields: Record<string, any> = {};
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
          'language', 'terms_version', 'terms_accepted_at',
        ];

        for (const k of allowed) {
          if (fields[k as keyof UserRecord] !== undefined) {
            let val = fields[k as keyof UserRecord];
            if (k === 'email_verified') val = val ? 1 : 0;
            updateFields[k] = val;
          }
        }

        if (Object.keys(updateFields).length === 0) return true;
        for (const key of Object.keys(expected)) if (!allowed.includes(key)) throw new Error('Ungültige Benutzer-Bedingung.');
        const res = await db.collection('users').updateOne({ id: numId, ...expected }, { $set: updateFields });
        return res.matchedCount > 0;
      },
      async delete(id?: any) {
        const numId = Number(id);
        const user = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: numId });
        if (!user) return false;
        await require('../services/backup-service').backupService.purgeUserImages(user);
        await self.social.deleteUser(numId);
        if (user && user.avatar_file) {
          deleteImage(user.avatar_file, true);
        }

        // Cascade cleanup
        await db.collection('sessions').deleteMany({ user_id: numId });
        const aqs = await db.collection<Aquarium & { _id?: number }>('aquariums').find({ user_id: numId }).toArray();
        for (const aq of aqs) {
          await self.aquariums.delete(aq.id, true);
        }
        await db.collection('aquarium_shares').deleteMany({ user_id: numId });
        await db.collection('maintenance_logs').updateMany({ created_by: numId }, { $set: { created_by: null } });
        await db.collection('measurements').updateMany({ created_by: numId }, { $set: { created_by: null } });
        const res = await db.collection('users').deleteOne({ id: numId });
        // Catch posts created while the earlier MongoDB cleanup was awaiting I/O.
        await self.social.deleteUser(numId);
        return res.deletedCount > 0;
      },
      async listForAdmin() {
        const users = await db.collection<UserRecord & { _id?: number }>('users').find({}).sort({ created_at: 1, id: 1 }).toArray();
        const aqCounts = await db
          .collection('aquariums')
          .aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }])
          .toArray();
        const countMap = new Map(aqCounts.map((c: any) => [c._id, c.count]));

        return users.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email || null,
          oidc_sub: u.oidc_sub || null,
          password_hash: u.password_hash || '',
          email_verified: u.email_verified !== undefined ? u.email_verified : 1,
          created_at: u.created_at,
          aquarium_count: countMap.get(u.id) || 0,
        }));
      },
      async count() {
        return await db.collection('users').countDocuments({});
      },
    };
  }

  private build_sessions() {
    const db = this.connection();

    return {
      async create(tokenHash?: any, userId?: any, expiresAt?: any, idToken: any = null) {
        await db.collection('sessions').updateOne(
          { _id: tokenHash },
          {
            $set: {
              token_hash: tokenHash,
              user_id: Number(userId),
              expires_at: Number(expiresAt),
              id_token: idToken || null,
            },
          },
          { upsert: true }
        );
      },
      async find(tokenHash?: any) {
        if (!tokenHash) return null;
        const s = await db.collection('sessions').findOne({ token_hash: tokenHash });
        if (!s) return null;
        const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: s.user_id });
        if (!u) return null;
        return {
          token_hash: s.token_hash,
          user_id: s.user_id,
          expires_at: s.expires_at,
          id_token: s.id_token,
          username: u.username,
          email: u.email,
          email_verified: u.email_verified,
          language: u.language || 'de',
        };
      },
      async delete(tokenHash?: any) {
        await db.collection('sessions').deleteOne({ token_hash: tokenHash });
      },
      async deleteForUser(userId?: any) {
        if (!userId) return;
        await db.collection('sessions').deleteMany({ user_id: Number(userId) });
      },
      async cleanExpired() {
        await db.collection('sessions').deleteMany({ expires_at: { $lt: Date.now() } });
      },
    };
  }

  private build_aquariums() {
    const db = this.connection();
    const self = this;
    return {
      async listForUser(userId?: any) {
        const numUserId = Number(userId);
        const ownRows = await db.collection<Aquarium & { _id?: number }>('aquariums').find({ user_id: numUserId }).sort({ name: 1 }).toArray();
        const shareRows = await db
          .collection('aquarium_shares')
          .find({ user_id: numUserId, $or: [{ status: 'accepted' }, { status: { $exists: false } }] })
          .toArray();

        const sharedAqs = [];
        for (const s of shareRows) {
          const aq = await db.collection<Aquarium & { _id?: number }>('aquariums').findOne({ id: s.aquarium_id });
          if (aq) {
            sharedAqs.push({ ...aq, role: s.role });
          }
        }

        const all = [
          ...ownRows.map((a: any) => ({ ...a, role: 'owner' })),
          ...sharedAqs,
        ];

        // Owner-Benutzernamen ermitteln
        const userIds = Array.from(new Set(all.map((a: any) => a.user_id)));
        const users = await db.collection<UserRecord & { _id?: number }>('users').find({ id: { $in: userIds } }).toArray();
        const userMap = new Map<number, string>(users.map(u => [u.id, u.username]));

        const results = [];
        for (const aq of all) {
          aq.owner_username = userMap.get(aq.user_id) || null;
          results.push(await self.aquariums.getSummary(aq, aq.role));
        }

        results.sort((a?: any, b?: any) => (a.name || '').localeCompare(b.name || ''));
        return results;
      },
      async findById(id?: any) {
        const numId = Number(id);
        if (!Number.isInteger(numId)) return null;
        const aq = await db.collection<Aquarium & { _id?: number }>('aquariums').findOne({ id: numId });
        if (!aq) return null;
        const owner = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: aq.user_id });
        return {
          ...aq,
          owner_username: owner?.username || null,
          owner_email: owner?.email || null,
        };
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
        const id = await self.getNextSequence('aquariums');
        const doc: Record<string, any> = {
          _id: id,
          id,
          user_id: Number(user_id),
          name,
          volume_l: volume_l != null ? Number(volume_l) : null,
          water_type: water_type || 'fresh',
          reminder_days: reminder_days != null ? Number(reminder_days) : 7,
          notes: notes || null,
          motto: motto || null,
          description: description || null,
          image_file: null,
          measure_cycle_interval: measure_cycle_interval != null ? Number(measure_cycle_interval) : null,
          measure_cycle_unit: measure_cycle_unit || 'days',
          measure_cycle_day_of_week: measure_cycle_day_of_week != null ? Number(measure_cycle_day_of_week) : null,
          measure_reminder_mail: measure_reminder_mail ? 1 : 0,
          last_measure_reminder_sent_at: null,
          fertilize_cycle_interval: fertilize_cycle_interval != null ? Number(fertilize_cycle_interval) : null,
          fertilize_cycle_unit: fertilize_cycle_unit || 'days',
          fertilize_cycle_day_of_week: fertilize_cycle_day_of_week != null ? Number(fertilize_cycle_day_of_week) : null,
          fertilize_reminder_mail: fertilize_reminder_mail ? 1 : 0,
          last_fertilize_reminder_sent_at: null,
          created_at: new Date().toISOString(),
        };
        await db.collection('aquariums').insertOne(doc);
        return { id };
      },
      async update(id?: any, fields: any = {}) {
        const numId = Number(id);
        const updateFields: Record<string, any> = {};
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
            updateFields[k] = fields[k];
          }
        }

        if (Object.keys(updateFields).length === 0) return true;
        const res = await db.collection('aquariums').updateOne({ id: numId }, { $set: updateFields });
        return res.matchedCount > 0;
      },
      async listAllRaw() {
        return await db.collection<Aquarium & { _id?: number }>('aquariums').find({}).sort({ id: 1 }).toArray();
      },
      async updateReminderSent(id: number, type: 'measure' | 'fertilize', timestamp: string | null, expected?: string | null) {
        const numId = Number(id);
        const col = type === 'measure' ? 'last_measure_reminder_sent_at' : 'last_fertilize_reminder_sent_at';
        const res = await db.collection('aquariums').updateOne({ id: numId, ...(expected === undefined ? {} : { [col]: expected }) }, { $set: { [col]: timestamp } });
        return res.matchedCount > 0;
      },
      async updateImage(id?: any, filename?: any) {
        const numId = Number(id);
        const res = await db.collection('aquariums').updateOne({ id: numId }, { $set: { image_file: filename } });
        return res.matchedCount > 0;
      },
      async delete(id?: any, strictImages = false) {
        const numId = Number(id);
        const [aq, images, stocks] = await Promise.all([
          db.collection('aquariums').findOne({ id: numId }),
          db.collection('aquarium_images').find({ aquarium_id: numId }).toArray(),
          db.collection('stock').find({ aquarium_id: numId }).toArray(),
        ]);
        if (strictImages) {
          deleteImage(aq?.image_file, true);
          for (const image of images) deleteImage(image.filename, true);
          for (const stock of stocks) deleteImage(stock.image_file, true);
        }
        const res = await db.collection('aquariums').deleteOne({ id: numId });
        if (res.deletedCount === 0) return false;
        deleteImage(aq?.image_file);
        for (const image of images) deleteImage(image.filename);
        for (const stock of stocks) deleteImage(stock.image_file);
        // Cascade cleanup: independent collections can be removed concurrently.
        await Promise.all(['aquarium_images', 'aquarium_plants', 'stock', 'measurements', 'alerts', 'aquarium_shares', 'maintenance_logs', 'aquarium_chats', 'dosing_pumps']
          .map(collection => db.collection(collection).deleteMany({ aquarium_id: numId })));
        return true;
      },
      async countForUser(userId?: any) {
        return await db.collection('aquariums').countDocuments({ user_id: Number(userId) });
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
      async getSummary(aq?: any, role: any = null) {
        const last = await db.collection<Measurement & { _id?: number }>('measurements').findOne({ aquarium_id: aq.id }, { sort: { measured_at: -1 } });
        const lastWaterChange = await db
          .collection('maintenance_logs')
          .findOne({ aquarium_id: aq.id, type: 'water_change' }, { sort: { logged_at: -1 } });
        const lastMaintenance = await db.collection('maintenance_logs').findOne({ aquarium_id: aq.id }, { sort: { logged_at: -1 } });
        const lastFertilize = await db.collection('maintenance_logs').findOne({ aquarium_id: aq.id, type: { $in: ['fertilize', 'dosing_pump'] } }, { sort: { logged_at: -1 } });

        const crit = await db.collection('alerts').countDocuments({ aquarium_id: aq.id, acked_at: null, level: 'crit' });
        const warn = await db.collection('alerts').countDocuments({ aquarium_id: aq.id, acked_at: null, level: 'warn' });
        const sharesCount = await db
          .collection('aquarium_shares')
          .countDocuments({ aquarium_id: aq.id, $or: [{ status: 'accepted' }, { status: { $exists: false } }] });
        const imagesCount = await db.collection('aquarium_images').countDocuments({ aquarium_id: aq.id });

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
    const self = this;
    return {
      async listForAquarium(aquariumId?: any) {
        const numAqId = Number(aquariumId);
        const rows = await db.collection<AquariumImage & { _id?: number }>('aquarium_images').find({ aquarium_id: numAqId }).sort({ is_primary: -1, id: 1 }).toArray();
        return rows.map((r: any) => ({
          ...r,
          is_primary: Boolean(r.is_primary),
          url: `api/aquariums/${numAqId}/images/${r.id}`,
        }));
      },
      async findById(id?: any) {
        const row = await db.collection<AquariumImage & { _id?: number }>('aquarium_images').findOne({ id: Number(id) });
        if (!row) return null;
        return {
          ...row,
          is_primary: Boolean(row.is_primary),
          url: `api/aquariums/${row.aquarium_id}/images/${row.id}`,
        };
      },
      async create({ aquarium_id, filename, caption = null, is_primary = 0 }: any) {
        const id = await self.getNextSequence('aquarium_images');
        const numAqId = Number(aquarium_id);
        const count = await db.collection('aquarium_images').countDocuments({ aquarium_id: numAqId });
        const makePrimary = is_primary ? 1 : count === 0 ? 1 : 0;
        if (makePrimary) {
          await db.collection('aquarium_images').updateMany({ aquarium_id: numAqId }, { $set: { is_primary: 0 } });
          await db.collection('aquariums').updateOne({ id: numAqId }, { $set: { image_file: filename } });
        }
        const doc: Record<string, any> = {
          _id: id,
          id,
          aquarium_id: numAqId,
          filename,
          caption: caption || null,
          is_primary: makePrimary,
          created_at: new Date().toISOString(),
        };
        await db.collection('aquarium_images').insertOne(doc);
        return { id, filename, caption, is_primary: Boolean(makePrimary) };
      },
      async setPrimary(id?: any, aquariumId?: any) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = await db.collection<AquariumImage & { _id?: number }>('aquarium_images').findOne({ id: numId, aquarium_id: numAqId });
        if (!img) return false;
        await db.collection('aquarium_images').updateMany({ aquarium_id: numAqId }, { $set: { is_primary: 0 } });
        await db.collection('aquarium_images').updateOne({ id: numId }, { $set: { is_primary: 1 } });
        await db.collection('aquariums').updateOne({ id: numAqId }, { $set: { image_file: img.filename } });
        return true;
      },
      async updateCaption(id?: any, aquariumId?: any, caption?: any) {
        const res = await db.collection('aquarium_images').updateOne(
          { id: Number(id), aquarium_id: Number(aquariumId) },
          { $set: { caption } }
        );
        return res.matchedCount > 0;
      },
      async delete(id?: any, aquariumId?: any) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = await db.collection<AquariumImage & { _id?: number }>('aquarium_images').findOne({ id: numId, aquarium_id: numAqId });
        if (!img) return false;
        deleteImage(img.filename);
        const res = await db.collection('aquarium_images').deleteOne({ id: numId });
        const nextImg = await db.collection<AquariumImage & { _id?: number }>('aquarium_images').findOne({ aquarium_id: numAqId }, { sort: { is_primary: -1, id: 1 } });
        if (nextImg) {
          if (!nextImg.is_primary) {
            await db.collection('aquarium_images').updateOne({ id: nextImg.id }, { $set: { is_primary: 1 } });
          }
          await db.collection('aquariums').updateOne({ id: numAqId }, { $set: { image_file: nextImg.filename } });
        } else {
          await db.collection('aquariums').updateOne({ id: numAqId }, { $set: { image_file: null } });
        }
        return res.deletedCount > 0;
      },
      async deleteAllForAquarium(aquariumId?: any) {
        const numAqId = Number(aquariumId);
        const rows = await db.collection<AquariumImage & { _id?: number }>('aquarium_images').find({ aquarium_id: numAqId }).toArray();
        for (const r of rows) {
          deleteImage(r.filename);
        }
        await db.collection('aquarium_images').deleteMany({ aquarium_id: numAqId });
      },
    };
  }

  private build_shares() {
    const db = this.connection();

    return {
      async listForAquarium(aquariumId?: any) {
        const shares = await db.collection<AquariumShare & { _id?: number }>('aquarium_shares').find({ aquarium_id: Number(aquariumId) }).sort({ created_at: 1 }).toArray();
        if (shares.length === 0) return [];
        const userIds = shares.map((s: any) => s.user_id);
        const users = await db.collection<UserRecord & { _id?: number }>('users').find({ id: { $in: userIds } }).toArray();
        const userMap = new Map<number, { username: string; email?: string }>(users.map((u: any) => [u.id, u]));

        return shares.map((s: any) => {
          const u = userMap.get(s.user_id);
          return {
            aquarium_id: s.aquarium_id,
            user_id: s.user_id,
            role: s.role,
            status: s.status || 'accepted',
            token: s.token || null,
            token_expires: s.token_expires || null,
            created_at: s.created_at,
            accepted_at: s.accepted_at || null,
            username: u?.username || '',
            email: u?.email || null,
          };
        });
      },
      async listPendingForUser(userId?: any) {
        const numUserId = Number(userId);
        const shares = await db
          .collection('aquarium_shares')
          .find({ user_id: numUserId, status: 'pending' })
          .sort({ created_at: -1 })
          .toArray();
        if (shares.length === 0) return [];

        const results = [];
        for (const s of shares) {
          const aq = await db.collection<Aquarium & { _id?: number }>('aquariums').findOne({ id: s.aquarium_id });
          if (!aq) continue;
          const owner = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: aq.user_id });
          results.push({
            aquarium_id: s.aquarium_id,
            user_id: s.user_id,
            role: s.role,
            status: s.status,
            token: s.token || null,
            token_expires: s.token_expires || null,
            created_at: s.created_at,
            aquarium_name: aq.name,
            water_type: aq.water_type,
            volume_l: aq.volume_l,
            owner_username: owner?.username || '',
            owner_email: owner?.email || null,
          });
        }
        return results;
      },
      async find(aquariumId?: any, userId?: any) {
        return (await db.collection<AquariumShare & { _id?: number }>('aquarium_shares').findOne({ aquarium_id: Number(aquariumId), user_id: Number(userId) })) || null;
      },
      async findByToken(token?: any) {
        if (!token) return null;
        const s = await db.collection<AquariumShare & { _id?: number }>('aquarium_shares').findOne({ token: String(token) });
        if (!s) return null;
        const aq = await db.collection<Aquarium & { _id?: number }>('aquariums').findOne({ id: s.aquarium_id });
        if (!aq) return null;
        const owner = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: aq.user_id });
        const targetUser = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: s.user_id });
        return {
          ...s,
          aquarium_name: aq.name,
          water_type: aq.water_type,
          volume_l: aq.volume_l,
          owner_username: owner?.username || '',
          owner_email: owner?.email || null,
          target_username: targetUser?.username || '',
          target_email: targetUser?.email || null,
        };
      },
      async upsert(aquariumId?: any, userId?: any, role?: any, status: any = 'pending', token: any = null, tokenExpires: any = null) {
        await db.collection('aquarium_shares').updateOne(
          { aquarium_id: Number(aquariumId), user_id: Number(userId) },
          {
            $set: {
              role,
              status,
              token,
              token_expires: tokenExpires,
              created_at: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      },
      async updateRole(aquariumId?: any, userId?: any, role?: any) {
        const res = await db.collection('aquarium_shares').updateOne(
          { aquarium_id: Number(aquariumId), user_id: Number(userId) },
          { $set: { role } }
        );
        return res.matchedCount > 0;
      },
      async accept(aquariumId?: any, userId?: any) {
        const res = await db.collection('aquarium_shares').updateOne(
          { aquarium_id: Number(aquariumId), user_id: Number(userId), status: 'pending',
            $or: [{ token_expires: null }, { token_expires: { $gte: Date.now() } }] },
          {
            $set: {
              status: 'accepted',
              accepted_at: new Date().toISOString(),
              token: null,
              token_expires: null,
            },
          }
        );
        return res.matchedCount > 0;
      },
      async acceptByToken(token?: any, userId: any = null) {
        if (!token) return false;
        const filter: Record<string, any> = { token: String(token), status: 'pending', $or: [{ token_expires: null }, { token_expires: { $gte: Date.now() } }] };
        if (userId != null) filter.user_id = Number(userId);
        const res = await db.collection('aquarium_shares').updateOne(
          filter,
          {
            $set: {
              status: 'accepted',
              accepted_at: new Date().toISOString(),
              token: null,
              token_expires: null,
            },
          }
        );
        return res.matchedCount > 0;
      },
      async decline(aquariumId?: any, userId?: any) {
        const res = await db.collection('aquarium_shares').deleteOne({ aquarium_id: Number(aquariumId), user_id: Number(userId) });
        return res.deletedCount > 0;
      },
      async declineByToken(token?: any) {
        if (!token) return false;
        const res = await db.collection('aquarium_shares').deleteOne({ token: String(token) });
        return res.deletedCount > 0;
      },
      async delete(aquariumId?: any, userId?: any) {
        const res = await db.collection('aquarium_shares').deleteOne({ aquarium_id: Number(aquariumId), user_id: Number(userId) });
        return res.deletedCount > 0;
      },
      async count(aquariumId?: any) {
        return await db.collection('aquarium_shares').countDocuments({
          aquarium_id: Number(aquariumId),
          $or: [{ status: 'accepted' }, { status: { $exists: false } }],
        });
      },
    };
  }

  private build_stock() {
    const db = this.connection();
    const self = this;
    return {
      async listForAquarium(aquariumId?: any) {
        const rows = await db.collection<StockRecord & { _id?: number }>('stock').find({ aquarium_id: Number(aquariumId) }).sort({ species: 1, id: 1 }).toArray();
        return rows.map((s: any) => ({
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        }));
      },
      async findById(id?: any) {
        const s = await db.collection<StockRecord & { _id?: number }>('stock').findOne({ id: Number(id) });
        if (!s) return null;
        return {
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        };
      },
      async create({ aquarium_id, species, count = 1, profile = 'allgemein', name = null, image_file = null }: any) {
        const id = await self.getNextSequence('stock');
        const doc: Record<string, any> = {
          _id: id,
          id,
          aquarium_id: Number(aquarium_id),
          species,
          count: count != null ? Number(count) : 1,
          profile: profile || 'allgemein',
          name: name || null,
          image_file: image_file || null,
        };
        await db.collection('stock').insertOne(doc);
        return { id };
      },
      async createMany(rows?: any) {
        if (!rows.length) return [];
        const end = await self.getNextSequence('stock', rows.length);
        const docs = rows.map((row?: any, index?: any) => {
          const id = end - rows.length + index + 1;
          return { ...row, _id: id, id, aquarium_id: Number(row.aquarium_id), image_file: null };
        });
        try { await db.collection('stock').insertMany(docs, { ordered: true }); }
        catch (caught: unknown) {
          const error = asError(caught);
          // Remove only this request's reserved IDs if a bulk insert fails halfway.
          await db.collection('stock').deleteMany({ _id: { $in: docs.map((row: any) => row._id) } });
          throw error;
        }
        return docs.map(({ id }: any) => ({ id }));
      },
      async update(id?: any, fields: any = {}) {
        const numId = Number(id);
        const updateFields: Record<string, any> = {};
        const allowed = ['species', 'count', 'profile', 'name', 'image_file'];
        for (const k of allowed) {
          if (fields[k] !== undefined) {
            updateFields[k] = fields[k];
          }
        }
        if (Object.keys(updateFields).length === 0) return true;
        const res = await db.collection('stock').updateOne({ id: numId }, { $set: updateFields });
        return res.matchedCount > 0;
      },
      async updateImage(id?: any, filename?: any) {
        const res = await db.collection('stock').updateOne({ id: Number(id) }, { $set: { image_file: filename } });
        return res.matchedCount > 0;
      },
      async delete(id?: any, aquariumId: any = null) {
        const filter: Record<string, any> = { id: Number(id) };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const s = await db.collection<StockRecord & { _id?: number }>('stock').findOne(filter);
        if (s?.image_file) {
          deleteImage(s.image_file);
        }
        const res = await db.collection('stock').deleteOne(filter);
        return res.deletedCount > 0;
      },
      async deleteAllForAquarium(aquariumId?: any) {
        const numAqId = Number(aquariumId);
        const rows = await db.collection<StockRecord & { _id?: number }>('stock').find({ aquarium_id: numAqId }).toArray();
        for (const r of rows) {
          if (r.image_file) deleteImage(r.image_file);
        }
        await db.collection('stock').deleteMany({ aquarium_id: numAqId });
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

        const dateFilter: Record<string, any> = { $gte: since };
        if (until) {
          dateFilter.$lte = until;
        }

        let query = db.collection<Measurement & { _id?: number }>('measurements').find({
          aquarium_id: Number(aquariumId),
          measured_at: dateFilter,
        }).sort({ measured_at: -1 });

        if (options.limit && Number.isFinite(Number(options.limit))) {
          query = query.limit(Number(options.limit));
        }

        const ms = await query.toArray();
        if (ms.length === 0) return [];

        const measIds = ms.map((m: any) => m.id);
        const creatorIds = Array.from(new Set(ms.map((m: any) => m.created_by).filter(Boolean)));
        const users = creatorIds.length > 0 ? await db.collection<UserRecord & { _id?: number }>('users').find({ id: { $in: creatorIds } }).toArray() : [];
        const userMap = new Map<number, string>(users.map(u => [u.id, u.username]));

        const alerts = await db.collection('alerts').find({ measurement_id: { $in: measIds } }).toArray();
        const alertsByMeas = new Map();
        for (const al of alerts) {
          if (!alertsByMeas.has(al.measurement_id)) alertsByMeas.set(al.measurement_id, []);
          alertsByMeas.get(al.measurement_id).push(al);
        }

        return ms.map((m: any) => ({
          id: m.id,
          measured_at: m.measured_at,
          note: m.note || null,
          created_by: m.created_by || null,
          created_by_username: m.created_by ? userMap.get(m.created_by) || null : null,
          values: m.values || {},
          alerts: alertsByMeas.get(m.id) || [],
        }));
      },
      async findById(id?: any) {
        return (await db.collection<Measurement & { _id?: number }>('measurements').findOne({ id: Number(id) })) || null;
      },
      async findLastForAquarium(aquariumId?: any) {
        return (await db.collection<Measurement & { _id?: number }>('measurements').findOne({ aquarium_id: Number(aquariumId) }, { sort: { measured_at: -1 } })) || null;
      },
      async create({ aquarium_id, measured_at, note = null, created_by = null, values = {}, alerts = [], suite_id = null, test_selection = undefined }: any) {
        const measId = await self.getNextSequence('measurements');
        const doc: Record<string, any> = {
          _id: measId,
          id: measId,
          aquarium_id: Number(aquarium_id),
          measured_at,
          note: note || null,
          created_by: created_by ? Number(created_by) : null,
          values: values || {},
        };
        await db.collection('measurements').insertOne(doc);

        for (const a of alerts) {
          const alertId = await self.getNextSequence('alerts');
          await db.collection('alerts').insertOne({
            _id: alertId,
            id: alertId,
            aquarium_id: Number(aquarium_id),
            measurement_id: measId,
            param: a.param,
            level: a.level,
            value: a.value,
            message: a.message,
            created_at: new Date().toISOString(),
            acked_at: null,
          });
        }

        if (created_by) await require('../services/test-inventory-service').recordUsage(self, created_by, values, suite_id, test_selection);
        return { id: measId };
      },
      async delete(id?: any, aquariumId: any = null) {
        const numId = Number(id);
        const filter: Record<string, any> = { id: numId };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const res = await db.collection('measurements').deleteOne(filter);
        if (res.deletedCount > 0) {
          await db.collection('alerts').deleteMany({ measurement_id: numId });
          return true;
        }
        return false;
      },
      async getLatestValues(aquariumId?: any, thresholds: any = {}) {
        const ms = await db.collection<Measurement & { _id?: number }>('measurements').find({ aquarium_id: Number(aquariumId) }).sort({ measured_at: -1 }).toArray();
        const latest: Record<string, any> = {};
        for (const m of ms) {
          for (const [param, val] of Object.entries(m.values || {})) {
            if (!latest[param]) {
              latest[param] = {
                value: val,
                measured_at: m.measured_at,
                status: cfg.evaluate(thresholds[param], Number(val)),
              };
            }
          }
        }
        return latest;
      },
    };
  }

  private build_alerts() {
    const db = this.connection();
    const self = this;
    return {
      async listOpenForAquarium(aquariumId?: any) {
        const rows = await db.collection('alerts').find({ aquarium_id: Number(aquariumId), acked_at: null }).toArray();
        rows.sort((a?: any, b?: any) => {
          if (a.level === 'crit' && b.level !== 'crit') return -1;
          if (a.level !== 'crit' && b.level === 'crit') return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return rows;
      },
      async listAllForAquarium(aquariumId?: any) {
        return await db.collection('alerts').find({ aquarium_id: Number(aquariumId) }).sort({ created_at: -1 }).toArray();
      },
      async create({ aquarium_id, measurement_id = null, param, level, value, message }: any) {
        const id = await self.getNextSequence('alerts');
        const doc: Record<string, any> = {
          _id: id,
          id,
          aquarium_id: Number(aquarium_id),
          measurement_id: measurement_id ? Number(measurement_id) : null,
          param,
          level,
          value: Number(value),
          message,
          created_at: new Date().toISOString(),
          acked_at: null,
        };
        await db.collection('alerts').insertOne(doc);
        return { id };
      },
      async ack(id?: any, aquariumId?: any) {
        const res = await db.collection('alerts').updateOne(
          { id: Number(id), aquarium_id: Number(aquariumId), acked_at: null },
          { $set: { acked_at: new Date().toISOString() } }
        );
        return res.modifiedCount > 0;
      },
      async ackAll(aquariumId?: any) {
        const res = await db.collection('alerts').updateMany(
          { aquarium_id: Number(aquariumId), acked_at: null },
          { $set: { acked_at: new Date().toISOString() } }
        );
        return res.modifiedCount;
      },
      async countOpen(aquariumId?: any) {
        const crit = await db.collection('alerts').countDocuments({ aquarium_id: Number(aquariumId), acked_at: null, level: 'crit' });
        const warn = await db.collection('alerts').countDocuments({ aquarium_id: Number(aquariumId), acked_at: null, level: 'warn' });
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
        const filter: Record<string, any> = {
          aquarium_id: Number(aquariumId),
          logged_at: { $gte: since },
        };
        if (options.type) filter.type = options.type;

        let query = db.collection('maintenance_logs').find(filter).sort({ logged_at: -1 });
        if (options.limit && Number.isFinite(Number(options.limit))) {
          query = query.limit(Number(options.limit));
        }

        const logs = await query.toArray();
        if (logs.length === 0) return [];

        const creatorIds = Array.from(new Set(logs.map((l: any) => l.created_by).filter(Boolean)));
        const users = creatorIds.length > 0 ? await db.collection<UserRecord & { _id?: number }>('users').find({ id: { $in: creatorIds } }).toArray() : [];
        const userMap = new Map<number, string>(users.map(u => [u.id, u.username]));

        return logs.map((l: any) => ({
          ...l,
          created_by_username: l.created_by ? userMap.get(l.created_by) || null : null,
        }));
      },
      async findById(id?: any) {
        return (await db.collection('maintenance_logs').findOne({ id: Number(id) })) || null;
      },
      async findLastByType(aquariumId?: any, type?: any) {
        return (await db.collection('maintenance_logs').findOne({ aquarium_id: Number(aquariumId), type: String(type) }, { sort: { logged_at: -1 } })) || null;
      },
      async create({ aquarium_id, logged_at, type, percentage = null, details = null, note = null, created_by = null }: any) {
        const id = await self.getNextSequence('maintenance_logs');
        const doc: Record<string, any> = {
          _id: id,
          id,
          aquarium_id: Number(aquarium_id),
          logged_at,
          type,
          percentage: percentage != null ? Number(percentage) : null,
          details: details || null,
          note: note || null,
          created_by: created_by ? Number(created_by) : null,
          created_at: new Date().toISOString(),
        };
        await db.collection('maintenance_logs').insertOne(doc);
        return { id };
      },
      async update(id?: any, aquariumId?: any, fields: any = {}) {
        const numId = Number(id);
        const updateFields: Record<string, any> = {};
        const allowed = ['logged_at', 'type', 'percentage', 'details', 'note'];

        for (const k of allowed) {
          if (fields[k] !== undefined) {
            updateFields[k] = fields[k];
          }
        }

        if (Object.keys(updateFields).length === 0) return true;
        const res = await db.collection('maintenance_logs').updateOne(
          { id: numId, aquarium_id: Number(aquariumId) },
          { $set: updateFields }
        );
        return res.matchedCount > 0;
      },
      async delete(id?: any, aquariumId: any = null) {
        const numId = Number(id);
        const filter: Record<string, any> = { id: numId };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const res = await db.collection('maintenance_logs').deleteOne(filter);
        return res.deletedCount > 0;
      },
      async getTimeline(aquariumId?: any, options: any = {}) {
        const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const filterKind = options.kind || 'all';

        const timeline = [];

        if (filterKind === 'all' || filterKind === 'maintenance' || cfg.maintenanceService.MAINTENANCE_TYPES[filterKind]) {
          const filter: Record<string, any> = {
            aquarium_id: Number(aquariumId),
            logged_at: { $gte: since },
          };
          if (cfg.maintenanceService.MAINTENANCE_TYPES[filterKind]) {
            filter.type = filterKind;
          }

          const maintRows = await db.collection('maintenance_logs').find(filter).sort({ logged_at: -1 }).toArray();
          const creatorIds = Array.from(new Set(maintRows.map((r: any) => r.created_by).filter(Boolean)));
          const users = creatorIds.length > 0 ? await db.collection<UserRecord & { _id?: number }>('users').find({ id: { $in: creatorIds } }).toArray() : [];
          const userMap = new Map<number, string>(users.map(u => [u.id, u.username]));

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
              created_by_username: row.created_by ? userMap.get(row.created_by) || null : null,
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
        return (
          (await db.collection('maintenance_logs').findOne({ aquarium_id: Number(aquariumId) }, { sort: { logged_at: -1 } })) || null
        );
      },
      async getLatestWaterChange(aquariumId?: any) {
        return (
          (await db.collection('maintenance_logs').findOne({ aquarium_id: Number(aquariumId), type: 'water_change' }, { sort: { logged_at: -1 } })) || null
        );
      },
    };
  }

  private build_invitations() {
    const db = this.connection();
    const self = this;
    return {
      async findById(id?: any) {
        if (!id) return null;
        const inv = await db.collection<Invitation & { _id?: number }>('invitations').findOne({ id: Number(id) });
        if (!inv) return null;
        if (inv.created_by) {
          const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: inv.created_by });
          inv.created_by_username = u ? u.username : null;
        }
        return inv;
      },
      async findByCode(code?: any) {
        if (!code) return null;
        const inv = await db.collection<Invitation & { _id?: number }>('invitations').findOne(
          { code: { $regex: new RegExp(`^${escapeRegex(String(code).trim())}$`, 'i') } }
        );
        if (!inv) return null;
        if (inv.created_by) {
          const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: inv.created_by });
          inv.created_by_username = u ? u.username : null;
        }
        return inv;
      },
      async findByEmail(email?: any) {
        if (!email) return [];
        const invs = await db.collection<Invitation & { _id?: number }>('invitations').find(
          { email: { $regex: new RegExp(`^${escapeRegex(String(email).trim())}$`, 'i') } }
        ).sort({ id: -1 }).toArray();
        for (const inv of invs) {
          if (inv.created_by) {
            const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: inv.created_by });
            inv.created_by_username = u ? u.username : null;
          }
        }
        return invs;
      },
      async listAll() {
        const invs = await db.collection<Invitation & { _id?: number }>('invitations').find({}).sort({ id: -1 }).toArray();
        for (const inv of invs) {
          if (inv.created_by) {
            const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: inv.created_by });
            inv.created_by_username = u ? u.username : null;
          }
        }
        return invs;
      },
      async listForUser(userId?: any) {
        const invs = await db.collection<Invitation & { _id?: number }>('invitations').find({ created_by: Number(userId) }).sort({ id: -1 }).toArray();
        for (const inv of invs) {
          if (inv.created_by) {
            const u = await db.collection<UserRecord & { _id?: number }>('users').findOne({ id: inv.created_by });
            inv.created_by_username = u ? u.username : null;
          }
        }
        return invs;
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
        const id = await self.getNextSequence('invitations');
        const doc: Record<string, any> = {
          _id: id,
          id,
          code: String(code).trim(),
          type,
          email: email ? String(email).trim().toLowerCase() : null,
          created_by: created_by != null ? Number(created_by) : null,
          max_uses: max_uses != null ? Number(max_uses) : 1,
          used_count: used_count != null ? Number(used_count) : 0,
          expires_at: Number(expires_at),
          note: note ? String(note).trim() : null,
          created_at: new Date().toISOString(),
        };
        await db.collection('invitations').insertOne(doc);
        return this.findById(id);
      },
      async use(id?: any) {
        const res = await db.collection('invitations').updateOne(
          { id: Number(id), expires_at: { $gte: Date.now() }, $or: [
            { max_uses: null }, { max_uses: { $lte: 0 } }, { $expr: { $lt: ['$used_count', '$max_uses'] } },
          ] }, { $inc: { used_count: 1 } },
        );
        return res.modifiedCount > 0;
      },
      async releaseUse(id: number) {
        await db.collection('invitations').updateOne({ id, used_count: { $gt: 0 } }, { $inc: { used_count: -1 } });
      },
      async delete(id?: any, createdBy: any = null) {
        const filter: Record<string, any> = { id: Number(id) };
        if (createdBy != null) filter.created_by = Number(createdBy);
        const res = await db.collection('invitations').deleteOne(filter);
        return res.deletedCount > 0;
      },
    };
  }

  private build_aquariumChats() {
    const db = this.connection();
    const self = this;
    return {
      async listForAquarium(aquariumId?: any, options: any = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
        const docs = await db
          .collection('aquarium_chats')
          .find({ aquarium_id: Number(aquariumId) })
          .sort({ id: -1 })
          .limit(limit)
          .toArray();

        return docs.reverse().map((d: any) => ({
          id: d.id,
          aquarium_id: d.aquarium_id,
          user_id: d.user_id != null ? d.user_id : null,
          role: d.role,
          content: d.content,
          provider: d.provider || null,
          model: d.model || null,
          created_at: d.created_at,
        }));
      },
      async create({ aquariumId, userId = null, role, content, provider = null, model = null, createdAt = null }: any) {
        const id = await self.getNextSequence('aquarium_chats');
        const ts = createdAt || new Date().toISOString();
        const doc: Record<string, any> = {
          _id: id,
          id,
          aquarium_id: Number(aquariumId),
          user_id: userId != null ? Number(userId) : null,
          role: String(role || 'user'),
          content: String(content || ''),
          provider: provider ? String(provider) : null,
          model: model ? String(model) : null,
          created_at: ts,
        };
        await db.collection('aquarium_chats').insertOne(doc);
        return {
          id: doc.id,
          aquarium_id: doc.aquarium_id,
          user_id: doc.user_id,
          role: doc.role,
          content: doc.content,
          provider: doc.provider,
          model: doc.model,
          created_at: doc.created_at,
        };
      },
      async clearForAquarium(aquariumId?: any) {
        const res = await db.collection('aquarium_chats').deleteMany({ aquarium_id: Number(aquariumId) });
        return res.deletedCount > 0;
      },
      async countForAquarium(aquariumId?: any) {
        return await db.collection('aquarium_chats').countDocuments({ aquarium_id: Number(aquariumId) });
      },
    };
  }

  private build_dosingPumps() {
    const db = this.connection();
    const self = this;
    return {
      async listForAquarium(aquariumId?: any) {
        const rows = await db.collection('dosing_pumps').find({ aquarium_id: Number(aquariumId) }).sort({ id: 1 }).toArray();
        return rows.map((r: any) => ({
          mode: (r.mode === 'manual' ? 'manual' : 'automatic') as 'manual' | 'automatic', reminder_mail: (r.reminder_mail ? 1 : 0) as 0 | 1, last_reminder_sent_at: r.last_reminder_sent_at || null, schedule_started_at: r.schedule_started_at || r.created_at,
          id: r.id,
          aquarium_id: r.aquarium_id,
          name: r.name,
          fertilizer_name: r.fertilizer_name,
          amount_ml: r.amount_ml,
          interval_days: r.interval_days,
          time_of_day: r.time_of_day || null,
          last_dosed_at: r.last_dosed_at || null,
          is_active: (r.is_active !== undefined ? (r.is_active ? 1 : 0) : 1) as 0 | 1,
          note: r.note || null,
          created_at: r.created_at,
        }));
      },
      async findById(id?: any) {
        const r = await db.collection('dosing_pumps').findOne({ id: Number(id) });
        if (!r) return null;
        return {
          mode: (r.mode === 'manual' ? 'manual' : 'automatic') as 'manual' | 'automatic', reminder_mail: (r.reminder_mail ? 1 : 0) as 0 | 1, last_reminder_sent_at: r.last_reminder_sent_at || null, schedule_started_at: r.schedule_started_at || r.created_at,
          id: r.id,
          aquarium_id: r.aquarium_id,
          name: r.name,
          fertilizer_name: r.fertilizer_name,
          amount_ml: r.amount_ml,
          interval_days: r.interval_days,
          time_of_day: r.time_of_day || null,
          last_dosed_at: r.last_dosed_at || null,
          is_active: (r.is_active !== undefined ? (r.is_active ? 1 : 0) : 1) as 0 | 1,
          note: r.note || null,
          created_at: r.created_at,
        };
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
        const id = await self.getNextSequence('dosing_pumps');
        const doc: Record<string, any> = {
          _id: id,
          id,
          aquarium_id: Number(aquarium_id),
          name: String(name).trim(),
          fertilizer_name: String(fertilizer_name).trim(),
          amount_ml: Number(amount_ml),
          interval_days: Number(interval_days) || 1,
          time_of_day: time_of_day ? String(time_of_day).trim() : null,
          last_dosed_at: null,
          is_active: (is_active ? 1 : 0) as 0 | 1,
          note: note ? String(note).trim() : null,
          mode, reminder_mail: reminder_mail ? 1 : 0, last_reminder_sent_at: null, schedule_started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        await db.collection('dosing_pumps').insertOne(doc);
        return {
          mode: doc.mode, reminder_mail: doc.reminder_mail, last_reminder_sent_at: doc.last_reminder_sent_at, schedule_started_at: doc.schedule_started_at,
          id: doc.id,
          aquarium_id: doc.aquarium_id,
          name: doc.name,
          fertilizer_name: doc.fertilizer_name,
          amount_ml: doc.amount_ml,
          interval_days: doc.interval_days,
          time_of_day: doc.time_of_day,
          last_dosed_at: doc.last_dosed_at,
          is_active: doc.is_active,
          note: doc.note,
          created_at: doc.created_at,
        };
      },
      async update(id?: any, aquariumId?: any, fields: any = {}) {
        const numId = Number(id);
        const updateFields: Record<string, any> = {};
        const allowed = ['name', 'fertilizer_name', 'amount_ml', 'interval_days', 'time_of_day', 'is_active', 'note', 'last_dosed_at', 'mode', 'reminder_mail', 'schedule_started_at', 'last_reminder_sent_at'];
        for (const k of allowed) {
          if (fields[k] !== undefined) {
            if (k === 'amount_ml') updateFields[k] = Number(fields[k]);
            else if (k === 'interval_days' || k === 'is_active' || k === 'reminder_mail') updateFields[k] = Number(fields[k]);
            else if (fields[k] == null) updateFields[k] = null;
            else updateFields[k] = String(fields[k]).trim();
          }
        }
        if (Object.keys(updateFields).length === 0) return await this.findById(numId);
        const filter: Record<string, any> = { id: numId };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        await db.collection('dosing_pumps').updateOne(filter, { $set: updateFields });
        return await this.findById(numId);
      },
      async delete(id?: any, aquariumId: any = null) {
        const filter: Record<string, any> = { id: Number(id) };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const res = await db.collection('dosing_pumps').deleteOne(filter);
        return res.deletedCount > 0;
      },
      async updateReminderSent(id: number, aquariumId: number, timestamp: string | null, expected: string | null) {
        const result = await db.collection('dosing_pumps').updateOne({ id, aquarium_id: aquariumId, mode: 'manual', reminder_mail: 1, is_active: 1, last_reminder_sent_at: expected }, { $set: { last_reminder_sent_at: timestamp } });
        return result.modifiedCount > 0;
      },
      async logDosing(id?: any, aquariumId?: any, userId: any = null, timestamp: any = null, automatic = false) {
        const pump = await this.findById(id);
        if (!pump || pump.aquarium_id !== Number(aquariumId) || (automatic ? pump.mode !== 'automatic' || !pump.is_active : pump.mode !== 'manual')) return null;
        const loggedAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
          if (automatic && new Date(loggedAt) < new Date(pump.schedule_started_at)) return null;
        const key = automatic ? `pump:${pump.id}:${loggedAt}` : null;
        let logId: number, created = true;
        try {
          logId = await self.getNextSequence('maintenance_logs');
          await db.collection('maintenance_logs').insertOne({ _id: logId, id: logId, aquarium_id: pump.aquarium_id, logged_at: loggedAt,
            type: automatic ? 'dosing_pump' : 'fertilize', details: `${pump.amount_ml} ml ${pump.fertilizer_name} (${pump.name})`, note: pump.note,
            created_by: automatic ? null : userId, percentage: null, created_at: new Date().toISOString(), ...(key ? { automation_key: key } : {}) });
        } catch (error) {
          if (!key || (error as { code?: number }).code !== 11000) throw error;
          const existing = await db.collection('maintenance_logs').findOne({ automation_key: key });
          if (!existing) throw error;
          logId = existing.id;created = false;
        }
        await db.collection('dosing_pumps').updateOne({ id: pump.id, aquarium_id: pump.aquarium_id, $or: [{ last_dosed_at: null }, { last_dosed_at: { $lt: loggedAt } }] }, { $set: { last_dosed_at: loggedAt, last_reminder_sent_at: null } });
        return { success: true, created, log_id: logId, logged_at: loggedAt };
      },
    };
  }
}

export = MongoAdapter;
