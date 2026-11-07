import type { SqliteConnection, MongoConnection } from '../types/database-driver';
import type { CareTaskInput, CareTaskRecord } from '../shared/care-tasks';

type Row = Omit<CareTaskRecord, 'is_active'> & { is_active: number | boolean };
/** Recurring care tasks of an aquarium (water changes, filter care, pruning …). */
export class CareTaskRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection,
    private readonly sequence?: (name: string) => Promise<number>) {}
  private get sql() { return this.raw as SqliteConnection; }
  private get mongo() { return this.raw as MongoConnection; }
  private present(row: Row): CareTaskRecord {
    return { id: row.id, aquarium_id: row.aquarium_id, type: row.type, title: row.title ?? null, note: row.note ?? null, interval: row.interval, unit: row.unit,
      start_date: row.start_date, time_of_day: row.time_of_day ?? null, is_active: Boolean(row.is_active), created_at: row.created_at };
  }
  async listForAquarium(aquarium_id: number): Promise<CareTaskRecord[]> {
    const rows = this.type === 'sqlite'
      ? this.sql.prepare<Row>('SELECT * FROM care_tasks WHERE aquarium_id = ? ORDER BY id ASC').all(aquarium_id)
      : await this.mongo.collection<Row>('care_tasks').find({ aquarium_id }, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
    return rows.map(row => this.present(row));
  }
  async findById(id: number): Promise<CareTaskRecord | null> {
    const row = this.type === 'sqlite' ? this.sql.prepare<Row>('SELECT * FROM care_tasks WHERE id = ?').get(id)
      : await this.mongo.collection<Row>('care_tasks').findOne({ id }, { projection: { _id: 0 } });
    return row ? this.present(row) : null;
  }
  async count(aquarium_id: number): Promise<number> {
    if (this.type === 'sqlite') return Number(this.sql.prepare<{ n: number }>('SELECT COUNT(*) AS n FROM care_tasks WHERE aquarium_id = ?').get(aquarium_id)?.n || 0);
    return this.mongo.collection('care_tasks').countDocuments({ aquarium_id });
  }
  async create(aquarium_id: number, input: CareTaskInput): Promise<CareTaskRecord> {
    const created_at = new Date().toISOString();
    if (this.type === 'sqlite') {
      const info = this.sql.prepare('INSERT INTO care_tasks (aquarium_id, type, title, note, interval, unit, start_date, time_of_day, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(aquarium_id, input.type, input.title, input.note, input.interval, input.unit, input.start_date, input.time_of_day, input.is_active ? 1 : 0, created_at);
      return this.present({ ...input, id: Number(info.lastInsertRowid), aquarium_id, created_at });
    }
    const id = await this.sequence!('care_tasks');
    await this.mongo.collection('care_tasks').insertOne({ id, aquarium_id, ...input, created_at });
    return this.present({ ...input, id, aquarium_id, created_at });
  }
  async update(id: number, aquarium_id: number, input: CareTaskInput): Promise<CareTaskRecord | null> {
    if (this.type === 'sqlite') {
      const result = this.sql.prepare('UPDATE care_tasks SET type = ?, title = ?, note = ?, interval = ?, unit = ?, start_date = ?, time_of_day = ?, is_active = ? WHERE id = ? AND aquarium_id = ?')
        .run(input.type, input.title, input.note, input.interval, input.unit, input.start_date, input.time_of_day, input.is_active ? 1 : 0, id, aquarium_id);
      if (!result.changes) return null;
    } else if (!(await this.mongo.collection('care_tasks').updateOne({ id, aquarium_id }, { $set: { ...input } })).matchedCount) return null;
    return this.findById(id);
  }
  async delete(id: number, aquarium_id: number): Promise<boolean> {
    if (this.type === 'sqlite') return this.sql.prepare('DELETE FROM care_tasks WHERE id = ? AND aquarium_id = ?').run(id, aquarium_id).changes > 0;
    return (await this.mongo.collection('care_tasks').deleteOne({ id, aquarium_id })).deletedCount > 0;
  }
}
