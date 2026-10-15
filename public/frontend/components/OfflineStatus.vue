<script setup lang="ts">
import { offlineState, storePending } from '../offline-store';
import { refreshPending, synchronize } from '../offline-sync';
import { t, session } from '../state';
async function discard(item: typeof offlineState.pending[number]) {
  if (!confirm(t('offline.discardConfirm'))) return;
  await storePending(item, true);
  await refreshPending();
}
</script>
<template>
  <aside v-if="offlineState.offline || offlineState.pending.length || offlineState.error" class="card stack" aria-live="polite">
    <p>{{ offlineState.offline ? t('offline.offline') : t('offline.pending', { count: offlineState.pending.length }) }}</p>
    <p v-if="offlineState.error" role="alert">{{ offlineState.error }}</p>
    <details v-if="offlineState.pending.length">
      <summary>{{ t('offline.entries') }} ({{ offlineState.pending.length }})</summary>
      <div v-for="item in offlineState.pending" :key="item.id" class="stack">
        <p>{{ t('offline.aquarium') }} {{ item.aquarium }} · {{ new Date(item.kind === 'maintenance' ? item.body.logged_at : item.body.measured_at).toLocaleString() }}</p>
        <p v-if="item.kind === 'maintenance'">{{ session.config?.maintenanceTypes[item.body.type]?.label || item.body.type }}<span v-if="item.body.percentage != null"> · {{ item.body.percentage }} %</span> · {{ item.body.details }} · {{ item.body.note }}</p>
        <p v-else>{{ Object.entries(item.body.values).map(([key, value]) => `${key}: ${value}`).join(', ') }} · {{ item.body.note }}</p>
        <p v-if="item.error" role="alert">{{ item.error }}</p>
        <button class="btn ghost" type="button" :disabled="offlineState.syncing" @click="discard(item)">{{ t('offline.discard') }}</button>
      </div>
    </details>
    <button class="btn" type="button" :disabled="offlineState.syncing" @click="synchronize">{{ t('offline.sync') }}</button>
  </aside>
</template>
