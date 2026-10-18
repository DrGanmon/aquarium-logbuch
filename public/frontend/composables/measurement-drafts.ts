import { reactive, watch, nextTick } from "vue";
import { session, language, errorMessage } from "../state";
import { activeOwner, pendingFor } from "../offline-store";
import { localWorkspace, workspaceFor, enqueueWorkspace, synchronizeWorkspace } from "../offline-workspace";
import type { MeasurementDraftData } from "../../../src/shared/measurement-draft";

export interface MeasurementDraft extends MeasurementDraftData {
  aquariumId: string;
  aquariumName: string;
  completed: Record<string, number>;
}
export const measurementDrafts = reactive<Record<string, MeasurementDraft>>({});
export const draftSyncState = reactive({ applying: false, ready: false, saving: 0, error: "" });
const pathFor = (id: string) => `/aquariums/${id}/measurement-draft`;
const bodies = () => Object.fromEntries(Object.entries(measurementDrafts).map(([id, draft]) => [id, JSON.stringify({
  draftId: draft.draftId, when: draft.when, timeZoneOffset: draft.timeZoneOffset, note: draft.note, values: draft.values, suite: draft.suite, selected: draft.selected, timers: draft.timers,
})]));
const requested = new Map<string, string>(), dirty = new Set<string>(), bases = new Map<string, string>();
let writes: Promise<void> = Promise.resolve();
let generation = 0;
function apply(work: () => void) {
  draftSyncState.applying = true;
  try { work(); } finally { draftSyncState.applying = false; }
}
function queue(id: string, body: string) {
  const owner = Number(session.user?.id), lang = language.value, epoch = generation, base = bases.get(id) || 'missing';
  if (!owner || requested.get(id) === body) return;
  dirty.add(id);requested.set(id, body);draftSyncState.saving++;
  writes = writes.then(async () => {
    // Capture owner before awaiting so account changes cannot redirect queued writes.
    if (epoch !== generation) return;
    if (await activeOwner() !== owner) {
      session.user = null;session.config = null;
      throw new Error('Das Konto wurde gewechselt.');
    }
    const result = await enqueueWorkspace(owner, lang, pathFor(id), 'PUT', JSON.parse(body), bases.get(id) || base);
    if (!result) throw new Error('Der lokale Aquariumstand ist noch nicht verfügbar.');
    if (epoch === generation) bases.set(id, 'after:' + result.operationId);
    if (epoch === generation && bodies()[id] === body) {
      dirty.delete(id);
      if (!dirty.size) draftSyncState.error = '';
    }
    window.dispatchEvent(new Event('aquarium-outbox-changed'));
  }).catch(error => {
    if (epoch === generation) { requested.delete(id);draftSyncState.error = errorMessage(error); }
  }).finally(() => {
    draftSyncState.saving--;
  });
}
watch(bodies, next => {
  if (draftSyncState.applying || !draftSyncState.ready) return;
  for (const [id, body] of Object.entries(next)) queue(id, body);
}, { flush: 'post' });

export async function loadMeasurementDrafts() {
  const owner = Number(session.user?.id), epoch = generation, lang = language.value;
  if (!owner) return;
  await writes;
  const snapshot = await localWorkspace(owner, lang);
  if (!snapshot || epoch !== generation) return;
  if (await activeOwner() !== owner) {
    if (epoch === generation) { session.user = null;session.config = null; }
    return;
  }
  const pending = await pendingFor(owner);
  if (epoch !== generation) return;
  apply(() => {
    const keep = new Set<string>();
    for (const aquarium of snapshot.responses['/aquariums'] || []) {
      const id = String(aquarium.id), path = pathFor(id), body = snapshot.responses[path];
      if (dirty.has(id)) { keep.add(id);continue; }
      const prior = pending.filter(item => item.kind === 'workspace' && (item.path === path || item.path === path + '/complete')).at(-1);
      bases.set(id, prior ? 'after:' + prior.id : snapshot.versions[path] || 'missing');
      if (!body) continue;
      keep.add(id);
      const current = measurementDrafts[id];
      const completed = Object.fromEntries(Object.entries(current?.completed || {}).filter(([key, end]) => body.timers[key] === end));
      const next = { ...body, aquariumId: id, aquariumName: aquarium.name, completed };
      if (current) Object.assign(current, next);else measurementDrafts[id] = next;
    }
    for (const id of Object.keys(measurementDrafts)) if (!keep.has(id) && !dirty.has(id)) delete measurementDrafts[id];
    for (const [id, body] of Object.entries(bodies())) if (!dirty.has(id)) requested.set(id, body);
    draftSyncState.ready = true;
  });
}
export async function ensureMeasurementDrafts() {
  const owner = Number(session.user?.id);
  if (!owner) throw new Error('Bitte anmelden.');
  if (!await workspaceFor(owner, language.value)) await synchronizeWorkspace(owner, language.value);
  if (Number(session.user?.id) !== owner || !await workspaceFor(owner, language.value)) throw new Error('Bitte die Aquariendaten zuerst online synchronisieren.');
  await loadMeasurementDrafts();
}
export async function flushMeasurementDrafts() {
  await nextTick();
  await writes;
  draftSyncState.error = '';
  for (const [id, body] of Object.entries(bodies())) if (dirty.has(id)) { requested.delete(id);queue(id, body); }
  await writes;
  if (dirty.size) throw new Error(draftSyncState.error || 'Testentwurf konnte nicht lokal gespeichert werden.');
}
export async function closeMeasurementDraft(id: string, measurement?: Record<string, unknown>) {
  await flushMeasurementDrafts();
  const owner = Number(session.user?.id);
  if (!owner || await activeOwner() !== owner) throw new Error('Das Konto wurde gewechselt.');
  const result = await enqueueWorkspace(owner, language.value, pathFor(id) + (measurement ? '/complete' : ''), measurement ? 'POST' : 'DELETE', measurement ? { ...measurement, draftId: measurementDrafts[id]?.draftId } : {}, bases.get(id) || 'missing');
  if (!result) throw new Error('Der lokale Aquariumstand fehlt.');
  apply(() => { delete measurementDrafts[id];requested.delete(id);dirty.delete(id); });
  window.dispatchEvent(new Event('aquarium-outbox-changed'));
}
watch(() => session.user?.id, () => {
  generation++;requested.clear();dirty.clear();bases.clear();
  apply(() => { for (const id of Object.keys(measurementDrafts)) delete measurementDrafts[id]; });
  draftSyncState.ready = false;draftSyncState.error = '';
  const epoch = generation;
  if (session.user) void ensureMeasurementDrafts().catch(error => { if (epoch === generation) draftSyncState.error = errorMessage(error); });
}, { flush: 'sync', immediate: true });
window.addEventListener('aquarium-synchronized', () => { void loadMeasurementDrafts().catch(error => { draftSyncState.error = errorMessage(error); }); });
window.addEventListener('beforeunload', event => {
  if (!draftSyncState.saving && !dirty.size) return;
  event.preventDefault();event.returnValue = '';
});
