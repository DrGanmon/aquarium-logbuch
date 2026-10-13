import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
export = {
  version: 3,
  name: '003_social',
  async up(db: SqliteConnection | MongoConnection, context: { type?: string } = {}) {
    if (context.type === 'mongodb' || 'collection' in db) {
      const mongo = db as MongoConnection;
      await mongo.collection('social_posts').createIndex({ id: 1 }, { unique: true });
      await mongo.collection('social_posts').createIndex({ user_id: 1, id: -1 });
      await mongo.collection('social_comments').createIndex({ id: 1 }, { unique: true });
      await mongo.collection('social_comments').createIndex({ post_id: 1, id: -1 });
      await mongo.collection('social_comments').createIndex({ user_id: 1 });
      await mongo.collection('social_likes').createIndex({ post_id: 1, user_id: 1 }, { unique: true });
      await mongo.collection('social_likes').createIndex({ user_id: 1 });
    } else {
      (db as SqliteConnection).exec(`
        CREATE TABLE IF NOT EXISTS social_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          filename TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
          text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS social_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS social_likes (
          post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY (post_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id, id);
        CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id, id);
        CREATE INDEX IF NOT EXISTS idx_social_comments_user ON social_comments(user_id);
        CREATE INDEX IF NOT EXISTS idx_social_likes_user ON social_likes(user_id);
      `);
    }
  },
};
