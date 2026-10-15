import type { SqliteConnection, MongoConnection } from '../../types/database-driver';

export = {
  version: 9,
  name: '009_notifications',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      const mongo = db as MongoConnection;
      await mongo.collection('social_notifications').createIndex({ id: 1 }, { unique: true });
      await mongo.collection('social_notifications').createIndex({ user_id: 1, read_at: 1, id: -1 });
      await mongo.collection('social_notifications').createIndex(
        { user_id: 1, actor_id: 1, post_id: 1, type: 1, comment_id: 1 }, { unique: true }
      );
    } else {
      (db as SqliteConnection).exec(`
        CREATE TABLE IF NOT EXISTS social_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
          comment_id INTEGER REFERENCES social_comments(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('like', 'comment')),
          created_at TEXT NOT NULL,
          read_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_social_notifications_user ON social_notifications(user_id, read_at, id DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_social_notifications_event
          ON social_notifications(user_id, actor_id, post_id, type, COALESCE(comment_id, 0));
      `);
    }
  },
};
