import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
export = {
  version: 5,
  name: '005_aquarium_plants',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('aquarium_plants').createIndex({ aquarium_id: 1, plant_id: 1 }, { unique: true });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS aquarium_plants (
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        plant_id TEXT NOT NULL,
        count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 10000),
        PRIMARY KEY (aquarium_id, plant_id)
      )`);
    }
  },
};
