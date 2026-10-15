import type { SqliteConnection, MongoConnection } from '../types/database-driver';
import type { SocialNotification, SocialNotificationType } from '../types/notifications';
import type { ClientSession } from 'mongodb';

export class NotificationRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection,
    private readonly sequence?: (name: string) => Promise<number>) {}
  private get sql() { return this.raw as SqliteConnection; }
  private get mongo() { return this.raw as MongoConnection; }

  async create(input: { user_id: number; actor_id: number; post_id: number; comment_id?: number | null; type: SocialNotificationType }) {
    if (input.user_id === input.actor_id) return null;
    const created_at = new Date().toISOString();
    if (this.type === 'sqlite') {
      const result = this.sql.prepare(`INSERT OR IGNORE INTO social_notifications
        (user_id, actor_id, post_id, comment_id, type, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(input.user_id, input.actor_id, input.post_id, input.comment_id ?? null, input.type, created_at);
      return result.changes ? Number(result.lastInsertRowid) : null;
    }
    const existing = await this.mongo.collection<SocialNotification>('social_notifications').findOne({
      user_id: input.user_id, actor_id: input.actor_id, post_id: input.post_id, type: input.type,
      comment_id: input.comment_id ?? null,
    });
    if (existing) return null;
    const id = await this.sequence!('social_notifications');
    try {
      await this.mongo.collection<SocialNotification>('social_notifications').insertOne({ id, ...input, comment_id: input.comment_id ?? null, created_at, read_at: null });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return null;
      throw error;
    }
    return id;
  }

  async listForUser(userId: number, limit = 50) {
    if (this.type === 'sqlite') return this.sql.prepare<SocialNotification & { actor_username: string; post_text: string }>(`
      SELECT n.*, u.username AS actor_username, p.text AS post_text
      FROM social_notifications n
      JOIN users u ON u.id = n.actor_id JOIN social_posts p ON p.id = n.post_id
      WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ?`).all(userId, limit);
    const rows = await this.mongo.collection<SocialNotification>('social_notifications').find({ user_id: userId }).sort({ id: -1 }).limit(limit).toArray();
    return Promise.all(rows.map(async row => {
      const [actor, post] = await Promise.all([
        this.mongo.collection('users').findOne({ id: row.actor_id }), this.mongo.collection('social_posts').findOne({ id: row.post_id }),
      ]);
      return { ...row, actor_username: actor?.username || 'Gelöschter Nutzer', post_text: post?.text || '' };
    }));
  }

  async markRead(userId: number, ids?: number[]) {
    const readAt = new Date().toISOString();
    if (this.type === 'sqlite') {
      if (!ids) return this.sql.prepare('UPDATE social_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(readAt, userId).changes;
      const update = this.sql.prepare('UPDATE social_notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL');
      return this.sql.transaction(() => ids.reduce((count, id) => count + update.run(readAt, id, userId).changes, 0))();
    }
    const result = await this.mongo.collection('social_notifications').updateMany({ user_id: userId, read_at: null, ...(ids ? { id: { $in: ids } } : {}) }, { $set: { read_at: readAt } });
    return result.modifiedCount;
  }

  async unreadCount(userId: number) {
    if (this.type === 'sqlite') return Number(this.sql.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM social_notifications WHERE user_id = ? AND read_at IS NULL').get(userId)?.count || 0);
    return this.mongo.collection('social_notifications').countDocuments({ user_id: userId, read_at: null });
  }

  async exportData(session?: ClientSession) {
    if (this.type === 'sqlite') return this.sql.prepare<SocialNotification>('SELECT * FROM social_notifications ORDER BY id').all();
    return (await this.mongo.collection<SocialNotification & { _id?: unknown }>('social_notifications').find({}, { session }).toArray())
      .map(({ _id, ...row }) => row);
  }

  async clear(session?: ClientSession) {
    if (this.type === 'sqlite') { this.sql.prepare('DELETE FROM social_notifications').run(); return; }
    await this.mongo.collection('social_notifications').deleteMany({}, { session });
  }

  async importData(rows: SocialNotification[], session?: ClientSession) {
    if (!rows.length) return;
    if (this.type === 'sqlite') {
      const insert = this.sql.prepare('INSERT INTO social_notifications (id,user_id,actor_id,post_id,comment_id,type,created_at,read_at) VALUES (?,?,?,?,?,?,?,?)');
      this.sql.transaction(() => rows.forEach(row => insert.run(row.id,row.user_id,row.actor_id,row.post_id,row.comment_id,row.type,row.created_at,row.read_at)))();
      return;
    }
    await this.mongo.collection<SocialNotification>('social_notifications').insertMany(rows, { session });
    await this.mongo.collection<{ _id: string; seq: number }>('counters').updateOne({ _id: 'social_notifications' },
      { $set: { seq: rows.reduce((max, row) => Math.max(max, row.id), 0) } }, { upsert: true, session });
  }
}
