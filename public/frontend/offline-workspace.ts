import { prepareCsvMeasurements } from '../../src/shared/measurement-csv';
import { activeOwner, readLocal, writeLocal, pendingFor, storePending, commitWorkspaceAck, replacePending, offlineState, type PendingEntry } from './offline-store';
import { readCatalogData } from './offline-catalogs';
import { workspaceKey, workspaceWrite, canonicalResource, type WorkspaceOperation, type WorkspaceSnapshot } from '../../src/shared/offline-workspace';
import { applyLocalOperation, deriveWorkspace, cloneWorkspace, queryWorkspace, remapOperation, remapSnapshot } from '../../src/shared/offline-workspace-model';
import { DiagnosisEngine, canonicalHealthSpeciesId } from '../../src/shared/diagnosis';
import { AppError } from '../../src/utils/app-error';

const imageKey = (owner: number, path: string) => `private-image:${owner}:${path.replace(/^\/?api\//, '').split('?')[0]}`;
export async function workspaceFor(owner: number, language: string) {
  const snapshot = await readLocal<WorkspaceSnapshot>(workspaceKey(owner, language)) || await readLocal<WorkspaceSnapshot>(workspaceKey(owner, language === 'en' ? 'de' : 'en'));
  if (snapshot) offlineState.workspaceUpdatedAt = snapshot.updatedAt;
  return snapshot;
}
async function catalogs(language: string) {
  const [species, plants, health] = await Promise.all([readCatalogData('species', language), readCatalogData('plants', language), readCatalogData('health', language)]);
  return { species: species?.kind === 'species' ? species : undefined, plants: plants?.kind === 'plants' ? plants : undefined, health: health?.kind === 'health' ? health : undefined };
}
function legacyCommand(item: PendingEntry): WorkspaceOperation {
  if (item.kind === 'workspace') return item;
  return { id: item.id, kind: 'workspace', owner: item.owner, aquarium: item.aquarium, method: 'POST', path: `/aquariums/${item.aquarium}/${item.kind === 'maintenance' ? 'maintenance' : 'measurements'}`, body: item.body,
    base: null, temporaryIds: [-parseInt(item.id.replaceAll('-', '').slice(0, 12), 16)], createdAt: item.kind === 'maintenance' ? item.body.logged_at : item.body.measured_at };
}
export async function localWorkspace(owner: number, language: string) {
  const original = await workspaceFor(owner, language);
  if (!original) return undefined;
  const snapshot = cloneWorkspace(original), definitions = await catalogs(language);
  const mapping = await readLocal<Record<string, number>>(`workspace-mapping:${owner}`) || {};
  for (const item of await pendingFor(owner)) {
    try { applyLocalOperation(snapshot, remapOperation(legacyCommand(item), mapping), definitions); }
    catch { /* Keep rejected entries reviewable without preventing reads of other data. */ }
  }
  snapshot.language = language;
  return deriveWorkspace(snapshot, definitions);
}
export async function readWorkspace(owner: number, language: string, path: string) {
  if (!/^\/(aquariums(?:\/|$)|health\/aquariums\/|me(?:\/|$)|config$|notifications(?:\?|$))/.test(path)) return undefined;
  if (path === '/me' || path === '/config' || path.startsWith('/me/test-inventory') || path.startsWith('/health/aquariums/') || path.startsWith('/aquariums') || path.startsWith('/notifications')) {
    if (/\/(shares|chat)(\/|$)/.test(path) || /\/(export|import-csv|image)(\?|$)/.test(path)) return undefined;
    const snapshot = await localWorkspace(owner, language);
    try { return snapshot ? queryWorkspace(snapshot, path) : undefined; }
    catch (error) { if (navigator.onLine && error instanceof AppError && error.status === 404) return undefined;throw error; }
  }
}
export async function enqueueWorkspace(owner: number, language: string, path: string, method: string, input: any, baseVersion?: string) {
  const body = cloneWorkspace(input || {});
  if (path === '/me' && body.email !== undefined) {
    const snapshot = await localWorkspace(owner, language);
    if (body.email === snapshot?.responses['/me']?.email) delete body.email;
  }
  if (!workspaceWrite(path, method, body)) return undefined;
  const snapshot = await localWorkspace(owner, language);
  if (!snapshot) {
    if (!navigator.onLine) throw new AppError('Bitte die App zuerst online öffnen, damit die Aquariendaten heruntergeladen werden.', 409);
    return undefined;
  }
  const entries = await pendingFor(owner), mapping = await readLocal<Record<string, number>>(`workspace-mapping:${owner}`) || {};
  const resource = canonicalResource(path), previous = entries.filter((item): item is WorkspaceOperation => item.kind === 'workspace').reverse().find(item => canonicalResource(item.path) === resource || (method === 'DELETE' && /^\/aquariums\/-?\d+$/.test(path) && item.path.startsWith(path + '/')) || (resource === '/me/test-inventory' && /\/measurements(?:\/import-csv)?$/.test(item.path)) || (item.method === 'POST' && item.temporaryIds.some(id => resource.endsWith('/' + id))));
  const id = crypto.randomUUID();
  let count = path.endsWith('/measurements/import-csv') ? prepareCsvMeasurements(body, snapshot.responses['/config'].allParameters || snapshot.rules.parameters).entries.length : 1;
  if (path.endsWith('/stock/catalog')) {
    const names: string[] = Array.isArray(body.names) ? body.names.map((name: any) => String(name).trim()).filter(Boolean) : [];
    count = names.length + (Number(body.count) > names.length ? 1 : 0);
  }
  const temporaryIds = Array.from({ length: Math.max(1, count) }, () => -parseInt(crypto.randomUUID().replaceAll('-', '').slice(0, 12), 16));
  const base = method === 'POST' && !path.endsWith('/measurement-draft/complete') && !/\/(image|avatar|dose)$/.test(path) ? null
    : baseVersion ?? (previous ? 'after:' + previous.id : snapshot.versions[(method === 'DELETE' ? 'DELETE ' : '') + resource] || snapshot.versions[resource] || 'missing');
  if (path.endsWith('/dose') && !body.logged_at) body.logged_at = new Date().toISOString();
  const command: WorkspaceOperation = { id, kind: 'workspace', owner, aquarium: path.split('/')[2] || '', method: method as WorkspaceOperation['method'], path, body, base, temporaryIds, createdAt: new Date().toISOString() };
  if (path.endsWith('/alerts/ack')) {
    command.base = null;
    const alerts = snapshot.responses[`/aquariums/${command.aquarium}`]?.alerts || [];
    body.offline_alerts = alerts.filter((alert: any) => alert.id < 0 && (!body.ids || body.ids.includes(alert.id))).map((alert: any) => ({ operation: alert.operation, param: alert.param }));
    if (body.ids) body.ids = body.ids.filter((id: number) => id > 0);
  }
  const result = applyLocalOperation(snapshot, remapOperation(command, mapping), await catalogs(language));
  if (body.image) {
    const encoded = String(body.image), match = encoded.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.*)$/s);
    if (encoded.startsWith('data:') && !match) throw new AppError('Ungültiges Bildformat.', 400);
    let decoded: string;
    try { decoded = atob(match ? match[2] : encoded); } catch { throw new AppError('Ungültige Bilddaten.', 400); }
    if (decoded.length > 5 * 1024 * 1024) throw new AppError('Das Bild darf höchstens 5 MiB groß sein.', 400);
    const blob = new Blob([Uint8Array.from(decoded, character => character.charCodeAt(0))], { type: match?.[1] || 'image/jpeg' });
    const photoPath = path === '/me/avatar' ? 'me/avatar' : path.endsWith('/images') ? path.slice(1) + '/' + temporaryIds[0] : path.endsWith('/stock') ? path.slice(1) + '/' + temporaryIds[0] + '/image' : /\/stock\/-?\d+$/.test(path) ? path.slice(1) + '/image' : path.slice(1);
    await writeLocal(imageKey(owner, photoPath), blob);
    await writeLocal(imageKey(owner, photoPath) + ':pending', command.id);
  }
  await storePending(command);
  offlineState.pending = await pendingFor(owner);
  window.dispatchEvent(new Event('aquarium-synchronized'));
  return { result, operationId: id };
}
export async function acknowledgeWorkspace(item: WorkspaceOperation, response: any, language: string) {
  const original = await workspaceFor(item.owner, language);
  if (!original) throw new AppError('Lokaler Aquariumstand fehlt.', 409);
  const currentMap = await readLocal<Record<string, number>>(`workspace-mapping:${item.owner}`) || {};
  const delta: Record<string, number> = {};
  if ((response.result?.id || response.result?.log_id) && item.temporaryIds[0]) delta[item.temporaryIds[0]] = Number(response.result.id || response.result.log_id);
  if (response.result?.entries) response.result.entries.forEach((entry: any, index: number) => { if (item.temporaryIds[index]) delta[item.temporaryIds[index]] = Number(entry.id); });
  const snapshot = cloneWorkspace(original);
  applyLocalOperation(snapshot, remapOperation(item, currentMap), await catalogs(language));
  const mapped = remapSnapshot(snapshot, { ...currentMap, ...delta });
  if (response.target) { mapped.versions[response.target] = response.version;mapped.versions['DELETE ' + response.target] = response.deleteVersion; }
  Object.assign(mapped.versions, response.versions || {});
  // Server identity/normalized profile fields override the optimistic representation.
  if (response.result?.user) mapped.responses['/me'] = response.result.user;
  await commitWorkspaceAck(workspaceKey(item.owner, mapped.language), mapped, item, delta);
  if (item.path === '/aquariums' && delta[item.temporaryIds[0]] && location.hash.startsWith(`#/a/${item.temporaryIds[0]}`)) location.hash = location.hash.replace(String(item.temporaryIds[0]), String(delta[item.temporaryIds[0]]));
  window.dispatchEvent(new Event('aquarium-synchronized'));
}
let downloading: Promise<void> | undefined;
export async function synchronizeWorkspace(owner: number, language: string) {
  if (downloading) return downloading;
  downloading = (async () => {
    offlineState.workspaceSyncing = true;offlineState.workspaceError = '';
    const previous = await workspaceFor(owner, language);
    const response = await fetch(`api/offline/state`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(60000), headers: { 'X-Language': language, ...(previous?.language === language && previous.version ? { 'If-None-Match': `"${previous.version}"` } : {}) } });
    if (!response.ok && response.status !== 304) throw new AppError(`HTTP ${response.status}`, response.status);
    if (await activeOwner() !== owner || response.headers.get('X-Aquarium-User') !== String(owner)) return;
    let snapshot = previous;
    if (response.status !== 304) {
      snapshot = await response.json() as WorkspaceSnapshot;
      if (snapshot.schema !== 1 || snapshot.owner !== owner || snapshot.language !== language || !Array.isArray(snapshot.responses?.['/aquariums'])) throw new AppError('Ungültiger Aquariumstand.', 500);
      await writeLocal(workspaceKey(owner, language), snapshot);
      window.dispatchEvent(new Event('aquarium-synchronized'));
    }
    if (!snapshot) return;
    offlineState.workspaceUpdatedAt = snapshot.updatedAt;
    const photos: { path: string; version: string }[] = [];
    for (const aquarium of snapshot.responses['/aquariums']) {
      const root = `aquariums/${aquarium.id}`;
      if (aquarium.has_image) photos.push({ path: root + '/image', version: String(aquarium.image_file || aquarium.image_url) });
      for (const image of snapshot.responses['/' + root + '/images'] || []) photos.push({ path: root + '/images/' + image.id, version: image.filename });
      for (const stock of snapshot.responses['/' + root + '/stock'] || []) if (stock.image_file) photos.push({ path: root + '/stock/' + stock.id + '/image', version: stock.image_file });
    }
    if (snapshot.responses['/me'].hasAvatar) photos.push({ path: 'me/avatar', version: snapshot.versions['/me/avatar'] });
    for (let index = 0; index < photos.length; index++) {
      if (await activeOwner() !== owner) return;
      const photo = photos[index], key = imageKey(owner, photo.path);
      if (await readLocal(key + ':version') === photo.version && await readLocal(key)) continue;
      offlineState.photoProgress = `${index + 1}/${photos.length}`;
      const image = await fetch('api/' + photo.path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!image.ok || image.headers.get('X-Aquarium-User') !== String(owner)) throw new AppError('Bild konnte nicht gespeichert werden.', image.status);
      await writeLocal(key, await image.blob());await writeLocal(key + ':version', photo.version);
    }
  })().catch(error => { offlineState.workspaceError = error instanceof Error ? error.message : String(error); }).finally(() => { downloading = undefined;offlineState.workspaceSyncing = false;offlineState.photoProgress = ''; });
  return downloading;
}
export async function localDiagnosis(owner: number, language: string, path: string, body: any) {
  const match = path.match(/^\/health\/aquariums\/(-?\d+)\/diagnosis$/);if (!match) return undefined;
  const snapshot = await localWorkspace(owner, language), health = await readCatalogData('health', language), species = await readCatalogData('species', language);
  if (!snapshot || health?.kind !== 'health' || species?.kind !== 'species') return undefined;
  const root = '/aquariums/' + match[1], aquarium = snapshot.responses[root]?.aquarium;
  const resident = snapshot.responses[`/health/aquariums/${match[1]}/residents`]?.residents.find((entry: any) => entry.stockId === body.stockId);
  if (!aquarium || !resident) throw new AppError('Bewohner nicht gefunden.', 404);
  const sp = species.data.species.find(entry => entry.id === canonicalHealthSpeciesId(resident.speciesId));
  if (!sp) throw new AppError('Art nicht im Offline-Katalog gefunden.', 400);
  const water: 'fresh' | 'salt' = aquarium.water_type === 'salt' ? 'salt' : 'fresh';
  const engine = new DiagnosisEngine(type => ({ diagnosis: health.data.diagnosis[type], diseases: { speciesIndex: health.data.associations[type] } }));
  const latest = snapshot.responses[root].latest;
  const measurements = Object.fromEntries(Object.entries(latest).map(([key, value]: [string, any]) => [key, { value: value.value, measured_at: value.measured_at }]));
  const outcome = engine.diagnose({ waterType: water, speciesId: resident.speciesId, species: sp as any, measurements }, body.answers || [], language);
  return { ...outcome, aiChat: null, aquarium: { id: aquarium.id, name: aquarium.name, waterType: water }, resident,
    measurements: Object.entries(measurements).map(([parameter, value]) => ({ parameter, ...value })) };
}
export async function discardWorkspace(item: PendingEntry) {
  const entries = await pendingFor(item.owner), remove = new Set([item.id]), temporary = new Set(item.kind === 'workspace' ? item.temporaryIds : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) if (entry.kind === 'workspace' && !remove.has(entry.id) && (entry.base?.startsWith('after:') && remove.has(entry.base.slice(6)) || entry.path.split('/').some(part => temporary.has(Number(part))))) {
      remove.add(entry.id);entry.temporaryIds.forEach(id => temporary.add(id));changed = true;
    }
  }
  await replacePending([], [...remove]);offlineState.pending = await pendingFor(item.owner);window.dispatchEvent(new Event('aquarium-synchronized'));
}
export async function rebaseWorkspace(item: WorkspaceOperation) {
  if (!item.conflict) return;
  await storePending({ ...item, base: item.conflict.version, error: undefined, conflict: undefined });offlineState.pending = await pendingFor(item.owner);
}
export async function mappingFor(owner: number) { return await readLocal<Record<string, number>>(`workspace-mapping:${owner}`) || {}; }
export { remapOperation, workspaceWrite, workspaceKey };
