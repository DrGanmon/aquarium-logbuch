import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

/** Recurring care tasks per aquarium and per-user CalDAV credentials for the read-only calendar. */
export = {
  version: 15,
  name: '015_care_tasks_caldav',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      const mongo = db as MongoConnection;
      await mongo.collection('care_tasks').createIndex({ id: 1 }, { unique: true });
      await mongo.collection('care_tasks').createIndex({ aquarium_id: 1 });
      await mongo.collection('caldav_credentials').createIndex({ user_id: 1 }, { unique: true });
    } else {
      (db as SqliteConnection).exec(`CREATE TABLE IF NOT EXISTS care_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aquarium_id INTEGER NOT NULL REFERENCES aquariums(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT,
        note TEXT,
        interval INTEGER NOT NULL CHECK(interval BETWEEN 1 AND 365),
        unit TEXT NOT NULL CHECK(unit IN ('days', 'weeks', 'months')),
        start_date TEXT NOT NULL,
        time_of_day TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_care_tasks_aquarium ON care_tasks(aquarium_id);
      CREATE TABLE IF NOT EXISTS caldav_credentials (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
    }
  },
};
