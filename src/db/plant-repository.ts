import type { SqliteConnection, MongoConnection } from '../types/database-driver';
export interface AquariumPlantRecord { aquarium_id: number; plant_id: string; count: number }
export class PlantRepository {
  constructor(private readonly type: 'sqlite' | 'mongodb', private readonly raw: SqliteConnection | MongoConnection) {}
  async listForAquarium(aquarium_id: number): Promise<AquariumPlantRecord[]> {
    if (this.type === 'sqlite') return (this.raw as SqliteConnection).prepare<AquariumPlantRecord>('SELECT * FROM aquarium_plants WHERE aquarium_id = ? ORDER BY plant_id').all(aquarium_id);
    return (this.raw as MongoConnection).collection<AquariumPlantRecord>('aquarium_plants').find({ aquarium_id }, { projection: { _id: 0 } }).sort({ plant_id: 1 }).toArray();
  }
  async set(aquarium_id: number, plant_id: string, count: number) {
    if (this.type === 'sqlite') {
      (this.raw as SqliteConnection).prepare('INSERT INTO aquarium_plants (aquarium_id, plant_id, count) VALUES (?, ?, ?) ON CONFLICT(aquarium_id, plant_id) DO UPDATE SET count = excluded.count').run(aquarium_id, plant_id, count);
    } else {
      const collection = (this.raw as MongoConnection).collection('aquarium_plants');
      try { await collection.updateOne({ aquarium_id, plant_id }, { $set: { count } }, { upsert: true }); }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
        await collection.updateOne({ aquarium_id, plant_id }, { $set: { count } });
      }
    }
  }
  async delete(aquarium_id: number, plant_id: string) {
    if (this.type === 'sqlite') (this.raw as SqliteConnection).prepare('DELETE FROM aquarium_plants WHERE aquarium_id = ? AND plant_id = ?').run(aquarium_id, plant_id);
    else await (this.raw as MongoConnection).collection('aquarium_plants').deleteOne({ aquarium_id, plant_id });
  }
}
