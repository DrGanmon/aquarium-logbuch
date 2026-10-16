<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useCatalogDefinition } from "../composables/catalog-definition";
import VariantSelect from "./VariantSelect.vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, errorMessage, toast } from "../state";
import type { Aquarium, Species, Id } from "../types";
const props = defineProps<{ species: Species }>();
const emit = defineEmits<{ close: []; added: [] }>();
const selectedId = ref(props.species.id);
watch(selectedId, id => { count.value = Math.max(1, definition.value.variants?.find(item => item.id === id)?.minGroupCount || definition.value.minGroupCount || 1); });
const aquariums = ref<Aquarium[]>([]);
const aquariumId = ref<Id | "">("");
const count = ref(Math.max(1, props.species.minGroupCount || 1));
const useNames = ref(false);
const names = ref<string[]>([]);
const page = ref(0);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const request = new AbortController();
const { definition, refresh: refreshDefinition } = useCatalogDefinition("species", props.species, caught => { error.value = errorMessage(caught); });
const eligible = computed(() => aquariums.value.filter((aq) => ["owner", "write"].includes(aq.role || "") && aq.water_type === props.species.waterType));
const validCount = computed(() => Number.isInteger(count.value) && count.value >= 1 && count.value <= 10000);
const pageCount = computed(() => Math.ceil((validCount.value ? count.value : 0) / 10));
const nameIndexes = computed(() => Array.from({ length: Math.max(0, Math.min(10, (validCount.value ? count.value : 0) - page.value * 10)) }, (_, index) => page.value * 10 + index));
watch(count, () => { page.value = Math.min(page.value, Math.max(0, pageCount.value - 1)); });
async function loadAquariums() {
  loading.value = true;
  error.value = "";
  try {
    await refreshDefinition();
    aquariums.value = await api<Aquarium[]>("/aquariums", { signal: request.signal });
    if (eligible.value.length === 1) aquariumId.value = eligible.value[0]!.id;
  } catch (e) { if (!request.signal.aborted) error.value = errorMessage(e); }
  finally { loading.value = false; }
}
onMounted(loadAquariums);
onBeforeUnmount(() => request.abort());
async function save() {
  if (busy.value || !validCount.value || !eligible.value.some((aq) => aq.id === aquariumId.value)) return;
  busy.value = true;
  error.value = "";
  try {
    await api(`/aquariums/${aquariumId.value}/stock/catalog`, {
      method: "POST",
      body: { speciesId: selectedId.value, count: count.value,
        names: useNames.value ? Array.from({ length: count.value }, (_, index) => names.value[index]?.trim() || "") : [] },
    });
    toast(t("speciesAdd.saved", { count: count.value, species: props.species.name }));
    emit("added");
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>
<template>
  <Modal :title="t('speciesAdd.title')" @close="!busy && emit('close')">
    <form class="stack" @submit.prevent="save">
      <div><strong>{{ species.name }}</strong><div class="muted"><em>{{ species.scientificName }}</em></div></div>
      <p v-if="loading" class="muted" role="status">{{ t('common.loading') }}</p>
      <p v-if="error" class="error" role="alert">{{ error }} <button v-if="!aquariums.length && !loading" class="btn small ghost" type="button" @click="loadAquariums">{{ t('detail.lazyRetry') }}</button></p>
      <template v-if="!loading && eligible.length">
        <label>{{ t('speciesAdd.aquarium') }}<select v-model="aquariumId" required :disabled="busy"><option disabled value="">{{ t('speciesAdd.choose') }}</option><option v-for="aq in eligible" :key="aq.id" :value="aq.id">{{ aq.name }}{{ aq.volume_l ? ` · ${aq.volume_l} L` : '' }}</option></select></label>
        <VariantSelect v-model="selectedId" :root-id="definition.id" :variants="definition.variants" :disabled="busy" />
        <label>{{ t('common.count') }}<input v-model.number="count" type="number" min="1" max="10000" step="1" required :disabled="busy" /></label>
        <label class="row"><input v-model="useNames" type="checkbox" :disabled="busy" />{{ t('speciesAdd.namesOptional') }}</label>
        <div v-if="useNames" class="stack">
          <p class="muted" style="margin: 0">{{ t('speciesAdd.namesHelp') }}</p>
          <label v-for="index in nameIndexes" :key="index">{{ t('speciesAdd.animalName', { number: index + 1 }) }}<input v-model="names[index]" maxlength="80" :disabled="busy" :placeholder="t('speciesAdd.namePlaceholder')" /></label>
          <div v-if="pageCount > 1" class="row between">
            <button type="button" class="btn small ghost" :disabled="busy || page === 0" @click="page--">{{ t('speciesAdd.previous') }}</button>
            <span>{{ t('speciesAdd.page', { page: page + 1, pages: pageCount }) }}</span>
            <button type="button" class="btn small ghost" :disabled="busy || page + 1 >= pageCount" @click="page++">{{ t('speciesAdd.next') }}</button>
          </div>
        </div>
        <button class="btn" :disabled="busy || !validCount || !aquariumId">{{ busy ? t('common.loading') : t('speciesAdd.title') }}</button>
      </template>
      <p v-else-if="!loading && !error" class="muted">{{ t('speciesAdd.noAquariums') }}</p>
    </form>
  </Modal>
</template>
