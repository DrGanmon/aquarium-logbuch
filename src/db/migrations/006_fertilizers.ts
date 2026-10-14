import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
export = {
  version: 6,
  name: '006_fertilizers',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    const started = new Date().toISOString();
    if (context.type === 'mongodb' || 'collection' in db) {
      const mongo = db as MongoConnection;
      for (const [field, value] of Object.entries({ mode: 'automatic', reminder_mail: 0, last_reminder_sent_at: null, schedule_started_at: started })) {
        await mongo.collection('dosing_pumps').updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
      }
      await mongo.collection('maintenance_logs').createIndex({ automation_key: 1 }, { unique: true, partialFilterExpression: { automation_key: { $type: 'string' } } });
      await mongo.collection('aquariums').updateMany({}, { $set: { fertilize_cycle_interval: null, fertilize_cycle_day_of_week: null, fertilize_reminder_mail: 0, last_fertilize_reminder_sent_at: null } });
    } else {
      const sql = db as SqliteConnection;
      const columns = sql.prepare('PRAGMA table_info(dosing_pumps)').all().map(row => row.name);
      for (const [field, definition] of Object.entries({ mode: "TEXT NOT NULL DEFAULT 'automatic'", reminder_mail: 'INTEGER NOT NULL DEFAULT 0', last_reminder_sent_at: 'TEXT', schedule_started_at: 'TEXT' })) {
        if (!columns.includes(field)) sql.exec(`ALTER TABLE dosing_pumps ADD COLUMN ${field} ${definition}`);
      }
      if (!sql.prepare('PRAGMA table_info(maintenance_logs)').all().some(row => row.name === 'automation_key')) sql.exec('ALTER TABLE maintenance_logs ADD COLUMN automation_key TEXT');
      sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_automation ON maintenance_logs(automation_key)');
      sql.prepare('UPDATE dosing_pumps SET schedule_started_at = ? WHERE schedule_started_at IS NULL').run(started);
      sql.exec('UPDATE aquariums SET fertilize_cycle_interval = NULL, fertilize_cycle_day_of_week = NULL, fertilize_reminder_mail = 0, last_fertilize_reminder_sent_at = NULL');
    }
  },
};
