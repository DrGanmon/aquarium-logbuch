'use strict';
const logger = require('../../utils/logger');

/**
 * Migration Version 0: Basisschema vor der Dosierpumpe
 * Enthält alle Tabellen/Collections, Indizes und Spalten-/Dokumentenstrukturen vor Einführung der Dosierpumpe.
 */
module.exports = {
  version: 0,
  name: '000_base_schema',

  /**
   * Führt die Migration auf Version 0 für SQLite oder MongoDB aus.
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
   * SQLite DDL und Schema-Upgrades
   * @param {import('better-sqlite3').Database} db
   */
  upSqlite(db) {
    // 1. Basistabellen vor Version 1 (ohne dosing_pumps)
    db.exec(`
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
        image_file TEXT,
        motto TEXT,
        description TEXT,
        measure_cycle_interval INTEGER,
        measure_cycle_unit TEXT DEFAULT 'days',
        measure_cycle_day_of_week INTEGER,
        measure_reminder_mail INTEGER NOT NULL DEFAULT 0,
        last_measure_reminder_sent_at TEXT,
        fertilize_cycle_interval INTEGER,
        fertilize_cycle_unit TEXT DEFAULT 'days',
        fertilize_cycle_day_of_week INTEGER,
        fertilize_reminder_mail INTEGER NOT NULL DEFAULT 0,
        last_fertilize_reminder_sent_at TEXT,
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
        status TEXT NOT NULL DEFAULT 'accepted',
        token TEXT,
        token_expires INTEGER,
        accepted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (aquarium_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_aq_shares_user ON aquarium_shares(user_id);
      CREATE INDEX IF NOT EXISTS idx_aq_shares_status ON aquarium_shares(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_aq_shares_token ON aquarium_shares(token);
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
      CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        type TEXT NOT NULL DEFAULT 'code',
        email TEXT COLLATE NOCASE,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        max_uses INTEGER DEFAULT 1,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
      CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON invitations(created_by);
      CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations(expires_at);
      CREATE TABLE IF NOT EXISTS aquarium_chats (
        id INTEGER PRIMARY KEY,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_aq_chats_aq ON aquarium_chats(aquarium_id, created_at);
    `);

    // 2. Abwärtskompatibilität: Spalten prüfen und bei Altdatenbanken per ALTER TABLE ergänzen
    const hasTable = (table) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table));
    const hasColumn = (table, col) => hasTable(table) && db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

    if (!hasColumn('users', 'oidc_sub')) db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
    if (!hasColumn('users', 'email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE');
    if (!hasColumn('users', 'first_name')) db.exec('ALTER TABLE users ADD COLUMN first_name TEXT');
    if (!hasColumn('users', 'last_name')) db.exec('ALTER TABLE users ADD COLUMN last_name TEXT');
    if (!hasColumn('users', 'bio')) db.exec('ALTER TABLE users ADD COLUMN bio TEXT');
    if (!hasColumn('users', 'avatar_file')) db.exec('ALTER TABLE users ADD COLUMN avatar_file TEXT');
    if (!hasColumn('users', 'selected_suite')) db.exec('ALTER TABLE users ADD COLUMN selected_suite TEXT');
    if (!hasColumn('users', 'selected_tests')) db.exec('ALTER TABLE users ADD COLUMN selected_tests TEXT');
    if (!hasColumn('users', 'default_graph_range')) db.exec('ALTER TABLE users ADD COLUMN default_graph_range TEXT');
    if (!hasColumn('users', 'email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1');
    if (!hasColumn('users', 'email_verify_token')) db.exec('ALTER TABLE users ADD COLUMN email_verify_token TEXT');
    if (!hasColumn('users', 'email_verify_expires')) db.exec('ALTER TABLE users ADD COLUMN email_verify_expires INTEGER');
    if (!hasColumn('users', 'password_reset_token')) db.exec('ALTER TABLE users ADD COLUMN password_reset_token TEXT');
    if (!hasColumn('users', 'password_reset_expires')) db.exec('ALTER TABLE users ADD COLUMN password_reset_expires INTEGER');
    if (!hasColumn('users', 'account_delete_token')) db.exec('ALTER TABLE users ADD COLUMN account_delete_token TEXT');
    if (!hasColumn('users', 'account_delete_expires')) db.exec('ALTER TABLE users ADD COLUMN account_delete_expires INTEGER');
    if (!hasColumn('users', 'openai_api_key')) db.exec('ALTER TABLE users ADD COLUMN openai_api_key TEXT');
    if (!hasColumn('users', 'openai_model')) db.exec('ALTER TABLE users ADD COLUMN openai_model TEXT');
    if (!hasColumn('users', 'gemini_api_key')) db.exec('ALTER TABLE users ADD COLUMN gemini_api_key TEXT');
    if (!hasColumn('users', 'gemini_model')) db.exec('ALTER TABLE users ADD COLUMN gemini_model TEXT');
    if (!hasColumn('users', 'claude_api_key')) db.exec('ALTER TABLE users ADD COLUMN claude_api_key TEXT');
    if (!hasColumn('users', 'claude_model')) db.exec('ALTER TABLE users ADD COLUMN claude_model TEXT');
    if (!hasColumn('users', 'ai_provider')) db.exec('ALTER TABLE users ADD COLUMN ai_provider TEXT');
    if (!hasColumn('users', 'language')) db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'de'");

    if (!hasColumn('sessions', 'id_token')) db.exec('ALTER TABLE sessions ADD COLUMN id_token TEXT');

    if (!hasColumn('aquariums', 'image_file')) db.exec('ALTER TABLE aquariums ADD COLUMN image_file TEXT');
    if (!hasColumn('aquariums', 'motto')) db.exec('ALTER TABLE aquariums ADD COLUMN motto TEXT');
    if (!hasColumn('aquariums', 'description')) db.exec('ALTER TABLE aquariums ADD COLUMN description TEXT');
    if (!hasColumn('aquariums', 'measure_cycle_interval')) db.exec('ALTER TABLE aquariums ADD COLUMN measure_cycle_interval INTEGER');
    if (!hasColumn('aquariums', 'measure_cycle_unit')) db.exec("ALTER TABLE aquariums ADD COLUMN measure_cycle_unit TEXT DEFAULT 'days'");
    if (!hasColumn('aquariums', 'measure_cycle_day_of_week')) db.exec('ALTER TABLE aquariums ADD COLUMN measure_cycle_day_of_week INTEGER');
    if (!hasColumn('aquariums', 'measure_reminder_mail')) db.exec('ALTER TABLE aquariums ADD COLUMN measure_reminder_mail INTEGER NOT NULL DEFAULT 0');
    if (!hasColumn('aquariums', 'last_measure_reminder_sent_at')) db.exec('ALTER TABLE aquariums ADD COLUMN last_measure_reminder_sent_at TEXT');
    if (!hasColumn('aquariums', 'fertilize_cycle_interval')) db.exec('ALTER TABLE aquariums ADD COLUMN fertilize_cycle_interval INTEGER');
    if (!hasColumn('aquariums', 'fertilize_cycle_unit')) db.exec("ALTER TABLE aquariums ADD COLUMN fertilize_cycle_unit TEXT DEFAULT 'days'");
    if (!hasColumn('aquariums', 'fertilize_cycle_day_of_week')) db.exec('ALTER TABLE aquariums ADD COLUMN fertilize_cycle_day_of_week INTEGER');
    if (!hasColumn('aquariums', 'fertilize_reminder_mail')) db.exec('ALTER TABLE aquariums ADD COLUMN fertilize_reminder_mail INTEGER NOT NULL DEFAULT 0');
    if (!hasColumn('aquariums', 'last_fertilize_reminder_sent_at')) db.exec('ALTER TABLE aquariums ADD COLUMN last_fertilize_reminder_sent_at TEXT');

    if (!hasColumn('stock', 'name')) db.exec('ALTER TABLE stock ADD COLUMN name TEXT');
    if (!hasColumn('stock', 'image_file')) db.exec('ALTER TABLE stock ADD COLUMN image_file TEXT');

    if (!hasColumn('measurements', 'created_by')) db.exec('ALTER TABLE measurements ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
    if (!hasColumn('measurements', 'note')) db.exec('ALTER TABLE measurements ADD COLUMN note TEXT');

    if (!hasColumn('alerts', 'acked_at')) db.exec('ALTER TABLE alerts ADD COLUMN acked_at TEXT');

    if (!hasColumn('invitations', 'note')) db.exec('ALTER TABLE invitations ADD COLUMN note TEXT');
    if (!hasColumn('invitations', 'max_uses')) db.exec('ALTER TABLE invitations ADD COLUMN max_uses INTEGER DEFAULT 1');
    if (!hasColumn('invitations', 'used_count')) db.exec('ALTER TABLE invitations ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0');

    if (!hasColumn('aquarium_shares', 'status')) db.exec("ALTER TABLE aquarium_shares ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'");
    if (!hasColumn('aquarium_shares', 'token')) db.exec('ALTER TABLE aquarium_shares ADD COLUMN token TEXT');
    if (!hasColumn('aquarium_shares', 'token_expires')) db.exec('ALTER TABLE aquarium_shares ADD COLUMN token_expires INTEGER');
    if (!hasColumn('aquarium_shares', 'accepted_at')) db.exec('ALTER TABLE aquarium_shares ADD COLUMN accepted_at TEXT');

    if (!hasColumn('maintenance_logs', 'details')) db.exec('ALTER TABLE maintenance_logs ADD COLUMN details TEXT');
    if (!hasColumn('maintenance_logs', 'note')) db.exec('ALTER TABLE maintenance_logs ADD COLUMN note TEXT');
    if (!hasColumn('maintenance_logs', 'created_by')) db.exec('ALTER TABLE maintenance_logs ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');

    if (!hasColumn('aquarium_images', 'caption')) db.exec('ALTER TABLE aquarium_images ADD COLUMN caption TEXT');
    if (!hasColumn('aquarium_images', 'is_primary')) db.exec('ALTER TABLE aquarium_images ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0');

    if (!hasColumn('aquarium_chats', 'provider')) db.exec('ALTER TABLE aquarium_chats ADD COLUMN provider TEXT');
    if (!hasColumn('aquarium_chats', 'model')) db.exec('ALTER TABLE aquarium_chats ADD COLUMN model TEXT');
    if (!hasColumn('aquarium_chats', 'user_id')) db.exec('ALTER TABLE aquarium_chats ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');

    // Indizes für optionale/neue Spalten
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_sub) WHERE oidc_sub IS NOT NULL');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != \'\'');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(email_verify_token) WHERE email_verify_token IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_delete_token ON users(account_delete_token) WHERE account_delete_token IS NOT NULL');

    logger.info('Basisschema v0 (SQLite): Alle Tabellenstrukturen und Indizes erfolgreich verifiziert.', 'db');
  },

  /**
   * MongoDB Schema- und Dokumentenmigration (Aktualisierung aller Bestandsdokumente)
   * @param {import('mongodb').Db} db
   */
  async upMongo(db) {
    // 1. users: Standardfelder für bestehende Dokumente sicherstellen
    await db.collection('users').updateMany(
      { language: { $exists: false } },
      { $set: { language: 'de' } }
    );
    await db.collection('users').updateMany(
      { email_verified: { $exists: false } },
      { $set: { email_verified: 1 } }
    );
    await db.collection('users').updateMany(
      { email: { $exists: false } },
      { $set: { email: null } }
    );
    await db.collection('users').updateMany(
      { first_name: { $exists: false } },
      { $set: { first_name: null } }
    );
    await db.collection('users').updateMany(
      { last_name: { $exists: false } },
      { $set: { last_name: null } }
    );
    await db.collection('users').updateMany(
      { bio: { $exists: false } },
      { $set: { bio: null } }
    );
    await db.collection('users').updateMany(
      { avatar_file: { $exists: false } },
      { $set: { avatar_file: null } }
    );
    await db.collection('users').updateMany(
      { selected_suite: { $exists: false } },
      { $set: { selected_suite: null } }
    );
    await db.collection('users').updateMany(
      { selected_tests: { $exists: false } },
      { $set: { selected_tests: null } }
    );
    await db.collection('users').updateMany(
      { default_graph_range: { $exists: false } },
      { $set: { default_graph_range: null } }
    );
    await db.collection('users').updateMany(
      { oidc_sub: { $exists: false } },
      { $set: { oidc_sub: null } }
    );
    await db.collection('users').updateMany(
      { ai_provider: { $exists: false } },
      { $set: { ai_provider: null } }
    );

    // 2. aquariums: Standardfelder absichern
    await db.collection('aquariums').updateMany(
      { water_type: { $exists: false } },
      { $set: { water_type: 'fresh' } }
    );
    await db.collection('aquariums').updateMany(
      { reminder_days: { $exists: false } },
      { $set: { reminder_days: 7 } }
    );
    await db.collection('aquariums').updateMany(
      { measure_cycle_unit: { $exists: false } },
      { $set: { measure_cycle_unit: 'days' } }
    );
    await db.collection('aquariums').updateMany(
      { measure_reminder_mail: { $exists: false } },
      { $set: { measure_reminder_mail: 0 } }
    );
    await db.collection('aquariums').updateMany(
      { fertilize_cycle_unit: { $exists: false } },
      { $set: { fertilize_cycle_unit: 'days' } }
    );
    await db.collection('aquariums').updateMany(
      { fertilize_reminder_mail: { $exists: false } },
      { $set: { fertilize_reminder_mail: 0 } }
    );
    await db.collection('aquariums').updateMany(
      { image_file: { $exists: false } },
      { $set: { image_file: null } }
    );
    await db.collection('aquariums').updateMany(
      { motto: { $exists: false } },
      { $set: { motto: null } }
    );
    await db.collection('aquariums').updateMany(
      { description: { $exists: false } },
      { $set: { description: null } }
    );
    await db.collection('aquariums').updateMany(
      { notes: { $exists: false } },
      { $set: { notes: null } }
    );

    // 3. stock: Standardfelder absichern
    await db.collection('stock').updateMany(
      { profile: { $exists: false } },
      { $set: { profile: 'allgemein' } }
    );
    await db.collection('stock').updateMany(
      { $or: [{ count: { $exists: false } }, { count: null }, { count: { $lte: 0 } }] },
      { $set: { count: 1 } }
    );
    await db.collection('stock').updateMany(
      { name: { $exists: false } },
      { $set: { name: null } }
    );
    await db.collection('stock').updateMany(
      { image_file: { $exists: false } },
      { $set: { image_file: null } }
    );

    // 4. maintenance_logs: Standardfelder absichern
    await db.collection('maintenance_logs').updateMany(
      { details: { $exists: false } },
      { $set: { details: null } }
    );
    await db.collection('maintenance_logs').updateMany(
      { note: { $exists: false } },
      { $set: { note: null } }
    );
    await db.collection('maintenance_logs').updateMany(
      { percentage: { $exists: false } },
      { $set: { percentage: null } }
    );
    await db.collection('maintenance_logs').updateMany(
      { created_by: { $exists: false } },
      { $set: { created_by: null } }
    );

    // 5. alerts: acked_at absichern
    await db.collection('alerts').updateMany(
      { acked_at: { $exists: false } },
      { $set: { acked_at: null } }
    );

    // 6. aquarium_shares: Standardwerte absichern
    await db.collection('aquarium_shares').updateMany(
      { status: { $exists: false } },
      { $set: { status: 'accepted' } }
    );
    await db.collection('aquarium_shares').updateMany(
      { role: { $exists: false } },
      { $set: { role: 'view' } }
    );

    // 7. aquarium_images: is_primary absichern
    await db.collection('aquarium_images').updateMany(
      { is_primary: { $exists: false } },
      { $set: { is_primary: 0 } }
    );

    // 8. invitations: Standardwerte absichern
    await db.collection('invitations').updateMany(
      { type: { $exists: false } },
      { $set: { type: 'code' } }
    );
    await db.collection('invitations').updateMany(
      { max_uses: { $exists: false } },
      { $set: { max_uses: 1 } }
    );
    await db.collection('invitations').updateMany(
      { used_count: { $exists: false } },
      { $set: { used_count: 0 } }
    );

    logger.info('Basisschema v0 (MongoDB): Standardfelder für alle Bestandsdokumente erfolgreich verifiziert.', 'db');
  }
};
