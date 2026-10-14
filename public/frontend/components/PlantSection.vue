<script setup lang="ts">
import { ref } from "vue";
import PlantDetail from "./PlantDetail.vue";
import { api } from "../api";
import { t, errorMessage } from "../state";
import type { AquariumPlant } from "../types";
const props = defineProps<{ id: string; plants: AquariumPlant[]; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const selected = ref(''), error = ref(''), busy = ref(false), editing = ref(''), count = ref(1);
async function save(item: AquariumPlant) {
  if (busy.value || !Number.isInteger(count.value) || count.value < 1 || count.value > 10000) return;
  await mutate(item, 'PUT', { count: count.value });
}
async function remove(item: AquariumPlant) {
  if (!confirm(t('common.delete') + '?')) return;
  await mutate(item, 'DELETE');
}
async function mutate(item: AquariumPlant, method: string, body?: unknown) {
  if (busy.value) return;
  busy.value = true;error.value = '';
  try {
    await api(`/aquariums/${props.id}/plants/${encodeURIComponent(item.plant_id)}`, { method, body });
    editing.value = '';emit('changed');
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="card stack">
    <div class="row between"><h2>🌿 {{ t('nav.plants') }}</h2><a v-if="!readonly" class="btn small ghost" :href="`#/plants?aquariumId=${encodeURIComponent(id)}`">{{ t('plantStock.add') }}</a></div>
    <p v-if="!plants.length" class="muted">{{ t('plantStock.empty') }}</p>
    <div class="stock-list">
      <div v-for="item in plants" :key="item.plant_id" class="stock-item">
        <div><strong>{{ item.name }} <span class="tag">{{ item.count }} ×</span></strong><div class="muted"><em>{{ item.scientificName }}</em> · {{ item.category }}</div></div>
        <div class="row">
          <button class="btn small ghost" @click="selected = item.plant_id">{{ t('common.details') }}</button>
          <template v-if="!readonly">
            <button class="btn small ghost" :disabled="busy" @click="editing = item.plant_id;count = item.count">{{ t('common.edit') }}</button>
            <button class="btn small ghost danger" :disabled="busy" @click="remove(item)">{{ t('common.delete') }}</button>
          </template>
        </div>
        <form v-if="editing === item.plant_id && !readonly" class="row" @submit.prevent="save(item)">
          <label>{{ t('common.count') }}<input v-model.number="count" type="number" min="1" max="10000" step="1" required :disabled="busy" /></label>
          <button class="btn small" :disabled="busy">{{ t('common.save') }}</button><button type="button" class="btn small ghost" :disabled="busy" @click="editing = ''">{{ t('common.cancel') }}</button>
        </form>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <PlantDetail v-if="selected" :plant-id="selected" @close="selected = ''" />
  </section>
</template>
