import type { SqliteConnection, MongoConnection } from '../types/database-driver';

export interface CalDavCredential { user_id: number; password_hash: string; password_encrypted: string; created_at: string }
/** One CalDAV password per user; only a hash (for checks) and an encrypted copy (for display) are stored. */
export class CalDavRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection) {}
  private get sql() { return this.raw as SqliteConnection; }
  private get mongo() { return this.raw as MongoConnection; }
  async find(user_id: number): Promise<CalDavCredential | null> {
    if (this.type === 'sqlite') return this.sql.prepare<CalDavCredential>('SELECT * FROM caldav_credentials WHERE user_id = ?').get(user_id) || null;
    return this.mongo.collection<CalDavCredential>('caldav_credentials').findOne({ user_id }, { projection: { _id: 0 } });
  }
  async set(credential: CalDavCredential) {
    if (this.type === 'sqlite') {
      this.sql.prepare('INSERT INTO caldav_credentials (user_id, password_hash, password_encrypted, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, password_encrypted = excluded.password_encrypted, created_at = excluded.created_at')
        .run(credential.user_id, credential.password_hash, credential.password_encrypted, credential.created_at);
    } else await this.mongo.collection('caldav_credentials').updateOne({ user_id: credential.user_id }, { $set: credential }, { upsert: true });
  }
  async delete(user_id: number) {
    if (this.type === 'sqlite') this.sql.prepare('DELETE FROM caldav_credentials WHERE user_id = ?').run(user_id);
    else await this.mongo.collection('caldav_credentials').deleteOne({ user_id });
  }
  /** Restores replace all users; credentials of previous user IDs must never survive. */
  async clear() {
    if (this.type === 'sqlite') this.sql.exec('DELETE FROM caldav_credentials');
    else await this.mongo.collection('caldav_credentials').deleteMany({});
  }
}
