import { randomUUID } from 'node:crypto';

const STATE_ID = 'backup-restore';
const REQUEST_LEASE_TTL_MS = 2 * 60 * 1000;
const MAINTENANCE_LEASE_TTL_MS = 10 * 60 * 1000;
const RENEW_INTERVAL_MS = 30 * 1000;
const WAIT_TIMEOUT_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 50;
const LEASE_PRUNE_INTERVAL_MS = 60 * 1000;
const initializedDatabases = new WeakSet<object>();
let lastLeasePrune = 0;

interface Lease { release(): Promise<void>; abandon?(): void }
interface State { mode?: string; owner?: string; expiresAt?: number }

function getRawDb(): any {
  const adapter = require('../db');
  const raw = adapter.getRawDb();
  if (raw) return raw;
  throw new Error('Datenbank ist für die Wartungssperre nicht initialisiert.');
}

function isMongo(raw: any): boolean { return typeof raw.collection === 'function'; }

function ensureSqliteState(raw: any): void {
  raw.exec(`CREATE TABLE IF NOT EXISTS app_maintenance_state (
    id TEXT PRIMARY KEY, mode TEXT NOT NULL, owner TEXT, expires_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS app_maintenance_leases (
    id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO app_maintenance_state (id, mode, owner, expires_at) VALUES ('${STATE_ID}', 'open', NULL, 0);`);
}

async function initialize(raw: any): Promise<void> {
  if (initializedDatabases.has(raw)) return;
  if (isMongo(raw)) {
    try {
      await raw.collection('app_maintenance_state').updateOne(
        { _id: STATE_ID },
        { $setOnInsert: { mode: 'open', owner: null, expiresAt: 0 } },
        { upsert: true },
      );
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  } else ensureSqliteState(raw);
  initializedDatabases.add(raw);
}

async function readState(raw: any): Promise<State | undefined> {
  if (isMongo(raw)) return raw.collection('app_maintenance_state').findOne({ _id: STATE_ID });
  const row = raw.prepare('SELECT mode, owner, expires_at AS expiresAt FROM app_maintenance_state WHERE id = ?').get(STATE_ID);
  return row || undefined;
}

async function openExpiredState(raw: any, now: number): Promise<void> {
  if (isMongo(raw)) {
    await raw.collection('app_maintenance_state').updateOne(
      { _id: STATE_ID, mode: 'maintenance', expiresAt: { $lte: now } },
      { $set: { mode: 'open', owner: null, expiresAt: 0 } },
    );
  } else {
    raw.prepare("UPDATE app_maintenance_state SET mode = 'open', owner = NULL, expires_at = 0 WHERE id = ? AND mode = 'maintenance' AND expires_at <= ?").run(STATE_ID, now);
  }
}

async function createRequestLease(raw: any, id: string, expiresAt: number): Promise<void> {
  if (isMongo(raw)) {
    await raw.collection('app_maintenance_leases').insertOne({ _id: id, expiresAt });
  } else {
    raw.prepare('INSERT INTO app_maintenance_leases (id, expires_at) VALUES (?, ?)').run(id, expiresAt);
  }
}

async function renewRequestLease(raw: any, id: string): Promise<boolean> {
  const expiresAt = Date.now() + REQUEST_LEASE_TTL_MS;
  if (isMongo(raw)) {
    const result = await raw.collection('app_maintenance_leases').updateOne({ _id: id }, { $set: { expiresAt } });
    return result.matchedCount === 1;
  }
  return raw.prepare('UPDATE app_maintenance_leases SET expires_at = ? WHERE id = ?').run(expiresAt, id).changes === 1;
}

async function deleteRequestLease(raw: any, id: string): Promise<void> {
  if (isMongo(raw)) await raw.collection('app_maintenance_leases').deleteOne({ _id: id });
  else raw.prepare('DELETE FROM app_maintenance_leases WHERE id = ?').run(id);
}

async function activeRequestCount(raw: any, now: number): Promise<number> {
  if (isMongo(raw)) {
    const leases = raw.collection('app_maintenance_leases');
    await leases.deleteMany({ expiresAt: { $lte: now } });
    return leases.countDocuments({ expiresAt: { $gt: now } });
  }
  raw.prepare('DELETE FROM app_maintenance_leases WHERE expires_at <= ?').run(now);
  return Number(raw.prepare('SELECT COUNT(*) AS count FROM app_maintenance_leases WHERE expires_at > ?').get(now).count);
}

async function pruneExpiredRequestLeases(raw: any, now: number): Promise<void> {
  if (now - lastLeasePrune < LEASE_PRUNE_INTERVAL_MS) return;
  if (isMongo(raw)) await raw.collection('app_maintenance_leases').deleteMany({ expiresAt: { $lte: now } });
  else raw.prepare('DELETE FROM app_maintenance_leases WHERE expires_at <= ?').run(now);
  lastLeasePrune = now;
}

function requestLeaseHandle(raw: any, id: string): Lease {
  let released = false;
  const timer = setInterval(() => { void renewRequestLease(raw, id).catch(() => {}); }, RENEW_INTERVAL_MS);
  timer.unref?.();
  return {
    async release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      await deleteRequestLease(raw, id);
    },
    abandon() {
      clearInterval(timer);
    },
  };
}

