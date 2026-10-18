import { randomUUID } from 'node:crypto';
import db = require('../db');
import { offlineConnection } from '../db/offline-transaction';
import type { MeasurementDraftData } from '../shared/measurement-draft';
const connection = () => offlineConnection(db.getRawDb()!, db.type) as any;
export async function measurementDraftState(owner: number, aquarium: number): Promise<{ revision: string; data: MeasurementDraftData | null } | null> {
  const raw = connection();
  const row = db.type === 'sqlite' ? raw.prepare('SELECT revision, payload FROM measurement_drafts WHERE user_id = ? AND aquarium_id = ?').get(owner, aquarium)
    : await raw.collection('measurement_drafts').findOne({ user_id: owner, aquarium_id: aquarium });
  return row ? { revision: row.revision, data: row.payload ? JSON.parse(row.payload) : null } : null;
}
export async function writeMeasurementDraft(owner: number, aquarium: number, data: MeasurementDraftData | null) {
  const raw = connection(), revision = randomUUID(), payload = data ? JSON.stringify(data) : null;
  if (db.type === 'sqlite') raw.prepare('INSERT INTO measurement_drafts (user_id, aquarium_id, revision, payload) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, aquarium_id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload').run(owner, aquarium, revision, payload);
  else await raw.collection('measurement_drafts').updateOne({ user_id: owner, aquarium_id: aquarium }, { $set: { revision, payload } }, { upsert: true });
}
