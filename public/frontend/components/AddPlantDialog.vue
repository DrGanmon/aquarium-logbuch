<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, errorMessage, toast } from "../state";
import type { Aquarium, Id, AquariumPlant } from "../types";
import type { PlantSummary } from "../../../src/shared/plants";
const props = defineProps<{ plant: PlantSummary; aquariumId?: string }>();
const emit = defineEmits<{ close: []; added: [] }>();
const aquariums = ref<Aquarium[]>([]), aquariumId = ref<Id | "">("");
const count = ref(1), loading = ref(true), busy = ref(false), countLoading = ref(false), error = ref("");
const request = new AbortController();
let countRequest: AbortController | undefined;
const eligible = computed(() => aquariums.value.filter(aq => ['owner', 'write'].includes(aq.role || '') && aq.water_type === props.plant.waterType));
const valid = computed(() => Number.isInteger(count.value) && count.value >= 1 && count.value <= 10000);
onBeforeUnmount(() => { request.abort();countRequest?.abort(); });
onMounted(load);
async function load() {
  loading.value = true;error.value = '';
  try {
    aquariums.value = await api<Aquarium[]>('/aquariums', { signal: request.signal });
    aquariumId.value = eligible.value.find(aq => String(aq.id) === props.aquariumId)?.id || (eligible.value.length === 1 ? eligible.value[0]!.id : '');
  } catch (caught) { if (!request.signal.aborted) error.value = errorMessage(caught); }
  finally { loading.value = false; }
}
watch(aquariumId, async id => {
  countRequest?.abort();count.value = 1;
  if (!id) return;
  const current = new AbortController();countRequest = current;countLoading.value = true;error.value = '';
  try {
    const rows = await api<AquariumPlant[]>(`/aquariums/${id}/plants`, { signal: current.signal });
    if (!current.signal.aborted) count.value = rows.find(row => row.plant_id === props.plant.id)?.count || 1;
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
  finally { if (!current.signal.aborted) countLoading.value = false; }
});
async function save() {
  if (busy.value || countLoading.value || !valid.value || !eligible.value.some(aq => aq.id === aquariumId.value)) return;
  busy.value = true;error.value = '';
  try {
    await api(`/aquariums/${aquariumId.value}/plants/${encodeURIComponent(props.plant.id)}`, { method: 'PUT', body: { count: count.value } });
    toast(t('plantStock.saved'));emit('added');
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
</script>
<template>
  <Modal :title="t('plantStock.add')" @close="!busy && emit('close')">
    <form class="stack" @submit.prevent="save">
      <strong>{{ plant.name }}</strong><em>{{ plant.scientificName }}</em>
      <p v-if="loading" role="status">{{ t('common.loading') }}</p>
      <p v-if="error" class="error" role="alert">{{ error }} <button v-if="!aquariums.length && !loading" type="button" class="btn small ghost" @click="load">{{ t('detail.lazyRetry') }}</button></p>
      <template v-if="!loading && eligible.length">
        <label>{{ t('speciesAdd.aquarium') }}<select v-model="aquariumId" required :disabled="busy"><option disabled value="">{{ t('speciesAdd.choose') }}</option><option v-for="aq in eligible" :key="aq.id" :value="aq.id">{{ aq.name }}</option></select></label>
        <label>{{ t('common.count') }}<input v-model.number="count" type="number" min="1" max="10000" step="1" required :disabled="busy || countLoading" /></label>
        <p class="muted">{{ t('plantStock.countHint') }}</p>
        <button class="btn" :disabled="busy || countLoading || !valid || !aquariumId">{{ t('common.save') }}</button>
      </template>
      <p v-else-if="!loading && !error">{{ t('plantStock.noAquariums') }}</p>
    </form>
  </Modal>
</template>
