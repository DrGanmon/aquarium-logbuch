import type { SqliteConnection, MongoConnection } from '../types/database-driver';

export interface PlantImageRecord { id: number; aquarium_id: number; plant_id: string; filename: string; caption: string | null; created_at: string }
export type PlantImage = PlantImageRecord & { image_url: string };

/** Photos of an aquarium's plants. Files live in the shared upload directory; callers remove them. */
export class PlantImageRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection,
    private readonly sequence?: (name: string) => Promise<number>) {}
  private get sql() { return this.raw as SqliteConnection; }
  private get mongo() { return this.raw as MongoConnection; }
  private present(row: PlantImageRecord): PlantImage {
    const { id, aquarium_id, plant_id, filename, caption, created_at } = row;
    return { id, aquarium_id, plant_id, filename, caption: caption || null, created_at, image_url: `api/aquariums/${aquarium_id}/plant-images/${id}` };
  }
  async listForAquarium(aquarium_id: number): Promise<PlantImage[]> {
    const rows = this.type === 'sqlite'
      ? this.sql.prepare<PlantImageRecord>('SELECT * FROM aquarium_plant_images WHERE aquarium_id = ? ORDER BY plant_id ASC, id ASC').all(aquarium_id)
      : await this.mongo.collection<PlantImageRecord>('aquarium_plant_images').find({ aquarium_id }, { projection: { _id: 0 } }).sort({ plant_id: 1, id: 1 }).toArray();
    return rows.map(row => this.present(row));
  }
  async findById(id: number): Promise<PlantImage | null> {
    const row = this.type === 'sqlite'
      ? this.sql.prepare<PlantImageRecord>('SELECT * FROM aquarium_plant_images WHERE id = ?').get(id)
      : await this.mongo.collection<PlantImageRecord>('aquarium_plant_images').findOne({ id }, { projection: { _id: 0 } });
    return row ? this.present(row) : null;
  }
  async create(input: { aquarium_id: number; plant_id: string; filename: string; caption: string | null }): Promise<PlantImage> {
    const created_at = new Date().toISOString();
    if (this.type === 'sqlite') {
      const info = this.sql.prepare('INSERT INTO aquarium_plant_images (aquarium_id, plant_id, filename, caption, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(input.aquarium_id, input.plant_id, input.filename, input.caption, created_at);
      return this.present({ ...input, id: Number(info.lastInsertRowid), created_at });
    }
    const id = await this.sequence!('aquarium_plant_images');
    await this.mongo.collection('aquarium_plant_images').insertOne({ id, ...input, created_at });
    return this.present({ ...input, id, created_at });
  }
  async updateCaption(id: number, aquarium_id: number, caption: string | null): Promise<boolean> {
    if (this.type === 'sqlite') return this.sql.prepare('UPDATE aquarium_plant_images SET caption = ? WHERE id = ? AND aquarium_id = ?').run(caption, id, aquarium_id).changes > 0;
    return (await this.mongo.collection('aquarium_plant_images').updateOne({ id, aquarium_id }, { $set: { caption } })).matchedCount > 0;
  }
  /** Removes one photo and returns its filename, or null when it does not belong to the aquarium. */
  async delete(id: number, aquarium_id: number): Promise<string | null> {
    const row = await this.findById(id);
    if (!row || row.aquarium_id !== aquarium_id) return null;
    if (this.type === 'sqlite') this.sql.prepare('DELETE FROM aquarium_plant_images WHERE id = ?').run(id);
    else await this.mongo.collection('aquarium_plant_images').deleteOne({ id });
    return row.filename;
  }
  /** Removes all photos of one plant entry (or the whole aquarium) and returns their filenames. */
  async deleteFor(aquarium_id: number, plant_id?: string): Promise<string[]> {
    const rows = (await this.listForAquarium(aquarium_id)).filter(row => plant_id === undefined || row.plant_id === plant_id);
    if (this.type === 'sqlite') {
      if (plant_id === undefined) this.sql.prepare('DELETE FROM aquarium_plant_images WHERE aquarium_id = ?').run(aquarium_id);
      else this.sql.prepare('DELETE FROM aquarium_plant_images WHERE aquarium_id = ? AND plant_id = ?').run(aquarium_id, plant_id);
    } else await this.mongo.collection('aquarium_plant_images').deleteMany(plant_id === undefined ? { aquarium_id } : { aquarium_id, plant_id });
    return rows.map(row => row.filename);
  }
}
