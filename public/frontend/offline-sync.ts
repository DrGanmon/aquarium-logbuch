import { synchronizeCatalogs } from './offline-catalogs';
import { watch } from 'vue';
import { api, ApiError } from './api';
import { session, t, language } from './state';
import { offlineState, pendingFor, storePending, type PendingMeasurement, type MaintenanceBody, type PendingEntry } from './offline-store';

export async function refreshPending() {
  const owner = Number(session.user?.id);
  const pending = owner ? await pendingFor(owner) : [];
  if (Number(session.user?.id) === owner || (!session.user && !owner)) offlineState.pending = pending;
}
export async function enqueueMeasurement(aquarium: string, body: Omit<PendingMeasurement['body'], 'operation_id' | 'operation_user_id'>) {
  return enqueueEntry(aquarium, body, 'measurement');
}
export async function enqueueMaintenance(aquarium: string, body: Omit<MaintenanceBody, 'operation_id' | 'operation_user_id'>) {
  return enqueueEntry(aquarium, body, 'maintenance');
}
async function enqueueEntry(aquarium: string, body: Omit<PendingMeasurement['body'], 'operation_id' | 'operation_user_id'> | Omit<MaintenanceBody, 'operation_id' | 'operation_user_id'>, kind: 'measurement' | 'maintenance') {
  const owner = Number(session.user?.id);
  if (!owner) throw new Error(t('offline.signIn'));
  const id = crypto.randomUUID();
  await storePending({ id, owner, aquarium, kind, body: { ...body, operation_id: id, operation_user_id: owner } } as PendingEntry);
  await refreshPending();
  void navigator.storage?.persist?.().catch(() => {});
  void synchronize();
}
export async function synchronize() {
  const owner = Number(session.user?.id);
  if (!owner || offlineState.syncing) return;
  offlineState.syncing = true;
  offlineState.error = '';
  let changed = false;
  let synchronized = false;
  try {
    // Check a fresh session; cached identity is never sufficient to upload data.
    const response = await fetch('api/me', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ApiError(response.status === 401 ? t('offline.signIn') : `HTTP ${response.status}`, response.status);
    const user = await response.json() as { id: number };
    if (user.id !== owner) throw new Error(t('offline.accountChanged'));
    offlineState.offline = false;
    for (const item of await pendingFor(owner)) {
      if (Number(session.user?.id) !== owner) break;
      try {
        await api(`/aquariums/${item.aquarium}/${item.kind === 'maintenance' ? 'maintenance' : 'measurements'}`, { method: 'POST', body: item.body, signal: AbortSignal.timeout(15000) });
        await storePending(item, true);
        changed = true;
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        item.error = error.message;
        await storePending(item);
        if (error.status === 401 || error.status === 428 || error.status >= 500) throw error;
      }
    }
    synchronized = true;
  } catch (error) {
    if (error instanceof TypeError) offlineState.offline = true;
    else offlineState.error = error instanceof Error ? error.message : String(error);
  } finally {
    await refreshPending().catch(() => {});
    offlineState.syncing = false;
    if ((changed || synchronized) && Number(session.user?.id) === owner) {
      window.dispatchEvent(new Event('aquarium-synchronized'));
      if (!offlineState.pending.length) void synchronizeCatalogs(owner, language.value);
    }
  }
}
let started = false;
export function startOfflineSync() {
  if (started) return;
  started = true;
  watch(() => `${session.user?.id}:${language.value}`, () => { void refreshPending().catch(() => {}); void synchronize(); }, { immediate: true });
  window.addEventListener('online', () => { void synchronize(); });
  window.addEventListener('offline', () => { offlineState.offline = true; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void synchronize(); });
  setInterval(() => { if (document.visibilityState === 'visible') void synchronize(); }, 30000);
}
