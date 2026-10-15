import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
import envModule = require('../../config/env');
const { ADMIN_EMAILS } = envModule;

export = {
  version: 10,
  name: '010_database_admins',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    const legacyAdmins = (ADMIN_EMAILS as string[]).map(email => email.toLowerCase());
    if (context.type === 'mongodb' || 'collection' in db) {
      const users = (db as MongoConnection).collection('users');
      await users.updateMany({ is_admin: { $exists: false } }, { $set: { is_admin: false } });
      if (legacyAdmins.length) await users.updateMany({ email: { $in: legacyAdmins }, email_verified: { $in: [1, true] } }, { $set: { is_admin: true } });
      await users.createIndex({ is_admin: 1 });
      return;
    }
    const sqlite = db as SqliteConnection;
    const columns = sqlite.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!columns.some(column => column.name === 'is_admin')) sqlite.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    if (legacyAdmins.length) {
      const placeholders = legacyAdmins.map(() => '?').join(',');
      sqlite.prepare(`UPDATE users SET is_admin = 1 WHERE lower(email) IN (${placeholders}) AND email_verified = 1`).run(...legacyAdmins);
    }
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_users_admin ON users(is_admin)');
  },
};
