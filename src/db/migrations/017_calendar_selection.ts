import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

/** Aquariums a user excluded from the iCal export and CalDAV calendar (JSON array of IDs). */
export = {
  version: 17,
  name: '017_calendar_selection',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('users').updateMany(
        { calendar_excluded_aquariums: { $exists: false } },
        { $set: { calendar_excluded_aquariums: null } },
      );
    } else if (!(db as SqliteConnection).prepare('PRAGMA table_info(users)').all().some((column: any) => column.name === 'calendar_excluded_aquariums')) {
      (db as SqliteConnection).exec('ALTER TABLE users ADD COLUMN calendar_excluded_aquariums TEXT DEFAULT NULL');
    }
  },
};
