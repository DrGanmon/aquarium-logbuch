import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

export = {
  version: 11,
  name: '011_offline_measurements',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('measurement_operations').createIndex({ operation_key: 1 }, { unique: true });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS measurement_operations (
        operation_key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response TEXT NOT NULL
      )`);
    }
  },
};
