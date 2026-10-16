import { CATALOG_NAMES, CATALOG_SCHEMA, type CatalogName, type CatalogSnapshot } from '../../src/shared/offline-catalog';
import { catalogForPath } from '../../src/shared/catalog-routing';
import { activeOwner, readLocal, writeLocal, offlineState } from './offline-store';

const memory = new Map<string, CatalogSnapshot>();
const running = new Map<string, Promise<void>>();
const retryAfter = new Map<string, number>();
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;
const keyFor = (kind: CatalogName, lang: string) => `catalog:${CATALOG_SCHEMA}:${lang}:${kind}`;
function complete(snapshot: CatalogSnapshot) {
  if (!snapshot?.data) return false;
  if (snapshot.kind === 'species') return Array.isArray(snapshot.data.species) && Array.isArray(snapshot.data.categories);
  if (snapshot.kind === 'plants') return Array.isArray(snapshot.data.plants) && snapshot.data.fieldDefinitions && snapshot.data.sources && snapshot.data.searchText;
  return snapshot.data.diagnosis?.fresh && snapshot.data.diagnosis?.salt && snapshot.data.catalog && Array.isArray(snapshot.data.catalog.diseases) && Array.isArray(snapshot.data.catalog.species)
    && Array.isArray(snapshot.data.diseases) && snapshot.data.associations?.fresh && snapshot.data.associations?.salt
    && Array.isArray(snapshot.data.medications?.items) && Array.isArray(snapshot.data.medicationDetails);
}
async function snapshotFor(kind: CatalogName, lang: string) {
  const key = keyFor(kind, lang);
  let snapshot = memory.get(key);
  if (!snapshot) {
    snapshot = await readLocal<CatalogSnapshot>(key);
    if (snapshot?.schema === CATALOG_SCHEMA && snapshot.kind === kind && snapshot.language === lang && complete(snapshot)) memory.set(key, snapshot);
    else return undefined;
  }
  return snapshot;
}
export async function readOfflineCatalog(path: string, language: string, signal?: AbortSignal) {
  const kind = catalogForPath(path);
  if (!kind || signal?.aborted) return undefined;
  const lang = new URL(path, 'https://catalog.invalid').searchParams.get('lang') || language;
  if (!['de', 'en'].includes(lang)) return undefined;
  const snapshot = await snapshotFor(kind, lang);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return snapshot ? (await import('../../src/shared/offline-catalog-query')).queryCatalog(snapshot, path) : undefined;
}
/** Called only after user writes have been synchronized. Snapshot + version commit atomically. */
export async function synchronizeCatalogs(owner: number, language: string, force = false) {
  const lang = language === 'en' ? 'en' : 'de';
  const runKey = `${owner}:${lang}`;
  if (!force && (retryAfter.get(runKey) || 0) > Date.now()) return;
  if (running.has(runKey)) return running.get(runKey);
  const task = (async () => {
    offlineState.catalogError = '';
    retryAfter.delete(runKey);
    for (const kind of CATALOG_NAMES) {
      if (await activeOwner() !== owner) return;
      const key = keyFor(kind, lang);
      const previous = await snapshotFor(kind, lang);
      const checked = await readLocal<number>(`${key}:checked`);
      if (!force && previous && checked && Date.now() - checked < CHECK_INTERVAL) continue;
      offlineState.catalogSyncing = true;
      const response = await fetch(`api/catalogs/${kind}?lang=${lang}`, {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(60000),
        headers: previous ? { 'If-None-Match': `"${previous.version}"` } : {},
      });
      if (response.status !== 304 && !response.ok) throw new Error(`HTTP ${response.status}`);
      if (await activeOwner() !== owner || response.headers.get('X-Aquarium-User') !== String(owner)) return;
      if (response.status === 304 && previous) {
        await writeLocal(`${key}:checked`, Date.now());
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = await response.json() as CatalogSnapshot;
      if (!snapshot || snapshot.schema !== CATALOG_SCHEMA || snapshot.kind !== kind || snapshot.language !== lang || !/^[a-f0-9]{64}$/.test(snapshot.version) || !complete(snapshot)) throw new Error('Invalid catalog snapshot');
      await writeLocal(key, snapshot);
      memory.set(key, snapshot);
      await writeLocal(`${key}:checked`, Date.now());
      window.dispatchEvent(new CustomEvent('aquarium-catalogs-updated', { detail: { kind, language: lang } }));
    }
  })().catch(error => {
    retryAfter.set(runKey, Date.now() + 5 * 60 * 1000);
    offlineState.catalogError = error instanceof Error ? error.message : String(error);
  }).finally(() => {
    running.delete(runKey);
    offlineState.catalogSyncing = running.size > 0;
  });
  running.set(runKey, task);
  return task;
}

export async function readCatalogData(kind: CatalogName, lang: string) {
  return snapshotFor(kind, lang);
}
