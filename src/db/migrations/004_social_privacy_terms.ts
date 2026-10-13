import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
export = {
  version: 4,
  name: '004_social_privacy_terms',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      const mongo = db as MongoConnection;
      await mongo.collection('social_posts').updateMany({ is_public: { $exists: false } }, { $set: { is_public: true } });
      await mongo.collection('social_posts').createIndex({ is_public: 1, id: -1 });
      for (const field of ['terms_version', 'terms_accepted_at'])
        await mongo.collection('users').updateMany({ [field]: { $exists: false } }, { $set: { [field]: null } });
    } else {
      const sql = db as SqliteConnection;
      for (const [table, field, definition] of [
        ['social_posts', 'is_public', 'INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1))'],
        ['users', 'terms_version', 'TEXT'], ['users', 'terms_accepted_at', 'TEXT'],
      ]) {
        if (!sql.prepare<{ name: string }>(`PRAGMA table_info(${table})`).all().some(column => column.name === field))
          sql.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${definition}`);
      }
      sql.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_visibility ON social_posts(is_public, id)');
    }
  },
};
