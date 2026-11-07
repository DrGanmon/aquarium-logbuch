import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

/**
 * Opt-in social profiles. An enabled profile is public; which posts it lists depends only on each
 * post's own visibility and the viewer. One row per account so future profile fields (bio, links,
 * cover image …) can be added here without touching the account record.
 */
export = {
  version: 18,
  name: '018_social_profiles',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('social_profiles').createIndex({ user_id: 1 }, { unique: true });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS social_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
    }
  },
};