export async function acquireRequestLease(): Promise<Lease | null> {
  const raw = getRawDb();
  await initialize(raw);
  const now = Date.now();
  await pruneExpiredRequestLeases(raw, now);
  await openExpiredState(raw, now);
  const state = await readState(raw);
  if (!state || state.mode !== 'open') return null;

  const id = randomUUID();
  await createRequestLease(raw, id, now + REQUEST_LEASE_TTL_MS);
  // Recheck after insertion so a request racing the maintenance switch never enters a route.
  await openExpiredState(raw, Date.now());
  const confirmed = await readState(raw);
  if (!confirmed || confirmed.mode !== 'open') {
    await deleteRequestLease(raw, id);
    return null;
  }
  return requestLeaseHandle(raw, id);
}

async function acquireMaintenanceState(raw: any, owner: string, expiresAt: number, now: number): Promise<boolean> {
  if (isMongo(raw)) {
    const result = await raw.collection('app_maintenance_state').updateOne(
      { _id: STATE_ID, $or: [{ mode: 'open' }, { mode: 'maintenance', expiresAt: { $lte: now } }] },
      { $set: { mode: 'maintenance', owner, expiresAt } },
    );
    return result.matchedCount === 1;
  }
  return raw.prepare("UPDATE app_maintenance_state SET mode = 'maintenance', owner = ?, expires_at = ? WHERE id = ? AND (mode = 'open' OR (mode = 'maintenance' AND expires_at <= ?))")
    .run(owner, expiresAt, STATE_ID, now).changes === 1;
}

async function renewMaintenanceState(raw: any, owner: string): Promise<boolean> {
  const expiresAt = Date.now() + MAINTENANCE_LEASE_TTL_MS;
  if (isMongo(raw)) {
    const result = await raw.collection('app_maintenance_state').updateOne(
      { _id: STATE_ID, mode: 'maintenance', owner }, { $set: { expiresAt } },
    );
    return result.matchedCount === 1;
  }
  return raw.prepare("UPDATE app_maintenance_state SET expires_at = ? WHERE id = ? AND mode = 'maintenance' AND owner = ?")
    .run(expiresAt, STATE_ID, owner).changes === 1;
}

async function releaseMaintenanceState(raw: any, owner: string): Promise<void> {
  if (isMongo(raw)) {
    await raw.collection('app_maintenance_state').updateOne(
      { _id: STATE_ID, mode: 'maintenance', owner }, { $set: { mode: 'open', owner: null, expiresAt: 0 } },
    );
  } else {
    raw.prepare("UPDATE app_maintenance_state SET mode = 'open', owner = NULL, expires_at = 0 WHERE id = ? AND mode = 'maintenance' AND owner = ?").run(STATE_ID, owner);
  }
}

export async function acquireMaintenanceLease(operation: 'backup' | 'restore'): Promise<Lease> {
  const raw = getRawDb();
  await initialize(raw);
  const owner = `${operation}:${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!(await acquireMaintenanceState(raw, owner, Date.now() + MAINTENANCE_LEASE_TTL_MS, Date.now()))) {
    if (Date.now() >= deadline) throw new Error('Eine andere Backup-/Restore-Wartung ist aktiv.');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  let lost = false;
  const timer = setInterval(() => {
    void renewMaintenanceState(raw, owner).then(renewed => { if (!renewed) lost = true; }).catch(() => { lost = true; });
  }, RENEW_INTERVAL_MS);
  timer.unref?.();
  try {
    while (await activeRequestCount(raw, Date.now())) {
      if (lost) throw new Error('Die gemeinsame Wartungssperre ging verloren.');
      if (Date.now() >= deadline) throw new Error('Laufende Anfragen konnten vor der Wartung nicht beendet werden.');
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return {
      async release() {
        clearInterval(timer);
        await releaseMaintenanceState(raw, owner);
      },
    };
  } catch (error) {
    clearInterval(timer);
    await releaseMaintenanceState(raw, owner);
    throw error;
  }
}

export function isBackupMaintenanceRequest(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const normalizedPath = pathname.split('?')[0].replace(/\/+$/, '').toLowerCase();
  return normalizedPath === '/api/admin/backups/create'
    || normalizedPath === '/api/admin/backups/restore-upload'
    || /^\/api\/admin\/backups\/[^/]+\/restore$/.test(normalizedPath);
}