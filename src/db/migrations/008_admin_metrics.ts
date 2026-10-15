import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

export = {
  version: 8,
  name: '008_admin_metrics',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      await (db as MongoConnection).collection('ai_usage_metrics').createIndex({ provider: 1 }, { unique: true });
      return;
    }
    (db as SqliteConnection).exec(`
      CREATE TABLE IF NOT EXISTS ai_usage_metrics (
        provider TEXT PRIMARY KEY CHECK (provider IN ('openai', 'gemini', 'claude')),
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
        request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
        updated_at TEXT NOT NULL
      );
    `);
  },
};