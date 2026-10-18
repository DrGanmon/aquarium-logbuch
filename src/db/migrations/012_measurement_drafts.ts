import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
export = {
  version: 12,
  name: '012_measurement_drafts',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('measurement_drafts').createIndex({ user_id: 1, aquarium_id: 1 }, { unique: true });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS measurement_drafts (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        revision TEXT NOT NULL, payload TEXT,
        PRIMARY KEY (user_id, aquarium_id)
      )`);
    }
  },
};
