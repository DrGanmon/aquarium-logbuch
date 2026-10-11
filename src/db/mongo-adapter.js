'use strict';
const { MongoClient } = require('mongodb');
const { MONGODB_URI, MONGODB_DB_NAME } = require('../config/env');
const cfg = require('../../config');
const { isOverdue } = require('../services/aquarium-service');
const { calculateCycleStatus } = require('../services/reminder-service');
const { deleteImage } = require('../services/image-service');

function escapeRegex(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class MongoAdapter {
  constructor(options = {}) {
    this.type = 'mongodb';
    this.uri = options.uri || MONGODB_URI;
    this.dbName = options.dbName || MONGODB_DB_NAME || '';
    this.client = null;
    this.db = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized && this.db) return this;

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
      } catch (e) {
        this.db = this.client.db('aquarium');
      }
    }

    await this._createIndexes();
    this._setupRepositories();
    this._initialized = true;
    return this;
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
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

  async getNextSequence(name) {
    const res = await this.db.collection('counters').findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    return res?.seq ?? res?.value?.seq ?? 1;
  }

  async _createIndexes() {
    const db = this.db;
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
    } catch (e) {
      // Index creation warnings in mock/memory environments ignored
    }
  }

  _setupRepositories() {
    const db = this.db;
    const self = this;

    this.users = {
      async findById(id) {
        if (!id) return null;
        const u = await db.collection('users').findOne({ id: Number(id) });
        return u || null;
      },
      async findByUsername(username, excludeId = null) {
        if (!username) return null;
        const filter = { username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } };
        if (excludeId != null) filter.id = { $ne: Number(excludeId) };
        return (await db.collection('users').findOne(filter)) || null;
      },
      async findByEmail(email, excludeId = null) {
        if (!email) return null;
        const filter = { email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } };
        if (excludeId != null) filter.id = { $ne: Number(excludeId) };
        return (await db.collection('users').findOne(filter)) || null;
      },
      async findByOidcSub(oidcSub, excludeId = null) {
        if (!oidcSub) return null;
        const filter = { oidc_sub: String(oidcSub) };
        if (excludeId != null) filter.id = { $ne: Number(excludeId) };
        return (await db.collection('users').findOne(filter)) || null;
      },
      async findByEmailVerifyToken(token) {
        if (!token) return null;
        return (await db.collection('users').findOne({ email_verify_token: String(token) })) || null;
      },
      async findByPasswordResetToken(token) {
        if (!token) return null;
        return (await db.collection('users').findOne({ password_reset_token: String(token) })) || null;
      },
      async findByDeleteToken(token) {
        if (!token) return null;
        return (await db.collection('users').findOne({ account_delete_token: String(token) })) || null;
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
      }) {
        const id = await self.getNextSequence('users');
        const doc = {
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
          language: language === 'en' ? 'en' : 'de',
          created_at: new Date().toISOString(),
        };
        await db.collection('users').insertOne(doc);
        return { id, username, email, oidc_sub, email_verified: email_verified ? 1 : 0, language: doc.language };
      },
      async update(id, fields = {}) {
        const numId = Number(id);
        const updateFields = {};
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
          'openai_api_key',
          'openai_model',
          'gemini_api_key',
          'gemini_model',
          'claude_api_key',
          'claude_model',
          'ai_provider',
          'language',
        ];

        for (const k of allowed) {
          if (fields[k] !== undefined) {
            let val = fields[k];
            if (k === 'email_verified') val = val ? 1 : 0;
            updateFields[k] = val;
          }
        }

        if (Object.keys(updateFields).length === 0) return true;
        const res = await db.collection('users').updateOne({ id: numId }, { $set: updateFields });
        return res.matchedCount > 0;
      },
      async delete(id) {
        const numId = Number(id);
        const user = await db.collection('users').findOne({ id: numId });
        if (user && user.avatar_file) {
          deleteImage(user.avatar_file);
        }
        const res = await db.collection('users').deleteOne({ id: numId });
        if (res.deletedCount === 0) return false;

        // Cascade cleanup
        await db.collection('sessions').deleteMany({ user_id: numId });
        const aqs = await db.collection('aquariums').find({ user_id: numId }).toArray();
        for (const aq of aqs) {
          await self.aquariums.delete(aq.id);
        }
        await db.collection('aquarium_shares').deleteMany({ user_id: numId });
        await db.collection('maintenance_logs').updateMany({ created_by: numId }, { $set: { created_by: null } });
        await db.collection('measurements').updateMany({ created_by: numId }, { $set: { created_by: null } });
        return true;
      },
      async listForAdmin() {
        const users = await db.collection('users').find({}).sort({ created_at: 1, id: 1 }).toArray();
        const aqCounts = await db
          .collection('aquariums')
          .aggregate([{ $group: { _id: '$user_id', count: { $sum: 1 } } }])
          .toArray();
        const countMap = new Map(aqCounts.map((c) => [c._id, c.count]));

        return users.map((u) => ({
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

    this.sessions = {
      async create(tokenHash, userId, expiresAt, idToken = null) {
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
      async find(tokenHash) {
        if (!tokenHash) return null;
        const s = await db.collection('sessions').findOne({ token_hash: tokenHash });
        if (!s) return null;
        const u = await db.collection('users').findOne({ id: s.user_id });
        if (!u) return null;
        return {
          token_hash: s.token_hash,
          user_id: s.user_id,
          expires_at: s.expires_at,
          id_token: s.id_token,
          username: u.username,
          email: u.email,
          language: u.language || 'de',
        };
      },
      async delete(tokenHash) {
        await db.collection('sessions').deleteOne({ token_hash: tokenHash });
      },
      async deleteForUser(userId) {
        if (!userId) return;
        await db.collection('sessions').deleteMany({ user_id: Number(userId) });
      },
      async cleanExpired() {
        await db.collection('sessions').deleteMany({ expires_at: { $lt: Date.now() } });
      },
    };

    this.aquariums = {
      async listForUser(userId) {
        const numUserId = Number(userId);
        const ownRows = await db.collection('aquariums').find({ user_id: numUserId }).sort({ name: 1 }).toArray();
        const shareRows = await db
          .collection('aquarium_shares')
          .find({ user_id: numUserId, $or: [{ status: 'accepted' }, { status: { $exists: false } }] })
          .toArray();

        const sharedAqs = [];
        for (const s of shareRows) {
          const aq = await db.collection('aquariums').findOne({ id: s.aquarium_id });
          if (aq) {
            sharedAqs.push({ ...aq, role: s.role });
          }
        }

        const all = [
          ...ownRows.map((a) => ({ ...a, role: 'owner' })),
          ...sharedAqs,
        ];

        // Owner-Benutzernamen ermitteln
        const userIds = Array.from(new Set(all.map((a) => a.user_id)));
        const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
        const userMap = new Map(users.map((u) => [u.id, u.username]));

        const results = [];
        for (const aq of all) {
          aq.owner_username = userMap.get(aq.user_id) || null;
          results.push(await self.aquariums.getSummary(aq, aq.role));
        }

        results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return results;
      },
      async findById(id) {
        const numId = Number(id);
        if (!Number.isInteger(numId)) return null;
        const aq = await db.collection('aquariums').findOne({ id: numId });
        if (!aq) return null;
        const owner = await db.collection('users').findOne({ id: aq.user_id });
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
      }) {
        const id = await self.getNextSequence('aquariums');
        const doc = {
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
      async update(id, fields = {}) {
        const numId = Number(id);
        const updateFields = {};
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
        return await db.collection('aquariums').find({}).sort({ id: 1 }).toArray();
      },
      async updateReminderSent(id, type, timestamp) {
        const numId = Number(id);
        const col = type === 'measure' ? 'last_measure_reminder_sent_at' : 'last_fertilize_reminder_sent_at';
        const res = await db.collection('aquariums').updateOne({ id: numId }, { $set: { [col]: timestamp } });
        return res.matchedCount > 0;
      },
      async updateImage(id, filename) {
        const numId = Number(id);
        const res = await db.collection('aquariums').updateOne({ id: numId }, { $set: { image_file: filename } });
        return res.matchedCount > 0;
      },
      async delete(id) {
        const numId = Number(id);
        const images = await db.collection('aquarium_images').find({ aquarium_id: numId }).toArray();
        for (const img of images) {
          deleteImage(img.filename);
        }
        const stocks = await db.collection('stock').find({ aquarium_id: numId }).toArray();
        for (const st of stocks) {
          if (st.image_file) deleteImage(st.image_file);
        }
        const res = await db.collection('aquariums').deleteOne({ id: numId });
        if (res.deletedCount === 0) return false;

        // Cascade cleanup
        await db.collection('aquarium_images').deleteMany({ aquarium_id: numId });
        await db.collection('stock').deleteMany({ aquarium_id: numId });
        await db.collection('measurements').deleteMany({ aquarium_id: numId });
        await db.collection('alerts').deleteMany({ aquarium_id: numId });
        await db.collection('aquarium_shares').deleteMany({ aquarium_id: numId });
        await db.collection('maintenance_logs').deleteMany({ aquarium_id: numId });
        await db.collection('aquarium_chats').deleteMany({ aquarium_id: numId });
        return true;
      },
      async countForUser(userId) {
        return await db.collection('aquariums').countDocuments({ user_id: Number(userId) });
      },
      async getAccess(aquariumId, user) {
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
      async getSummary(aq, role = null) {
        const last = await db.collection('measurements').findOne({ aquarium_id: aq.id }, { sort: { measured_at: -1 } });
        const lastWaterChange = await db
          .collection('maintenance_logs')
          .findOne({ aquarium_id: aq.id, type: 'water_change' }, { sort: { logged_at: -1 } });
        const lastMaintenance = await db.collection('maintenance_logs').findOne({ aquarium_id: aq.id }, { sort: { logged_at: -1 } });
        const lastFertilize = await db.collection('maintenance_logs').findOne({ aquarium_id: aq.id, type: 'fertilize' }, { sort: { logged_at: -1 } });

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

    this.aquariumImages = {
      async listForAquarium(aquariumId) {
        const numAqId = Number(aquariumId);
        const rows = await db.collection('aquarium_images').find({ aquarium_id: numAqId }).sort({ is_primary: -1, id: 1 }).toArray();
        return rows.map((r) => ({
          ...r,
          is_primary: Boolean(r.is_primary),
          url: `api/aquariums/${numAqId}/images/${r.id}`,
        }));
      },
      async findById(id) {
        const row = await db.collection('aquarium_images').findOne({ id: Number(id) });
        if (!row) return null;
        return {
          ...row,
          is_primary: Boolean(row.is_primary),
          url: `api/aquariums/${row.aquarium_id}/images/${row.id}`,
        };
      },
      async create({ aquarium_id, filename, caption = null, is_primary = 0 }) {
        const id = await self.getNextSequence('aquarium_images');
        const numAqId = Number(aquarium_id);
        const count = await db.collection('aquarium_images').countDocuments({ aquarium_id: numAqId });
        const makePrimary = is_primary ? 1 : count === 0 ? 1 : 0;
        if (makePrimary) {
          await db.collection('aquarium_images').updateMany({ aquarium_id: numAqId }, { $set: { is_primary: 0 } });
          await db.collection('aquariums').updateOne({ id: numAqId }, { $set: { image_file: filename } });
        }
        const doc = {
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
      async setPrimary(id, aquariumId) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = await db.collection('aquarium_images').findOne({ id: numId, aquarium_id: numAqId });
        if (!img) return false;
        await db.collection('aquarium_images').updateMany({ aquarium_id: numAqId }, { $set: { is_primary: 0 } });
        await db.collection('aquarium_images').updateOne({ id: numId }, { $set: { is_primary: 1 } });
        await db.collection('aquariums').updateOne({ id: numAqId }, { $set: { image_file: img.filename } });
        return true;
      },
      async updateCaption(id, aquariumId, caption) {
        const res = await db.collection('aquarium_images').updateOne(
          { id: Number(id), aquarium_id: Number(aquariumId) },
          { $set: { caption } }
        );
        return res.matchedCount > 0;
      },
      async delete(id, aquariumId) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = await db.collection('aquarium_images').findOne({ id: numId, aquarium_id: numAqId });
        if (!img) return false;
        deleteImage(img.filename);
        const res = await db.collection('aquarium_images').deleteOne({ id: numId });
        const nextImg = await db.collection('aquarium_images').findOne({ aquarium_id: numAqId }, { sort: { is_primary: -1, id: 1 } });
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
      async deleteAllForAquarium(aquariumId) {
        const numAqId = Number(aquariumId);
        const rows = await db.collection('aquarium_images').find({ aquarium_id: numAqId }).toArray();
        for (const r of rows) {
          deleteImage(r.filename);
        }
        await db.collection('aquarium_images').deleteMany({ aquarium_id: numAqId });
      },
    };

    this.shares = {
      async listForAquarium(aquariumId) {
        const shares = await db.collection('aquarium_shares').find({ aquarium_id: Number(aquariumId) }).sort({ created_at: 1 }).toArray();
        if (shares.length === 0) return [];
        const userIds = shares.map((s) => s.user_id);
        const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
        const userMap = new Map(users.map((u) => [u.id, u]));

        return shares.map((s) => {
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
      async listPendingForUser(userId) {
        const numUserId = Number(userId);
        const shares = await db
          .collection('aquarium_shares')
          .find({ user_id: numUserId, status: 'pending' })
          .sort({ created_at: -1 })
          .toArray();
        if (shares.length === 0) return [];

        const results = [];
        for (const s of shares) {
          const aq = await db.collection('aquariums').findOne({ id: s.aquarium_id });
          if (!aq) continue;
          const owner = await db.collection('users').findOne({ id: aq.user_id });
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
      async find(aquariumId, userId) {
        return (await db.collection('aquarium_shares').findOne({ aquarium_id: Number(aquariumId), user_id: Number(userId) })) || null;
      },
      async findByToken(token) {
        if (!token) return null;
        const s = await db.collection('aquarium_shares').findOne({ token: String(token) });
        if (!s) return null;
        const aq = await db.collection('aquariums').findOne({ id: s.aquarium_id });
        if (!aq) return null;
        const owner = await db.collection('users').findOne({ id: aq.user_id });
        const targetUser = await db.collection('users').findOne({ id: s.user_id });
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
      async upsert(aquariumId, userId, role, status = 'pending', token = null, tokenExpires = null) {
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
      async updateRole(aquariumId, userId, role) {
        const res = await db.collection('aquarium_shares').updateOne(
          { aquarium_id: Number(aquariumId), user_id: Number(userId) },
          { $set: { role } }
        );
        return res.matchedCount > 0;
      },
      async accept(aquariumId, userId) {
        const res = await db.collection('aquarium_shares').updateOne(
          { aquarium_id: Number(aquariumId), user_id: Number(userId) },
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
      async acceptByToken(token, userId = null) {
        if (!token) return false;
        const filter = { token: String(token) };
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
      async decline(aquariumId, userId) {
        const res = await db.collection('aquarium_shares').deleteOne({ aquarium_id: Number(aquariumId), user_id: Number(userId) });
        return res.deletedCount > 0;
      },
      async declineByToken(token) {
        if (!token) return false;
        const res = await db.collection('aquarium_shares').deleteOne({ token: String(token) });
        return res.deletedCount > 0;
      },
      async delete(aquariumId, userId) {
        const res = await db.collection('aquarium_shares').deleteOne({ aquarium_id: Number(aquariumId), user_id: Number(userId) });
        return res.deletedCount > 0;
      },
      async count(aquariumId) {
        return await db.collection('aquarium_shares').countDocuments({
          aquarium_id: Number(aquariumId),
          $or: [{ status: 'accepted' }, { status: { $exists: false } }],
        });
      },
    };

    this.stock = {
      async listForAquarium(aquariumId) {
        const rows = await db.collection('stock').find({ aquarium_id: Number(aquariumId) }).sort({ species: 1, id: 1 }).toArray();
        return rows.map((s) => ({
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        }));
      },
      async findById(id) {
        const s = await db.collection('stock').findOne({ id: Number(id) });
        if (!s) return null;
        return {
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        };
      },
      async create({ aquarium_id, species, count = 1, profile = 'allgemein', name = null, image_file = null }) {
        const id = await self.getNextSequence('stock');
        const doc = {
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
      async update(id, fields = {}) {
        const numId = Number(id);
        const updateFields = {};
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
      async updateImage(id, filename) {
        const res = await db.collection('stock').updateOne({ id: Number(id) }, { $set: { image_file: filename } });
        return res.matchedCount > 0;
      },
      async delete(id, aquariumId = null) {
        const filter = { id: Number(id) };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const s = await db.collection('stock').findOne(filter);
        if (s?.image_file) {
          deleteImage(s.image_file);
        }
        const res = await db.collection('stock').deleteOne(filter);
        return res.deletedCount > 0;
      },
      async deleteAllForAquarium(aquariumId) {
        const numAqId = Number(aquariumId);
        const rows = await db.collection('stock').find({ aquarium_id: numAqId }).toArray();
        for (const r of rows) {
          if (r.image_file) deleteImage(r.image_file);
        }
        await db.collection('stock').deleteMany({ aquarium_id: numAqId });
      },
    };

    this.measurements = {
      async listForAquarium(aquariumId, options = {}) {
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

        const dateFilter = { $gte: since };
        if (until) {
          dateFilter.$lte = until;
        }

        let query = db.collection('measurements').find({
          aquarium_id: Number(aquariumId),
          measured_at: dateFilter,
        }).sort({ measured_at: -1 });

        if (options.limit && Number.isFinite(Number(options.limit))) {
          query = query.limit(Number(options.limit));
        }

        const ms = await query.toArray();
        if (ms.length === 0) return [];

        const measIds = ms.map((m) => m.id);
        const creatorIds = Array.from(new Set(ms.map((m) => m.created_by).filter(Boolean)));
        const users = creatorIds.length > 0 ? await db.collection('users').find({ id: { $in: creatorIds } }).toArray() : [];
        const userMap = new Map(users.map((u) => [u.id, u.username]));

        const alerts = await db.collection('alerts').find({ measurement_id: { $in: measIds } }).toArray();
        const alertsByMeas = new Map();
        for (const al of alerts) {
          if (!alertsByMeas.has(al.measurement_id)) alertsByMeas.set(al.measurement_id, []);
          alertsByMeas.get(al.measurement_id).push(al);
        }

        return ms.map((m) => ({
          id: m.id,
          measured_at: m.measured_at,
          note: m.note || null,
          created_by: m.created_by || null,
          created_by_username: m.created_by ? userMap.get(m.created_by) || null : null,
          values: m.values || {},
          alerts: alertsByMeas.get(m.id) || [],
        }));
      },
      async findById(id) {
        return (await db.collection('measurements').findOne({ id: Number(id) })) || null;
      },
      async findLastForAquarium(aquariumId) {
        return (await db.collection('measurements').findOne({ aquarium_id: Number(aquariumId) }, { sort: { measured_at: -1 } })) || null;
      },
      async create({ aquarium_id, measured_at, note = null, created_by = null, values = {}, alerts = [] }) {
        const measId = await self.getNextSequence('measurements');
        const doc = {
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

        return { id: measId };
      },
      async delete(id, aquariumId = null) {
        const numId = Number(id);
        const filter = { id: numId };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const res = await db.collection('measurements').deleteOne(filter);
        if (res.deletedCount > 0) {
          await db.collection('alerts').deleteMany({ measurement_id: numId });
          return true;
        }
        return false;
      },
      async getLatestValues(aquariumId, thresholds = {}) {
        const ms = await db.collection('measurements').find({ aquarium_id: Number(aquariumId) }).sort({ measured_at: -1 }).toArray();
        const latest = {};
        for (const m of ms) {
          for (const [param, val] of Object.entries(m.values || {})) {
            if (!latest[param]) {
              latest[param] = {
                value: val,
                measured_at: m.measured_at,
                status: cfg.evaluate(thresholds[param], val),
              };
            }
          }
        }
        return latest;
      },
    };

    this.alerts = {
      async listOpenForAquarium(aquariumId) {
        const rows = await db.collection('alerts').find({ aquarium_id: Number(aquariumId), acked_at: null }).toArray();
        rows.sort((a, b) => {
          if (a.level === 'crit' && b.level !== 'crit') return -1;
          if (a.level !== 'crit' && b.level === 'crit') return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return rows;
      },
      async listAllForAquarium(aquariumId) {
        return await db.collection('alerts').find({ aquarium_id: Number(aquariumId) }).sort({ created_at: -1 }).toArray();
      },
      async create({ aquarium_id, measurement_id = null, param, level, value, message }) {
        const id = await self.getNextSequence('alerts');
        const doc = {
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
      async ack(id, aquariumId) {
        const res = await db.collection('alerts').updateOne(
          { id: Number(id), aquarium_id: Number(aquariumId), acked_at: null },
          { $set: { acked_at: new Date().toISOString() } }
        );
        return res.modifiedCount > 0;
      },
      async ackAll(aquariumId) {
        const res = await db.collection('alerts').updateMany(
          { aquarium_id: Number(aquariumId), acked_at: null },
          { $set: { acked_at: new Date().toISOString() } }
        );
        return res.modifiedCount;
      },
      async countOpen(aquariumId) {
        const crit = await db.collection('alerts').countDocuments({ aquarium_id: Number(aquariumId), acked_at: null, level: 'crit' });
        const warn = await db.collection('alerts').countDocuments({ aquarium_id: Number(aquariumId), acked_at: null, level: 'warn' });
        return { crit, warn };
      },
    };

    this.maintenance = {
      async listForAquarium(aquariumId, options = {}) {
        const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const filter = {
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

        const creatorIds = Array.from(new Set(logs.map((l) => l.created_by).filter(Boolean)));
        const users = creatorIds.length > 0 ? await db.collection('users').find({ id: { $in: creatorIds } }).toArray() : [];
        const userMap = new Map(users.map((u) => [u.id, u.username]));

        return logs.map((l) => ({
          ...l,
          created_by_username: l.created_by ? userMap.get(l.created_by) || null : null,
        }));
      },
      async findById(id) {
        return (await db.collection('maintenance_logs').findOne({ id: Number(id) })) || null;
      },
      async findLastByType(aquariumId, type) {
        return (await db.collection('maintenance_logs').findOne({ aquarium_id: Number(aquariumId), type: String(type) }, { sort: { logged_at: -1 } })) || null;
      },
      async create({ aquarium_id, logged_at, type, percentage = null, details = null, note = null, created_by = null }) {
        const id = await self.getNextSequence('maintenance_logs');
        const doc = {
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
      async update(id, aquariumId, fields = {}) {
        const numId = Number(id);
        const updateFields = {};
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
      async delete(id, aquariumId = null) {
        const numId = Number(id);
        const filter = { id: numId };
        if (aquariumId != null) filter.aquarium_id = Number(aquariumId);
        const res = await db.collection('maintenance_logs').deleteOne(filter);
        return res.deletedCount > 0;
      },
      async getTimeline(aquariumId, options = {}) {
        const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const filterKind = options.kind || 'all';

        const timeline = [];

        if (filterKind === 'all' || filterKind === 'maintenance' || cfg.maintenanceService.MAINTENANCE_TYPES[filterKind]) {
          const filter = {
            aquarium_id: Number(aquariumId),
            logged_at: { $gte: since },
          };
          if (cfg.maintenanceService.MAINTENANCE_TYPES[filterKind]) {
            filter.type = filterKind;
          }

          const maintRows = await db.collection('maintenance_logs').find(filter).sort({ logged_at: -1 }).toArray();
          const creatorIds = Array.from(new Set(maintRows.map((r) => r.created_by).filter(Boolean)));
          const users = creatorIds.length > 0 ? await db.collection('users').find({ id: { $in: creatorIds } }).toArray() : [];
          const userMap = new Map(users.map((u) => [u.id, u.username]));

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

        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (options.limit && Number.isFinite(Number(options.limit))) {
          return timeline.slice(0, Number(options.limit));
        }

        return timeline;
      },
      async getLatest(aquariumId) {
        return (
          (await db.collection('maintenance_logs').findOne({ aquarium_id: Number(aquariumId) }, { sort: { logged_at: -1 } })) || null
        );
      },
      async getLatestWaterChange(aquariumId) {
        return (
          (await db.collection('maintenance_logs').findOne({ aquarium_id: Number(aquariumId), type: 'water_change' }, { sort: { logged_at: -1 } })) || null
        );
      },
    };

    this.invitations = {
      async findById(id) {
        if (!id) return null;
        const inv = await db.collection('invitations').findOne({ id: Number(id) });
        if (!inv) return null;
        if (inv.created_by) {
          const u = await db.collection('users').findOne({ id: inv.created_by });
          inv.created_by_username = u ? u.username : null;
        }
        return inv;
      },
      async findByCode(code) {
        if (!code) return null;
        const inv = await db.collection('invitations').findOne(
          { code: { $regex: new RegExp(`^${escapeRegex(String(code).trim())}$`, 'i') } }
        );
        if (!inv) return null;
        if (inv.created_by) {
          const u = await db.collection('users').findOne({ id: inv.created_by });
          inv.created_by_username = u ? u.username : null;
        }
        return inv;
      },
      async findByEmail(email) {
        if (!email) return [];
        const invs = await db.collection('invitations').find(
          { email: { $regex: new RegExp(`^${escapeRegex(String(email).trim())}$`, 'i') } }
        ).sort({ id: -1 }).toArray();
        for (const inv of invs) {
          if (inv.created_by) {
            const u = await db.collection('users').findOne({ id: inv.created_by });
            inv.created_by_username = u ? u.username : null;
          }
        }
        return invs;
      },
      async listAll() {
        const invs = await db.collection('invitations').find({}).sort({ id: -1 }).toArray();
        for (const inv of invs) {
          if (inv.created_by) {
            const u = await db.collection('users').findOne({ id: inv.created_by });
            inv.created_by_username = u ? u.username : null;
          }
        }
        return invs;
      },
      async listForUser(userId) {
        const invs = await db.collection('invitations').find({ created_by: Number(userId) }).sort({ id: -1 }).toArray();
        for (const inv of invs) {
          if (inv.created_by) {
            const u = await db.collection('users').findOne({ id: inv.created_by });
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
      }) {
        const id = await self.getNextSequence('invitations');
        const doc = {
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
      async use(id) {
        const res = await db.collection('invitations').updateOne(
          { id: Number(id) },
          { $inc: { used_count: 1 } }
        );
        return res.modifiedCount > 0;
      },
      async delete(id, createdBy = null) {
        const filter = { id: Number(id) };
        if (createdBy != null) filter.created_by = Number(createdBy);
        const res = await db.collection('invitations').deleteOne(filter);
        return res.deletedCount > 0;
      },
    };

    this.aquariumChats = {
      async listForAquarium(aquariumId, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
        const docs = await db
          .collection('aquarium_chats')
          .find({ aquarium_id: Number(aquariumId) })
          .sort({ id: 1 })
          .limit(limit)
          .toArray();

        return docs.map((d) => ({
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
      async create({ aquariumId, userId = null, role, content, provider = null, model = null, createdAt = null }) {
        const id = await self.getNextSequence('aquarium_chats');
        const ts = createdAt || new Date().toISOString();
        const doc = {
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
      async clearForAquarium(aquariumId) {
        const res = await db.collection('aquarium_chats').deleteMany({ aquarium_id: Number(aquariumId) });
        return res.deletedCount > 0;
      },
      async countForAquarium(aquariumId) {
        return await db.collection('aquarium_chats').countDocuments({ aquarium_id: Number(aquariumId) });
      },
    };
  }

  async exportAllData() {
    if (!this._initialized) await this.init();
    const db = this.db;

    const stripId = (docs) =>
      docs.map((d) => {
        const copy = { ...d };
        delete copy._id;
        return copy;
      });

    const users = stripId(await db.collection('users').find({}).sort({ id: 1 }).toArray());
    const aquariums = stripId(await db.collection('aquariums').find({}).sort({ id: 1 }).toArray());
    const aquarium_images = stripId(await db.collection('aquarium_images').find({}).sort({ id: 1 }).toArray());
    const aquarium_shares = stripId(
      await db.collection('aquarium_shares').find({}).sort({ aquarium_id: 1, user_id: 1 }).toArray()
    );
    const stock = stripId(await db.collection('stock').find({}).sort({ id: 1 }).toArray());
    const measurements = stripId(await db.collection('measurements').find({}).sort({ id: 1 }).toArray());
    const alerts = stripId(await db.collection('alerts').find({}).sort({ id: 1 }).toArray());
    const maintenance_logs = stripId(await db.collection('maintenance_logs').find({}).sort({ id: 1 }).toArray());
    const invitations = stripId(await db.collection('invitations').find({}).sort({ id: 1 }).toArray());
    const aquarium_chats = stripId(await db.collection('aquarium_chats').find({}).sort({ id: 1 }).toArray());

    return {
      users,
      aquariums,
      aquarium_images,
      aquarium_shares,
      stock,
      measurements,
      alerts,
      maintenance_logs,
      invitations,
      aquarium_chats,
    };
  }

  async importAllData(data = {}) {
    if (!this._initialized) await this.init();
    const db = this.db;

    const users = Array.isArray(data.users) ? data.users : [];
    const aquariums = Array.isArray(data.aquariums) ? data.aquariums : [];
    const aquarium_images = Array.isArray(data.aquarium_images) ? data.aquarium_images : [];
    const shares = Array.isArray(data.aquarium_shares) ? data.aquarium_shares : [];
    const stock = Array.isArray(data.stock) ? data.stock : [];
    const measurements = Array.isArray(data.measurements) ? data.measurements : [];
    const alerts = Array.isArray(data.alerts) ? data.alerts : [];
    const maintenance = Array.isArray(data.maintenance_logs) ? data.maintenance_logs : [];
    const invitations = Array.isArray(data.invitations) ? data.invitations : [];
    const chats = Array.isArray(data.aquarium_chats) ? data.aquarium_chats : [];

    const userIds = users.map((u) => u.id);
    const currentSessions = await db.collection('sessions').find({ expires_at: { $gt: Date.now() } }).toArray();

    // Collections leeren
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('sessions').deleteMany({}),
      db.collection('aquariums').deleteMany({}),
      db.collection('aquarium_images').deleteMany({}),
      db.collection('aquarium_shares').deleteMany({}),
      db.collection('stock').deleteMany({}),
      db.collection('measurements').deleteMany({}),
      db.collection('alerts').deleteMany({}),
      db.collection('maintenance_logs').deleteMany({}),
      db.collection('invitations').deleteMany({}),
      db.collection('aquarium_chats').deleteMany({}),
      db.collection('counters').deleteMany({}),
    ]);

    // Daten einfügen
    if (users.length > 0) await db.collection('users').insertMany(users);
    if (aquariums.length > 0) await db.collection('aquariums').insertMany(aquariums);
    if (aquarium_images.length > 0) await db.collection('aquarium_images').insertMany(aquarium_images);
    if (shares.length > 0) await db.collection('aquarium_shares').insertMany(shares);
    if (stock.length > 0) await db.collection('stock').insertMany(stock);
    if (measurements.length > 0) await db.collection('measurements').insertMany(measurements);
    if (alerts.length > 0) await db.collection('alerts').insertMany(alerts);
    if (maintenance.length > 0) await db.collection('maintenance_logs').insertMany(maintenance);
    if (invitations.length > 0) await db.collection('invitations').insertMany(invitations);
    if (chats.length > 0) await db.collection('aquarium_chats').insertMany(chats);

    // Aktive Sessions für bestehende Benutzer wiederherstellen
    const validSessions = currentSessions.filter((s) => userIds.includes(s.user_id));
    if (validSessions.length > 0) {
      await db.collection('sessions').insertMany(validSessions);
    }

    // Zähler (counters) für Sequenzen aktualisieren
    const maxUserId = users.reduce((m, u) => Math.max(m, u.id || 0), 0);
    const maxAqId = aquariums.reduce((m, a) => Math.max(m, a.id || 0), 0);
    const maxAqImgId = aquarium_images.reduce((m, ai) => Math.max(m, ai.id || 0), 0);
    const maxStockId = stock.reduce((m, s) => Math.max(m, s.id || 0), 0);
    const maxMeasId = measurements.reduce((m, ms) => Math.max(m, ms.id || 0), 0);
    const maxAlertId = alerts.reduce((m, al) => Math.max(m, al.id || 0), 0);
    const maxMaintId = maintenance.reduce((m, ml) => Math.max(m, ml.id || 0), 0);
    const maxInvId = invitations.reduce((m, iv) => Math.max(m, iv.id || 0), 0);
    const maxChatId = chats.reduce((m, c) => Math.max(m, c.id || 0), 0);

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
    ];

    for (const c of counterOps) {
      if (c.seq > 0) {
        await db.collection('counters').updateOne({ _id: c._id }, { $set: { seq: c.seq } }, { upsert: true });
      }
    }

    return true;
  }
}

module.exports = MongoAdapter;
