import type { WorkspaceOperation, WorkspaceSnapshot } from '../../src/shared/offline-workspace';
import { reactive } from 'vue';

export interface MaintenanceBody {
  operation_id: string; operation_user_id: number;
  logged_at: string; type: string; percentage: number | null; details: string; note: string;
}
export interface PendingMeasurement {
  id: string;
  owner: number;
  aquarium: string;
  kind?: 'measurement'; // Existing outbox entries have no kind.
  body: { operation_id: string; operation_user_id: number; measured_at: string; values: Record<string, number>; selectedTests: string[]; note: string };
  error?: string;
}
export interface PendingMaintenance {
  id: string;
  owner: number;
  aquarium: string;
  kind: 'maintenance';
  body: MaintenanceBody;
  error?: string;
}
export type PendingEntry = (PendingMeasurement | PendingMaintenance | WorkspaceOperation) & { order?: number };
export const offlineState = reactive({ offline: !navigator.onLine, pending: [] as PendingEntry[], syncing: false, error: '', catalogSyncing: false, catalogError: '', workspaceSyncing: false, workspaceError: '', workspaceUpdatedAt: '', photoProgress: '' });
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`aquarium-offline:${new URL('.', document.baseURI).pathname}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('records');
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Lokale Datenbank ist blockiert.')); };
  });
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
export async function writeLocal(key: string, value: unknown) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    if (value === undefined) tx.objectStore('records').delete(key);
    else tx.objectStore('records').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export async function activeOwner() { return readLocal<number>('activeOwner'); }
export async function pendingFor(owner: number) {
  const db = await open();
  return new Promise<PendingEntry[]>((resolve, reject) => {
    const request = db.transaction('outbox').objectStore('outbox').getAll();
    request.onsuccess = () => resolve((request.result as PendingEntry[]).filter(item => item.owner === owner).sort((a, b) => (a.order || 0) - (b.order || 0)));
    request.onerror = () => reject(request.error);
  });
}
export async function storePending(item: PendingEntry, remove = false) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    if (remove) tx.objectStore('outbox').delete(item.id);
    else {
      const request = tx.objectStore('outbox').getAll();
      request.onsuccess = () => {
        const rows = request.result as PendingEntry[];
        const existing = rows.find(row => row.id === item.id);
        const order = existing?.order ?? Math.max(0, ...rows.map(row => row.order || 0)) + 1;
        tx.objectStore('outbox').put(JSON.parse(JSON.stringify({ ...item, order })));
      };
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export function cacheable(path: string) {
  return ['/me', '/config', '/aquariums', '/shares/pending'].includes(path) || /^\/aquariums\/\d+(?:\?(?:summary=true)|\/(?:measurements|logs)(?:\?.*)?)?$/.test(path);
}

/** Acknowledgment, ID mappings and local confirmed state must survive crashes together. */
export async function commitWorkspaceAck(key: string, snapshot: WorkspaceSnapshot, item: PendingEntry, delta: Record<string, number>) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['records', 'outbox'], 'readwrite');
    const records = tx.objectStore('records');
    const request = records.get(`workspace-mapping:${item.owner}`);
    request.onsuccess = () => {
      const mapping = { ...(request.result || {}), ...delta };
      records.put(mapping, `workspace-mapping:${item.owner}`);
      const keys = records.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) if (typeof key === 'string' && key.startsWith(`private-image:${item.owner}:`)) {
          const mapped = key.replace(/\/-\d+(?=\/|$)/g, part => '/' + (mapping[part.slice(1)] ?? part.slice(1)));
          if (key.endsWith(':pending')) {
            const marker = records.get(key);marker.onsuccess = () => {
              if (marker.result === item.id) { records.delete(key);records.delete(mapped); }
              else if (mapped !== key) records.put(marker.result, mapped);
            };
          } else if (mapped !== key) { const photo = records.get(key);photo.onsuccess = () => records.put(photo.result, mapped); }
        }
      };
      records.put(JSON.parse(JSON.stringify(snapshot)), key);
      tx.objectStore('outbox').delete(item.id);
    };
    tx.oncomplete = () => resolve();tx.onabort = () => reject(tx.error);tx.onerror = () => reject(tx.error);
  });
}
export async function replacePending(items: PendingEntry[], remove: string[]) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite'), store = tx.objectStore('outbox');
    for (const id of remove) store.delete(id);
    for (const item of items) store.put(JSON.parse(JSON.stringify(item)));
    tx.oncomplete = () => resolve();tx.onabort = () => reject(tx.error);tx.onerror = () => reject(tx.error);
  });
}
