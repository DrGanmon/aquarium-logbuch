import type { SqliteConnection, MongoConnection } from '../../types/database-driver';
import type { UserRecord } from '../../types/domain';
import { AI_PROVIDERS, encryptPersonalAiFields } from '../../services/ai-token-crypto';

export = {
  version: 7,
  name: '007_encrypted_ai_tokens',
  upSqlite(db: SqliteConnection) {
    const columns = db.prepare('PRAGMA table_info(users)').all().map(row => row.name);
    db.transaction(() => {
      for (const provider of AI_PROVIDERS) for (const part of ['prefix', 'suffix']) {
        const field = `${provider}_api_key_${part}`;
        if (!columns.includes(field)) db.exec(`ALTER TABLE users ADD COLUMN ${field} TEXT`);
      }
      // Preflight all rows before any token is replaced.
      const rows = db.prepare<UserRecord>('SELECT * FROM users').all().map(user => encryptPersonalAiFields(user.id, user));
      for (const user of rows) for (const provider of AI_PROVIDERS) {
        db.prepare(`UPDATE users SET ${provider}_api_key = ?, ${provider}_api_key_prefix = ?, ${provider}_api_key_suffix = ? WHERE id = ?`)
          .run(user[`${provider}_api_key`] || null, user[`${provider}_api_key_prefix`] || null, user[`${provider}_api_key_suffix`] || null, user.id);
      }
    }).immediate();
  },
  async upMongo(db: MongoConnection) {
    const users = db.collection<UserRecord>('users');
    const rows = (await users.find().toArray()).map(user => ({ user, encrypted: encryptPersonalAiFields(user.id, user) }));
    for (const { user, encrypted } of rows) for (const provider of AI_PROVIDERS) {
      const key = `${provider}_api_key` as const;
      // Restartable and safe against a simultaneous settings change in another worker.
      await users.updateOne({ id: user.id, [key]: user[key] ?? null }, { $set: {
        [key]: encrypted[key] || null,
        [`${key}_prefix`]: encrypted[`${key}_prefix`] || null,
        [`${key}_suffix`]: encrypted[`${key}_suffix`] || null,
      } });
    }
  },
};
