import type { SqliteConnection, MongoConnection } from '../types/database-driver';
import type { LightingInput, LightingRecord } from '../shared/lighting';

/** Lighting schedule per aquarium; absent until the user saves one. */
export class LightingRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection) {}
  private get sql() { return this.raw as SqliteConnection; }
  private get mongo() { return this.raw as MongoConnection; }
  private present(row: LightingRecord): LightingRecord {
    const { aquarium_id, red, green, blue, white, start_time, end_time, sunrise_minutes, sunset_minutes, note, updated_at } = row;
    return { aquarium_id, red, green, blue, white, start_time, end_time, sunrise_minutes, sunset_minutes, note: note ?? null, updated_at };
  }
  async find(aquarium_id: number): Promise<LightingRecord | null> {
    const row = this.type === 'sqlite' ? this.sql.prepare<LightingRecord>('SELECT * FROM aquarium_lighting WHERE aquarium_id = ?').get(aquarium_id)
      : await this.mongo.collection<LightingRecord>('aquarium_lighting').findOne({ aquarium_id }, { projection: { _id: 0 } });
    return row ? this.present(row) : null;
  }
  async set(aquarium_id: number, input: LightingInput): Promise<LightingRecord> {
    const record = { aquarium_id, ...input, updated_at: new Date().toISOString() };
    if (this.type === 'sqlite') {
      this.sql.prepare(`INSERT INTO aquarium_lighting (aquarium_id, red, green, blue, white, start_time, end_time, sunrise_minutes, sunset_minutes, note, updated_at)
        VALUES (@aquarium_id, @red, @green, @blue, @white, @start_time, @end_time, @sunrise_minutes, @sunset_minutes, @note, @updated_at)
        ON CONFLICT(aquarium_id) DO UPDATE SET red = excluded.red, green = excluded.green, blue = excluded.blue, white = excluded.white, start_time = excluded.start_time,
        end_time = excluded.end_time, sunrise_minutes = excluded.sunrise_minutes, sunset_minutes = excluded.sunset_minutes, note = excluded.note, updated_at = excluded.updated_at`).run(record);
    } else {
      const collection = this.mongo.collection('aquarium_lighting');
      try { await collection.updateOne({ aquarium_id }, { $set: record }, { upsert: true }); }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
        await collection.updateOne({ aquarium_id }, { $set: record });
      }
    }
    return record;
  }
  async delete(aquarium_id: number): Promise<boolean> {
    if (this.type === 'sqlite') return this.sql.prepare('DELETE FROM aquarium_lighting WHERE aquarium_id = ?').run(aquarium_id).changes > 0;
    return (await this.mongo.collection('aquarium_lighting').deleteOne({ aquarium_id })).deletedCount > 0;
  }
}
