'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('../config/env');
const cfg = require('../../config');
const { isOverdue } = require('../services/aquarium-service');
const { deleteImage } = require('../services/image-service');

class SqliteAdapter {
  constructor(options = {}) {
    this.type = 'sqlite';
    this.dataDir = options.dataDir || DATA_DIR;
    this.dbPath = options.dbPath || path.join(this.dataDir, 'aquarium.db');
    this.db = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized && this.db) return this;
    if (this.dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS aquariums (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        volume_l INTEGER,
        water_type TEXT NOT NULL DEFAULT 'fresh',
        reminder_days INTEGER NOT NULL DEFAULT 7,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        species TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        profile TEXT NOT NULL DEFAULT 'allgemein'
      );
      CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        measured_at TEXT NOT NULL,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meas_aq ON measurements(aquarium_id, measured_at);
      CREATE TABLE IF NOT EXISTS measurement_values (
        measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
        param TEXT NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (measurement_id, param)
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        measurement_id INTEGER REFERENCES measurements(id) ON DELETE CASCADE,
        param TEXT NOT NULL,
        level TEXT NOT NULL,
        value REAL NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        acked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alert_aq ON alerts(aquarium_id, acked_at);
      CREATE TABLE IF NOT EXISTS aquarium_shares (
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('view', 'write')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (aquarium_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_aq_shares_user ON aquarium_shares(user_id);
      CREATE TABLE IF NOT EXISTS maintenance_logs (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        logged_at TEXT NOT NULL,
        type TEXT NOT NULL,
        percentage REAL,
        details TEXT,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_maint_aq ON maintenance_logs(aquarium_id, logged_at);
      CREATE TABLE IF NOT EXISTS aquarium_images (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        caption TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_aq_images_aq ON aquarium_images(aquarium_id);
    `);

    const hasColumn = (table, col) => this.db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!hasColumn('users', 'oidc_sub')) this.db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
    if (!hasColumn('users', 'email')) this.db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE');
    if (!hasColumn('users', 'first_name')) this.db.exec('ALTER TABLE users ADD COLUMN first_name TEXT');
    if (!hasColumn('users', 'last_name')) this.db.exec('ALTER TABLE users ADD COLUMN last_name TEXT');
    if (!hasColumn('users', 'bio')) this.db.exec('ALTER TABLE users ADD COLUMN bio TEXT');
    if (!hasColumn('users', 'avatar_file')) this.db.exec('ALTER TABLE users ADD COLUMN avatar_file TEXT');
    if (!hasColumn('users', 'selected_suite')) this.db.exec('ALTER TABLE users ADD COLUMN selected_suite TEXT');
    if (!hasColumn('users', 'selected_tests')) this.db.exec('ALTER TABLE users ADD COLUMN selected_tests TEXT');
    if (!hasColumn('sessions', 'id_token')) this.db.exec('ALTER TABLE sessions ADD COLUMN id_token TEXT');
    if (!hasColumn('aquariums', 'image_file')) this.db.exec('ALTER TABLE aquariums ADD COLUMN image_file TEXT');
    if (!hasColumn('aquariums', 'motto')) this.db.exec('ALTER TABLE aquariums ADD COLUMN motto TEXT');
    if (!hasColumn('aquariums', 'description')) this.db.exec('ALTER TABLE aquariums ADD COLUMN description TEXT');
    if (!hasColumn('stock', 'name')) this.db.exec('ALTER TABLE stock ADD COLUMN name TEXT');
    if (!hasColumn('stock', 'image_file')) this.db.exec('ALTER TABLE stock ADD COLUMN image_file TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_sub) WHERE oidc_sub IS NOT NULL');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != \'\'');

    this._setupRepositories();
    this._initialized = true;
    return this;
  }

  async close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        // ignore
      }
      this.db = null;
    }
    this._initialized = false;
  }

  getRawDb() {
    return this.db;
  }

  _setupRepositories() {
    const db = this.db;

    this.users = {
      async findById(id) {
        if (!id) return null;
        return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
      },
      async findByUsername(username, excludeId = null) {
        if (!username) return null;
        if (excludeId != null) {
          return db.prepare('SELECT * FROM users WHERE username = ? AND id != ?').get(username, excludeId) || null;
        }
        return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
      },
      async findByEmail(email, excludeId = null) {
        if (!email) return null;
        if (excludeId != null) {
          return db.prepare('SELECT * FROM users WHERE email = ? AND id != ?').get(email, excludeId) || null;
        }
        return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
      },
      async findByOidcSub(oidcSub, excludeId = null) {
        if (!oidcSub) return null;
        if (excludeId != null) {
          return db.prepare('SELECT * FROM users WHERE oidc_sub = ? AND id != ?').get(oidcSub, excludeId) || null;
        }
        return db.prepare('SELECT * FROM users WHERE oidc_sub = ?').get(oidcSub) || null;
      },
      async create({ username, password_hash = '', email = null, oidc_sub = null }) {
        const info = db
          .prepare('INSERT INTO users (username, password_hash, email, oidc_sub) VALUES (?, ?, ?, ?)')
          .run(username, password_hash, email, oidc_sub);
        const id = Number(info.lastInsertRowid);
        return { id, username, email, oidc_sub };
      },
      async update(id, fields = {}) {
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
        ];

        for (const k of allowed) {
          if (fields[k] !== undefined) {
            setClauses.push(`${k} = ?`);
            params.push(fields[k]);
          }
        }

        if (setClauses.length === 0) return true;
        params.push(id);
        const res = db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
        return res.changes > 0;
      },
      async delete(id) {
        const res = db.prepare('DELETE FROM users WHERE id = ?').run(id);
        return res.changes > 0;
      },
      async listForAdmin() {
        return db
          .prepare(
            `
          SELECT u.id, u.username, u.email, u.oidc_sub, u.password_hash, u.created_at,
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
        return db.prepare('SELECT COUNT(*) as n FROM users').get().n;
      },
    };

    this.sessions = {
      async create(tokenHash, userId, expiresAt, idToken = null) {
        db.prepare(
          'INSERT INTO sessions (token_hash, user_id, expires_at, id_token) VALUES (?, ?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at, id_token = excluded.id_token'
        ).run(tokenHash, userId, expiresAt, idToken);
      },
      async find(tokenHash) {
        if (!tokenHash) return null;
        return (
          db
            .prepare(
              `
          SELECT s.token_hash, s.user_id, s.expires_at, s.id_token, u.username, u.email
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?
        `
            )
            .get(tokenHash) || null
        );
      },
      async delete(tokenHash) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      },
      async cleanExpired() {
        db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      },
    };

    const self = this;

    this.aquariums = {
      async listForUser(userId) {
        const ownRows = db
          .prepare(
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
          .prepare(
            `
          SELECT a.*, u.username as owner_username, s.role as role
          FROM aquarium_shares s
          JOIN aquariums a ON a.id = s.aquarium_id
          JOIN users u ON u.id = a.user_id
          WHERE s.user_id = ?
          ORDER BY a.name
        `
          )
          .all(userId);

        const all = [...ownRows, ...sharedRows];
        return all.map((aq) => self.aquariums.getSummary(aq, aq.role));
      },
      async findById(id) {
        const numId = Number(id);
        if (!Number.isInteger(numId)) return null;
        return (
          db
            .prepare(
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
      async create({ user_id, name, volume_l = null, water_type = 'fresh', reminder_days = 7, notes = null, motto = null, description = null }) {
        const info = db
          .prepare('INSERT INTO aquariums (user_id, name, volume_l, water_type, reminder_days, notes, motto, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(user_id, name, volume_l, water_type, reminder_days, notes, motto, description);
        return { id: Number(info.lastInsertRowid) };
      },
      async update(id, fields = {}) {
        const setClauses = [];
        const params = [];
        const allowed = ['name', 'volume_l', 'water_type', 'reminder_days', 'notes', 'image_file', 'motto', 'description'];

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
      async updateImage(id, filename) {
        const res = db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(filename, id);
        return res.changes > 0;
      },
      async delete(id) {
        const numId = Number(id);
        const images = db.prepare('SELECT filename FROM aquarium_images WHERE aquarium_id = ?').all(numId);
        for (const img of images) {
          deleteImage(img.filename);
        }
        const stocks = db.prepare('SELECT image_file FROM stock WHERE aquarium_id = ?').all(numId);
        for (const st of stocks) {
          if (st.image_file) deleteImage(st.image_file);
        }
        const res = db.prepare('DELETE FROM aquariums WHERE id = ?').run(numId);
        return res.changes > 0;
      },
      async countForUser(userId) {
        return db.prepare('SELECT COUNT(*) as n FROM aquariums WHERE user_id = ?').get(userId).n;
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
        if (share) {
          return { aq, role: share.role };
        }
        if (user.isAdmin) {
          return { aq, role: 'owner' };
        }
        return null;
      },
      getSummary(aq, role = null) {
        const last = db.prepare('SELECT measured_at FROM measurements WHERE aquarium_id = ? ORDER BY measured_at DESC LIMIT 1').get(aq.id);
        const lastWaterChange = db
          .prepare("SELECT logged_at, percentage FROM maintenance_logs WHERE aquarium_id = ? AND type = 'water_change' ORDER BY logged_at DESC LIMIT 1")
          .get(aq.id);
        const lastMaintenance = db.prepare('SELECT logged_at, type FROM maintenance_logs WHERE aquarium_id = ? ORDER BY logged_at DESC LIMIT 1').get(aq.id);
        const alerts = db.prepare(`SELECT level, COUNT(*) n FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL GROUP BY level`).all(aq.id);
        const crit = alerts.find((a) => a.level === 'crit')?.n || 0;
        const warn = alerts.find((a) => a.level === 'warn')?.n || 0;
        const sharesCount = db.prepare('SELECT COUNT(*) as n FROM aquarium_shares WHERE aquarium_id = ?').get(aq.id)?.n || 0;
        const imagesCount = db.prepare('SELECT COUNT(*) as n FROM aquarium_images WHERE aquarium_id = ?').get(aq.id)?.n || 0;

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
          open_crit: crit,
          open_warn: warn,
          overdue: isOverdue(aq, last),
        };
      },
    };

    this.aquariumImages = {
      async listForAquarium(aquariumId) {
        const numId = Number(aquariumId);
        const rows = db.prepare('SELECT * FROM aquarium_images WHERE aquarium_id = ? ORDER BY is_primary DESC, id ASC').all(numId);
        return rows.map((r) => ({
          ...r,
          is_primary: Boolean(r.is_primary),
          url: `api/aquariums/${numId}/images/${r.id}`,
        }));
      },
      async findById(id) {
        const row = db.prepare('SELECT * FROM aquarium_images WHERE id = ?').get(Number(id));
        if (!row) return null;
        return {
          ...row,
          is_primary: Boolean(row.is_primary),
          url: `api/aquariums/${row.aquarium_id}/images/${row.id}`,
        };
      },
      async create({ aquarium_id, filename, caption = null, is_primary = 0 }) {
        const numAqId = Number(aquarium_id);
        const count = db.prepare('SELECT COUNT(*) as n FROM aquarium_images WHERE aquarium_id = ?').get(numAqId).n;
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
      async setPrimary(id, aquariumId) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = db.prepare('SELECT * FROM aquarium_images WHERE id = ? AND aquarium_id = ?').get(numId, numAqId);
        if (!img) return false;
        db.prepare('UPDATE aquarium_images SET is_primary = 0 WHERE aquarium_id = ?').run(numAqId);
        db.prepare('UPDATE aquarium_images SET is_primary = 1 WHERE id = ?').run(numId);
        db.prepare('UPDATE aquariums SET image_file = ? WHERE id = ?').run(img.filename, numAqId);
        return true;
      },
      async updateCaption(id, aquariumId, caption) {
        const res = db.prepare('UPDATE aquarium_images SET caption = ? WHERE id = ? AND aquarium_id = ?').run(caption, Number(id), Number(aquariumId));
        return res.changes > 0;
      },
      async delete(id, aquariumId) {
        const numId = Number(id);
        const numAqId = Number(aquariumId);
        const img = db.prepare('SELECT * FROM aquarium_images WHERE id = ? AND aquarium_id = ?').get(numId, numAqId);
        if (!img) return false;
        deleteImage(img.filename);
        const res = db.prepare('DELETE FROM aquarium_images WHERE id = ?').run(numId);
        const nextImg = db.prepare('SELECT * FROM aquarium_images WHERE aquarium_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1').get(numAqId);
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
      async deleteAllForAquarium(aquariumId) {
        const numAqId = Number(aquariumId);
        const rows = db.prepare('SELECT filename FROM aquarium_images WHERE aquarium_id = ?').all(numAqId);
        for (const r of rows) {
          deleteImage(r.filename);
        }
        db.prepare('DELETE FROM aquarium_images WHERE aquarium_id = ?').run(numAqId);
      },
    };

    this.shares = {
      async listForAquarium(aquariumId) {
        return db
          .prepare(
            `
          SELECT s.user_id, s.role, s.created_at, u.username, u.email
          FROM aquarium_shares s
          JOIN users u ON u.id = s.user_id
          WHERE s.aquarium_id = ?
          ORDER BY s.created_at ASC
        `
          )
          .all(aquariumId);
      },
      async find(aquariumId, userId) {
        return db.prepare('SELECT * FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?').get(aquariumId, userId) || null;
      },
      async upsert(aquariumId, userId, role) {
        db.prepare(
          `
          INSERT INTO aquarium_shares (aquarium_id, user_id, role)
          VALUES (?, ?, ?)
          ON CONFLICT(aquarium_id, user_id) DO UPDATE SET role = excluded.role
        `
        ).run(aquariumId, userId, role);
      },
      async delete(aquariumId, userId) {
        const res = db.prepare('DELETE FROM aquarium_shares WHERE aquarium_id = ? AND user_id = ?').run(aquariumId, userId);
        return res.changes > 0;
      },
      async count(aquariumId) {
        return db.prepare('SELECT COUNT(*) as n FROM aquarium_shares WHERE aquarium_id = ?').get(aquariumId).n;
      },
    };

    this.stock = {
      async listForAquarium(aquariumId) {
        const rows = db.prepare('SELECT id, aquarium_id, species, count, profile, name, image_file FROM stock WHERE aquarium_id = ? ORDER BY species, id').all(Number(aquariumId));
        return rows.map((s) => ({
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        }));
      },
      async findById(id) {
        const s = db.prepare('SELECT id, aquarium_id, species, count, profile, name, image_file FROM stock WHERE id = ?').get(Number(id));
        if (!s) return null;
        return {
          ...s,
          has_image: !!s.image_file,
          image_url: s.image_file ? `api/aquariums/${s.aquarium_id}/stock/${s.id}/image` : null,
        };
      },
      async create({ aquarium_id, species, count = 1, profile = 'allgemein', name = null, image_file = null }) {
        const info = db.prepare('INSERT INTO stock (aquarium_id, species, count, profile, name, image_file) VALUES (?, ?, ?, ?, ?, ?)').run(aquarium_id, species, count, profile, name, image_file);
        return { id: Number(info.lastInsertRowid) };
      },
      async update(id, fields = {}) {
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
      async updateImage(id, filename) {
        const res = db.prepare('UPDATE stock SET image_file = ? WHERE id = ?').run(filename, Number(id));
        return res.changes > 0;
      },
      async delete(id, aquariumId = null) {
        const numId = Number(id);
        const s = db.prepare('SELECT * FROM stock WHERE id = ?').get(numId);
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
      async deleteAllForAquarium(aquariumId) {
        const numAqId = Number(aquariumId);
        const rows = db.prepare('SELECT image_file FROM stock WHERE aquarium_id = ?').all(numAqId);
        for (const r of rows) {
          if (r.image_file) deleteImage(r.image_file);
        }
        db.prepare('DELETE FROM stock WHERE aquarium_id = ?').run(numAqId);
      },
    };

    this.measurements = {
      async listForAquarium(aquariumId, options = {}) {
        const days = Math.min(Math.max(Number(options.days) || 365, 1), 3650);
        const since = new Date(Date.now() - days * 86400000).toISOString();

        const ms = db
          .prepare(
            `SELECT m.id, m.measured_at, m.note, m.created_by, u.username as created_by_username
             FROM measurements m
             LEFT JOIN users u ON u.id = m.created_by
             WHERE m.aquarium_id = ? AND m.measured_at >= ?
             ORDER BY m.measured_at DESC`
          )
          .all(aquariumId, since);

        if (ms.length === 0) return [];

        const vals = db
          .prepare(
            `SELECT mv.measurement_id, mv.param, mv.value
             FROM measurement_values mv
             JOIN measurements m ON m.id = mv.measurement_id
             WHERE m.aquarium_id = ? AND m.measured_at >= ?`
          )
          .all(aquariumId, since);

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

        let result = ms.map((m) => ({
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
      async findById(id) {
        const m = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
        if (!m) return null;
        const vals = db.prepare('SELECT param, value FROM measurement_values WHERE measurement_id = ?').all(id);
        const values = {};
        for (const v of vals) values[v.param] = v.value;
        return { ...m, values };
      },
      async create({ aquarium_id, measured_at, note = null, created_by = null, values = {}, alerts = [] }) {
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
        });

        tx();
        return { id: measId };
      },
      async delete(id, aquariumId = null) {
        let res;
        if (aquariumId != null) {
          res = db.prepare('DELETE FROM measurements WHERE id = ? AND aquarium_id = ?').run(id, aquariumId);
        } else {
          res = db.prepare('DELETE FROM measurements WHERE id = ?').run(id);
        }
        return res.changes > 0;
      },
      async getLatestValues(aquariumId, thresholds = {}) {
        const rows = db
          .prepare(
            `
          SELECT mv.param, mv.value, m.measured_at FROM measurement_values mv
          JOIN measurements m ON m.id = mv.measurement_id
          WHERE m.aquarium_id = ? AND m.measured_at = (
            SELECT MAX(m2.measured_at) FROM measurements m2 JOIN measurement_values v2 ON v2.measurement_id = m2.id
            WHERE m2.aquarium_id = m.aquarium_id AND v2.param = mv.param)
        `
          )
          .all(aquariumId);

        const latest = {};
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

    this.alerts = {
      async listOpenForAquarium(aquariumId) {
        return db
          .prepare(
            `SELECT id, param, level, value, message, created_at FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL ORDER BY (level = 'crit') DESC, created_at DESC`
          )
          .all(aquariumId);
      },
      async listAllForAquarium(aquariumId) {
        return db.prepare('SELECT * FROM alerts WHERE aquarium_id = ? ORDER BY created_at DESC').all(aquariumId);
      },
      async create({ aquarium_id, measurement_id = null, param, level, value, message }) {
        const info = db
          .prepare('INSERT INTO alerts (aquarium_id, measurement_id, param, level, value, message) VALUES (?, ?, ?, ?, ?, ?)')
          .run(aquarium_id, measurement_id, param, level, value, message);
        return { id: Number(info.lastInsertRowid) };
      },
      async ack(id, aquariumId) {
        const res = db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE id = ? AND aquarium_id = ? AND acked_at IS NULL").run(id, aquariumId);
        return res.changes > 0;
      },
      async ackAll(aquariumId) {
        const res = db.prepare("UPDATE alerts SET acked_at = datetime('now') WHERE aquarium_id = ? AND acked_at IS NULL").run(aquariumId);
        return res.changes;
      },
      async countOpen(aquariumId) {
        const alerts = db.prepare(`SELECT level, COUNT(*) n FROM alerts WHERE aquarium_id = ? AND acked_at IS NULL GROUP BY level`).all(aquariumId);
        const crit = alerts.find((a) => a.level === 'crit')?.n || 0;
        const warn = alerts.find((a) => a.level === 'warn')?.n || 0;
        return { crit, warn };
      },
    };

    this.maintenance = {
      async listForAquarium(aquariumId, options = {}) {
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
      async findById(id) {
        return db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(id) || null;
      },
      async create({ aquarium_id, logged_at, type, percentage = null, details = null, note = null, created_by = null }) {
        const info = db
          .prepare('INSERT INTO maintenance_logs (aquarium_id, logged_at, type, percentage, details, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(aquarium_id, logged_at, type, percentage, details, note, created_by);
        return { id: Number(info.lastInsertRowid) };
      },
      async update(id, aquariumId, fields = {}) {
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
      async delete(id, aquariumId = null) {
        let res;
        if (aquariumId != null) {
          res = db.prepare('DELETE FROM maintenance_logs WHERE id = ? AND aquarium_id = ?').run(id, aquariumId);
        } else {
          res = db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(id);
        }
        return res.changes > 0;
      },
      async getTimeline(aquariumId, options = {}) {
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

        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (options.limit && Number.isFinite(Number(options.limit))) {
          return timeline.slice(0, Number(options.limit));
        }

        return timeline;
      },
      async getLatest(aquariumId) {
        return db.prepare('SELECT logged_at, type FROM maintenance_logs WHERE aquarium_id = ? ORDER BY logged_at DESC LIMIT 1').get(aquariumId) || null;
      },
      async getLatestWaterChange(aquariumId) {
        return (
          db
            .prepare("SELECT logged_at, percentage FROM maintenance_logs WHERE aquarium_id = ? AND type = 'water_change' ORDER BY logged_at DESC LIMIT 1")
            .get(aquariumId) || null
        );
      },
    };
  }

  async exportAllData() {
    if (!this._initialized) await this.init();
    const db = this.db;

    const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
    const aquariums = db.prepare('SELECT * FROM aquariums ORDER BY id ASC').all();
    const aquarium_images = db.prepare('SELECT * FROM aquarium_images ORDER BY id ASC').all();
    const aquarium_shares = db.prepare('SELECT * FROM aquarium_shares ORDER BY aquarium_id ASC, user_id ASC').all();
    const stock = db.prepare('SELECT * FROM stock ORDER BY id ASC').all();
    const rawMeasurements = db.prepare('SELECT * FROM measurements ORDER BY id ASC').all();
    const rawValues = db.prepare('SELECT * FROM measurement_values ORDER BY measurement_id ASC, param ASC').all();
    const alerts = db.prepare('SELECT * FROM alerts ORDER BY id ASC').all();
    const maintenance_logs = db.prepare('SELECT * FROM maintenance_logs ORDER BY id ASC').all();

    const valuesByMId = new Map();
    for (const row of rawValues) {
      if (!valuesByMId.has(row.measurement_id)) valuesByMId.set(row.measurement_id, {});
      valuesByMId.get(row.measurement_id)[row.param] = row.value;
    }

    const measurements = rawMeasurements.map((m) => ({
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
      measurements,
      alerts,
      maintenance_logs,
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

    const validUserIds = new Set(users.map((u) => u.id));
    const currentSessions = db.prepare('SELECT * FROM sessions WHERE expires_at > ?').all(Date.now());

    const runImport = db.transaction(() => {
      db.pragma('foreign_keys = OFF');

      db.exec('DELETE FROM alerts');
      db.exec('DELETE FROM measurement_values');
      db.exec('DELETE FROM measurements');
      db.exec('DELETE FROM maintenance_logs');
      db.exec('DELETE FROM stock');
      db.exec('DELETE FROM aquarium_images');
      db.exec('DELETE FROM aquarium_shares');
      db.exec('DELETE FROM aquariums');
      db.exec('DELETE FROM sessions');
      db.exec('DELETE FROM users');

      // Users
      const insertUser = db.prepare(`
        INSERT INTO users (id, username, password_hash, email, oidc_sub, first_name, last_name, bio, avatar_file, selected_suite, selected_tests, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          u.created_at || new Date().toISOString()
        );
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
        INSERT INTO aquariums (id, user_id, name, volume_l, water_type, reminder_days, notes, image_file, motto, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        INSERT INTO aquarium_shares (aquarium_id, user_id, role, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const s of shares) {
        insertShare.run(s.aquarium_id, s.user_id, s.role || 'view', s.created_at || new Date().toISOString());
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
        INSERT INTO maintenance_logs (id, aquarium_id, logged_at, type, percentage, details, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          ml.created_at || new Date().toISOString()
        );
      }

      db.pragma('foreign_keys = ON');
    });

    runImport();
    return true;
  }
}

module.exports = SqliteAdapter;
