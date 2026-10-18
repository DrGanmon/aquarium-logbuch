import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

export = {
  version: 13,
  name: '013_tap_water',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('users').updateMany(
        { tap_water: { $exists: false } },
        { $set: { tap_water: null } }
      );
    } else if (!(db as SqliteConnection).prepare('PRAGMA table_info(users)').all().some((column: any) => column.name === 'tap_water')) {
      (db as SqliteConnection).exec('ALTER TABLE users ADD COLUMN tap_water TEXT DEFAULT NULL');
    }
  },
};
