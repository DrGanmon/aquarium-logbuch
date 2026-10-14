<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, language, errorMessage } from "../state";
import type { Plant, PlantCatalog, PlantRange } from "../../../src/shared/plants";
const props = defineProps<{ plantId: string }>();
defineEmits<{ close: [] }>();
interface Detail { plant: Plant; fieldDefinitions: PlantCatalog['fieldDefinitions']; notes: string[]; sources: PlantCatalog['sources'][string][] }
const detail = ref<Detail>(), error = ref(""), loading = ref(false);
let request: AbortController | undefined;
onBeforeUnmount(() => request?.abort());
watch(() => [props.plantId, language.value], load, { immediate: true });
async function load() {
  request?.abort();const current = new AbortController();request = current;
  detail.value = undefined;error.value = "";loading.value = true;
  try {
    const result = await api<Detail>(`/plants/${encodeURIComponent(props.plantId)}`, { signal: current.signal });
    if (!current.signal.aborted) detail.value = result;
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
  finally { if (!current.signal.aborted) loading.value = false; }
}
function label(field: string, value: string | null) {
  const definitions = detail.value?.fieldDefinitions[field];
  return typeof definitions === 'object' ? definitions[String(value)] || value || '—' : value || '—';
}
function range(value: PlantRange | null | undefined, unit = '') {
  return value ? `${value.min}–${value.max}${unit ? ` ${unit}` : ''}` : '—';
}
function safeUrl(url: string) { return /^https?:\/\//i.test(url) ? url : undefined; }
</script>
<template>
  <Modal :title="detail?.plant.name || t('nav.plants')" wide @close="$emit('close')">
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }} <button class="btn small ghost" @click="load">{{ t('detail.lazyRetry') }}</button></p>
    <template v-if="detail">
      <p><i>{{ detail.plant.scientificName }}</i> · {{ detail.plant.category }}</p>
      <p v-if="detail.plant.synonyms.length">{{ t('plants.synonyms') }}: {{ detail.plant.synonyms.join(', ') }}</p>
      <p>{{ detail.plant.description }}</p>
      <div class="row">
        <span class="tag">{{ t(`speciesCatalog.${detail.plant.waterType}`) }}</span>
        <span class="tag">{{ label('difficulty', detail.plant.difficulty) }}</span>
        <span v-for="place in detail.plant.placement" :key="place" class="tag">{{ label('placement', place) }}</span>
      </div>
      <dl class="plant-facts">
        <dt>{{ t('plants.origin') }}</dt><dd>{{ detail.plant.origin }}</dd>
        <dt>{{ t('plants.growth') }}</dt><dd>{{ label('growthRate', detail.plant.growthRate) }}</dd>
        <dt>{{ t('plants.height') }}</dt><dd>{{ range(detail.plant.heightCm, 'cm') }}</dd>
        <dt>{{ t('plants.light') }}</dt><dd>{{ label('light', detail.plant.light) }}</dd>
        <dt>CO₂</dt><dd>{{ label('co2', detail.plant.co2) }} · {{ label('co2Demand', detail.plant.co2Demand) }}</dd>
        <dt>{{ t('plants.temperature') }}</dt><dd>{{ range(detail.plant.temp, '°C') }}<template v-if="detail.plant.temp.idealMin != null && detail.plant.temp.idealMax != null"> ({{ t('plants.ideal') }}: {{ detail.plant.temp.idealMin }}–{{ detail.plant.temp.idealMax }} °C)</template></dd>
        <dt>pH</dt><dd>{{ range(detail.plant.ph) }}</dd>
        <template v-if="detail.plant.gh"><dt>GH</dt><dd>{{ range(detail.plant.gh, '°dH') }}</dd></template>
        <template v-if="detail.plant.kh"><dt>KH</dt><dd>{{ range(detail.plant.kh, '°dH') }}</dd></template>
        <template v-if="detail.plant.salinity"><dt>{{ t('plants.salinity') }}</dt><dd>{{ range(detail.plant.salinity, detail.plant.salinity.unit) }}</dd></template>
        <template v-if="detail.plant.substrate"><dt>{{ t('plants.substrate') }}</dt><dd>{{ detail.plant.substrate }}</dd></template>
        <template v-if="detail.plant.propagation"><dt>{{ t('plants.propagation') }}</dt><dd>{{ detail.plant.propagation }}</dd></template>
        <template v-if="detail.plant.herbivoreResistant !== undefined"><dt>{{ t('plants.herbivoreResistant') }}</dt><dd>{{ t(detail.plant.herbivoreResistant ? 'plants.yes' : 'plants.no') }}</dd></template>
      </dl>
      <h3>{{ t('plants.care') }}</h3><p>{{ detail.plant.careNotes }}</p>
      <p v-for="note in detail.notes" :key="note" class="muted">{{ note }}</p>
      <template v-if="detail.sources.length">
        <h3>{{ t('plants.sources') }}</h3>
        <ul><li v-for="source in detail.sources" :key="source.url"><a :href="safeUrl(source.url)" target="_blank" rel="noopener noreferrer">{{ source.title }}</a> · {{ source.publisher }}</li></ul>
      </template>
    </template>
  </Modal>
</template>
<style scoped>
.plant-facts { display: grid; grid-template-columns: minmax(7rem, 1fr) minmax(0, 2fr); gap: .5rem 1rem; }
.plant-facts dt { font-weight: 600; }
.plant-facts dd { margin: 0; overflow-wrap: anywhere; }
</style>
