<script setup lang="ts">
import { reactive } from 'vue';
import { draftField, type MeasurementDraftData } from '../../../src/shared/measurement-draft';
import { offlineState } from '../offline-store';
import { synchronizeCatalogs } from '../offline-catalogs';
import { discardWorkspace, rebaseWorkspace, resolveDraftWorkspace } from '../offline-workspace';
import { language, t, session, errorMessage } from '../state';
import { refreshPending, synchronize } from '../offline-sync';
import type { WorkspaceOperation } from '../../../src/shared/offline-workspace';
const draftChoices = reactive<Record<string, Record<string, 'local' | 'server'>>>({});
function choices(item: WorkspaceOperation) {
  const key = `${item.id}:${item.conflict?.version}`;
  return draftChoices[key] ||= {};
}
function fieldTitle(field: string) {
  const key = field.slice(field.indexOf('.') + 1);
  const name = session.config?.allParameters.find(parameter => parameter.key === key)?.name || key;
  return field.startsWith('values.') ? name : field.startsWith('timers.') ? `${t('measure.timerNotifications')} · ${name}`
    : t(({ time: 'measure.dateTimeLabel', note: 'common.notesOptional', suite: 'testSelection.title', selected: 'testSelection.title' } as Record<string, string>)[field] || 'offline.localChange');
}
function fieldValue(draft: MeasurementDraftData, field: string) {
  const value = draftField(draft, field);
  if (value == null || value === '') return t('measure.emptyDraftValue');
  if (field.startsWith('timers.')) return new Date(Number(value)).toLocaleString();
  if (field === 'time') return `${draft.when.replace('T', ' ')} (UTC${draft.timeZoneOffset <= 0 ? '+' : '-'}${Math.abs(draft.timeZoneOffset / 60)})`;
  if (field === 'selected') return draft.selected.map(reference => {
    const [suite, key] = reference.split(':');
    const method = session.config?.suites.find(item => item.id === suite);
    return `${method?.name || suite}: ${method?.tests?.find(item => item.key === key)?.name || key}`;
  }).join(', ');
  return String(value);
}
async function resolveDraft(item: WorkspaceOperation) {
  try { await resolveDraftWorkspace(item, choices(item));await synchronize(); }
  catch (error) { offlineState.error = errorMessage(error); }
}
async function retryCatalogs() { if (session.user) await synchronizeCatalogs(Number(session.user.id), language.value, true); }
async function discard(item: typeof offlineState.pending[number]) {
  if (!confirm(t('offline.discardConfirm'))) return;
  await discardWorkspace(item);await refreshPending();
}
async function rebase(item: WorkspaceOperation) {
  if (!confirm(t('offline.rebaseConfirm'))) return;
  await rebaseWorkspace(item);await synchronize();
}
function title(item: WorkspaceOperation) {
  const part = item.path.split('/')[3] || (item.path.startsWith('/me') ? 'profile' : 'aquarium');
  const labels: Record<string, string> = { 'measurement-draft': 'measure.openTests', aquarium: 'offline.aquarium', stock: 'nav.species', plants: 'nav.plants', maintenance: 'timeline.newEntryBtn', measurements: 'measure.title', images: 'detail.galleryTitle', image: 'detail.galleryTitle', fertilizers: 'fertilizers.title', 'dosing-pumps': 'fertilizers.title', alerts: 'nav.notifications', profile: 'nav.profile' };
  return t(item.method === 'DELETE' ? 'offline.deleting' : 'offline.changing') + ' · ' + t(labels[part] || 'offline.localChange');
}
function describe(body: Record<string, any>) {
  return JSON.stringify(Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'image' && !key.startsWith('operation_'))), null, 2);
}
</script>
<template>
  <aside v-if="offlineState.offline || offlineState.pending.length || offlineState.workspaceError || offlineState.catalogError || offlineState.error" class="card stack" aria-live="polite">
    <template v-if="offlineState.offline">
      <p v-if="offlineState.workspaceUpdatedAt">{{ t('offline.workspaceReady') }} {{ new Date(offlineState.workspaceUpdatedAt).toLocaleString() }}</p>
      <p v-else>{{ t('offline.workspacePreparing') }}</p>
    </template>
    <p v-if="offlineState.photoProgress">{{ t('offline.photos') }} {{ offlineState.photoProgress }}</p>
    <p v-if="offlineState.offline || offlineState.pending.length">{{ offlineState.offline ? t('offline.offline') : t('offline.pending', { count: offlineState.pending.length }) }}</p>
    <p v-if="offlineState.workspaceError" role="alert">{{ t('offline.workspaceError') }} {{ offlineState.workspaceError }}</p>
    <p v-if="offlineState.catalogError" role="alert">{{ t('offline.catalogError') }} {{ offlineState.catalogError }} <button type="button" class="btn small ghost" :disabled="offlineState.catalogSyncing || offlineState.syncing || offlineState.pending.length > 0" @click="retryCatalogs">{{ t('detail.lazyRetry') }}</button></p>
    <p v-if="offlineState.error" role="alert">{{ offlineState.error }}</p>
    <details v-if="offlineState.pending.length">
      <summary>{{ t('offline.entries') }} ({{ offlineState.pending.length }})</summary>
      <div v-for="item in offlineState.pending" :key="item.id" class="stack">
        <template v-if="item.kind === 'workspace'">
          <p>{{ title(item) }} · {{ new Date(item.createdAt).toLocaleString() }}</p>
          <details><summary>{{ t('offline.localChange') }}</summary><pre>{{ describe(item.body) }}</pre></details>
          <details v-if="item.conflict"><summary>{{ t('offline.serverChange') }}</summary><pre>{{ JSON.stringify(item.conflict.current, null, 2) }}</pre></details>
          <div v-if="item.conflict?.draftMerge" class="stack draft-merge">
            <p>{{ t('measure.draftMergeIntro') }}</p>
            <fieldset v-for="field in item.conflict.draftMerge.fields" :key="field" class="stack draft-field">
              <legend>{{ fieldTitle(field) }}</legend>
              <label><input v-model="choices(item)[field]" type="radio" :name="`${item.id}:${item.conflict.version}:${field}`" value="local" /> {{ t('measure.localDraftValue') }}: {{ fieldValue(item.body as MeasurementDraftData, field) }}</label>
              <label><input v-model="choices(item)[field]" type="radio" :name="`${item.id}:${item.conflict.version}:${field}`" value="server" /> {{ t('measure.serverDraftValue') }}: {{ fieldValue((item.conflict.current as { data: MeasurementDraftData }).data, field) }}</label>
            </fieldset>
            <button class="btn" type="button" :disabled="offlineState.syncing || item.conflict.draftMerge.fields.some(field => !choices(item)[field])" @click="resolveDraft(item)">{{ t('measure.applyDraftValues') }}</button>
          </div>
          <button v-if="item.conflict && !item.conflict.draftMerge" class="btn" type="button" :disabled="offlineState.syncing" @click="rebase(item)">{{ t('offline.keepLocal') }}</button>
        </template>
        <template v-else>
          <p>{{ t('offline.aquarium') }} {{ item.aquarium }} · {{ new Date(item.kind === 'maintenance' ? item.body.logged_at : item.body.measured_at).toLocaleString() }}</p>
          <p v-if="item.kind === 'maintenance'">{{ session.config?.maintenanceTypes[item.body.type]?.label || item.body.type }}<span v-if="item.body.percentage != null"> · {{ item.body.percentage }} %</span> · {{ item.body.details }} · {{ item.body.note }}</p>
          <p v-else>{{ Object.entries(item.body.values).map(([key, value]) => `${key}: ${value}`).join(', ') }} · {{ item.body.note }}</p>
        </template>
        <p v-if="item.error" role="alert">{{ item.error }}</p>
        <button class="btn ghost" type="button" :disabled="offlineState.syncing" @click="discard(item)">{{ t('offline.discard') }}</button>
      </div>
    </details>
    <button v-if="offlineState.offline" class="btn" type="button" :disabled="offlineState.syncing || offlineState.workspaceSyncing" @click="synchronize">{{ t('offline.sync') }}</button>
  </aside>
</template>

<style scoped>
.draft-field { min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: .5rem .75rem; }
.draft-field label { display: flex; min-height: 44px; overflow-wrap: anywhere; }
.draft-merge button:disabled { opacity: .55; }
</style>
