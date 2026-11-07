import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

/** One lighting schedule (RGBW levels, photoperiod, sunrise and sunset ramps) per aquarium. */
export = {
  version: 16,
  name: '016_aquarium_lighting',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('aquarium_lighting').createIndex({ aquarium_id: 1 }, { unique: true });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS aquarium_lighting (
        aquarium_id INTEGER PRIMARY KEY REFERENCES aquariums(id) ON DELETE CASCADE,
        red REAL NOT NULL CHECK(red BETWEEN 0 AND 100),
        green REAL NOT NULL CHECK(green BETWEEN 0 AND 100),
        blue REAL NOT NULL CHECK(blue BETWEEN 0 AND 100),
        white REAL NOT NULL CHECK(white BETWEEN 0 AND 100),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        sunrise_minutes INTEGER NOT NULL DEFAULT 0,
        sunset_minutes INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        updated_at TEXT NOT NULL
      )`);
    }
  },
};
