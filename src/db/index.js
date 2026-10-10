'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('../config/env');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'aquarium.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
`);

// Migration für OIDC, E-Mail, Profil, Testsuite & Bilder
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
if (!hasColumn('users', 'oidc_sub')) db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
if (!hasColumn('users', 'email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE');
if (!hasColumn('users', 'first_name')) db.exec('ALTER TABLE users ADD COLUMN first_name TEXT');
if (!hasColumn('users', 'last_name')) db.exec('ALTER TABLE users ADD COLUMN last_name TEXT');
if (!hasColumn('users', 'bio')) db.exec('ALTER TABLE users ADD COLUMN bio TEXT');
if (!hasColumn('users', 'avatar_file')) db.exec('ALTER TABLE users ADD COLUMN avatar_file TEXT');
if (!hasColumn('users', 'selected_suite')) db.exec('ALTER TABLE users ADD COLUMN selected_suite TEXT');
if (!hasColumn('users', 'selected_tests')) db.exec('ALTER TABLE users ADD COLUMN selected_tests TEXT');
if (!hasColumn('sessions', 'id_token')) db.exec('ALTER TABLE sessions ADD COLUMN id_token TEXT');
if (!hasColumn('aquariums', 'image_file')) db.exec('ALTER TABLE aquariums ADD COLUMN image_file TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_sub) WHERE oidc_sub IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != \'\'');

module.exports = db;
