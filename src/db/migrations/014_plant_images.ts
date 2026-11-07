import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

/** Photos of plants in an aquarium, e.g. to remember where a plant was planted. */
export = {
  version: 14,
  name: '014_plant_images',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      const collection = (db as MongoConnection).collection('aquarium_plant_images');
      await collection.createIndex({ id: 1 }, { unique: true });
      await collection.createIndex({ aquarium_id: 1, plant_id: 1 });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS aquarium_plant_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        plant_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        caption TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_aquarium_plant_images ON aquarium_plant_images(aquarium_id, plant_id)`);
    }
  },
};
