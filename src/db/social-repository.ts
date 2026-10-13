import type { SqliteConnection, MongoConnection } from '../types/database-driver';
import type { SocialPost, SocialComment, SocialLike } from '../types/social';
import source0 = require('../services/image-service');
const { deleteImage } = source0;

export class SocialRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection,
    private readonly sequence?: (name: string) => Promise<number>) {}
  private get sql() { return this.raw as SqliteConnection; }
  private get mongo() { return this.raw as MongoConnection; }
  async posts(before: number, limit: number): Promise<SocialPost[]> {
    if (this.type === 'sqlite') return this.sql.prepare<SocialPost>('SELECT * FROM social_posts WHERE id < ? ORDER BY id DESC LIMIT ?').all(before, limit);
    return this.mongo.collection<SocialPost>('social_posts').find({ id: { $lt: before } }).sort({ id: -1 }).limit(limit).toArray();
  }
  async post(id: number): Promise<SocialPost | null> {
    if (this.type === 'sqlite') return this.sql.prepare<SocialPost>('SELECT * FROM social_posts WHERE id = ?').get(id) || null;
    return this.mongo.collection<SocialPost>('social_posts').findOne({ id });
  }
  async createPost(input: Omit<SocialPost, 'id'>): Promise<number> {
    if (this.type === 'sqlite') return Number(this.sql.prepare('INSERT INTO social_posts (user_id, filename, width, height, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(input.user_id, input.filename, input.width, input.height, input.text, input.created_at).lastInsertRowid);
    const id = await this.sequence!('social_posts');
    await this.mongo.collection<SocialPost>('social_posts').insertOne({ id, ...input });return id;
  }
  async deletePost(id: number): Promise<void> {
    if (this.type === 'sqlite') { this.sql.prepare('DELETE FROM social_posts WHERE id = ?').run(id);return; }
    await this.mongo.collection('social_posts').deleteOne({ id });
    await Promise.all([this.mongo.collection('social_comments').deleteMany({ post_id: id }), this.mongo.collection('social_likes').deleteMany({ post_id: id })]);
  }
  async counts(id: number, userId?: number) {
    if (this.type === 'sqlite') {
      const row = this.sql.prepare<{ likes: number; comments: number; liked: number }>(`SELECT
        (SELECT COUNT(*) FROM social_likes WHERE post_id = ?) AS likes,
        (SELECT COUNT(*) FROM social_comments WHERE post_id = ?) AS comments,
        (SELECT COUNT(*) FROM social_likes WHERE post_id = ? AND user_id = ?) AS liked`).get(id, id, id, userId || 0)!;
      return { likeCount: row.likes, commentCount: row.comments, liked: Boolean(row.liked) };
    }
    const [likeCount, commentCount, liked] = await Promise.all([
      this.mongo.collection('social_likes').countDocuments({ post_id: id }), this.mongo.collection('social_comments').countDocuments({ post_id: id }),
      userId ? this.mongo.collection('social_likes').findOne({ post_id: id, user_id: userId }) : null,
    ]);
    return { likeCount, commentCount, liked: Boolean(liked) };
  }
  async like(post_id: number, user_id: number, enabled: boolean) {
    if (this.type === 'sqlite') {
      this.sql.prepare(enabled ? 'INSERT OR IGNORE INTO social_likes (post_id, user_id) VALUES (?, ?)' : 'DELETE FROM social_likes WHERE post_id = ? AND user_id = ?').run(post_id, user_id);return;
    }
    if (!enabled) { await this.mongo.collection('social_likes').deleteOne({ post_id, user_id });return; }
    try { await this.mongo.collection('social_likes').updateOne({ post_id, user_id }, { $setOnInsert: { post_id, user_id } }, { upsert: true }); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error; }
  }
  async comments(postId: number, before: number, limit: number): Promise<SocialComment[]> {
    if (this.type === 'sqlite') return this.sql.prepare<SocialComment>('SELECT * FROM social_comments WHERE post_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(postId, before, limit);
    return this.mongo.collection<SocialComment>('social_comments').find({ post_id: postId, id: { $lt: before } }).sort({ id: -1 }).limit(limit).toArray();
  }
  async comment(id: number): Promise<SocialComment | null> {
    if (this.type === 'sqlite') return this.sql.prepare<SocialComment>('SELECT * FROM social_comments WHERE id = ?').get(id) || null;
    return this.mongo.collection<SocialComment>('social_comments').findOne({ id });
  }
  async createComment(input: Omit<SocialComment, 'id'>) {
    if (this.type === 'sqlite') return Number(this.sql.prepare('INSERT INTO social_comments (post_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').run(input.post_id, input.user_id, input.text, input.created_at).lastInsertRowid);
    const id = await this.sequence!('social_comments');await this.mongo.collection<SocialComment>('social_comments').insertOne({ id, ...input });return id;
  }
  async deleteComment(id: number) {
    if (this.type === 'sqlite') { this.sql.prepare('DELETE FROM social_comments WHERE id = ?').run(id);return; }
    await this.mongo.collection('social_comments').deleteOne({ id });
  }
  async hasActivity(userId: number): Promise<boolean> {
    if (this.type === 'sqlite') return Boolean(this.sql.prepare('SELECT 1 FROM social_posts WHERE user_id = ? UNION ALL SELECT 1 FROM social_comments WHERE user_id = ? LIMIT 1').get(userId, userId));
    return Boolean(await this.mongo.collection('social_posts').findOne({ user_id: userId }) || await this.mongo.collection('social_comments').findOne({ user_id: userId }));
  }
  async deleteUser(userId: number) {
    const posts = this.type === 'sqlite' ? this.sql.prepare<SocialPost>('SELECT * FROM social_posts WHERE user_id = ?').all(userId)
      : await this.mongo.collection<SocialPost>('social_posts').find({ user_id: userId }).toArray();
    for (const post of posts) { await this.deletePost(post.id);deleteImage(post.filename); }
    if (this.type === 'sqlite') {
      this.sql.prepare('DELETE FROM social_comments WHERE user_id = ?').run(userId);
      this.sql.prepare('DELETE FROM social_likes WHERE user_id = ?').run(userId);
    } else {
      await this.mongo.collection('social_comments').deleteMany({ user_id: userId });
      await this.mongo.collection('social_likes').deleteMany({ user_id: userId });
    }
  }
  async exportData() {
    if (this.type === 'sqlite') return {
      social_posts: this.sql.prepare<SocialPost>('SELECT * FROM social_posts ORDER BY id').all(),
      social_comments: this.sql.prepare<SocialComment>('SELECT * FROM social_comments ORDER BY id').all(),
      social_likes: this.sql.prepare<SocialLike>('SELECT * FROM social_likes').all(),
    };
    const clean = <T extends { _id?: unknown }>(rows: T[]) => rows.map(({ _id, ...row }) => row);
    return { social_posts: clean(await this.mongo.collection<SocialPost>('social_posts').find().toArray()),
      social_comments: clean(await this.mongo.collection<SocialComment>('social_comments').find().toArray()),
      social_likes: clean(await this.mongo.collection<SocialLike>('social_likes').find().toArray()) };
  }
  clearSqlite() { this.sql.exec('DELETE FROM social_comments; DELETE FROM social_likes; DELETE FROM social_posts;'); }
  async clear() {
    if (this.type === 'sqlite') { this.clearSqlite();return; }
    for (const name of ['social_posts', 'social_comments', 'social_likes']) await this.mongo.collection(name).deleteMany({});
  }
  importSqliteData(data: { social_posts?: SocialPost[]; social_comments?: SocialComment[]; social_likes?: SocialLike[] }) {
    const posts = data.social_posts || [], comments = data.social_comments || [], likes = data.social_likes || [];
    this.sql.transaction(() => {
        for (const p of posts) this.sql.prepare('INSERT INTO social_posts (id,user_id,filename,width,height,text,created_at) VALUES (?,?,?,?,?,?,?)').run(p.id,p.user_id,p.filename,p.width,p.height,p.text,p.created_at);
        for (const c of comments) this.sql.prepare('INSERT INTO social_comments (id,post_id,user_id,text,created_at) VALUES (?,?,?,?,?)').run(c.id,c.post_id,c.user_id,c.text,c.created_at);
        for (const l of likes) this.sql.prepare('INSERT INTO social_likes (post_id,user_id) VALUES (?,?)').run(l.post_id,l.user_id);
      })();
  }
  async importData(data: { social_posts?: SocialPost[]; social_comments?: SocialComment[]; social_likes?: SocialLike[] }) {
    const posts = data.social_posts || [], comments = data.social_comments || [], likes = data.social_likes || [];
    if (this.type === 'sqlite') { this.importSqliteData(data);return; }
    if (posts.length) await this.mongo.collection<SocialPost>('social_posts').insertMany(posts);
    if (comments.length) await this.mongo.collection<SocialComment>('social_comments').insertMany(comments);
    if (likes.length) await this.mongo.collection<SocialLike>('social_likes').insertMany(likes);
    for (const [name, rows] of [['social_posts', posts], ['social_comments', comments]] as const) {
      await this.mongo.collection<{ _id: string; seq: number }>('counters').updateOne({ _id: name }, { $set: { seq: rows.reduce((max, row) => Math.max(max, row.id), 0) } }, { upsert: true });
    }
  }
}
