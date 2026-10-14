<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { api } from '../api';
import { useIndexedSearch } from '../composables/indexed-search';
import { useProgressiveList } from '../composables/progressive-list';
import { language, t, errorMessage } from '../state';
import { route } from '../router';
import type { HealthCatalog } from '../health-types';
const MedicationCatalog = lazyComponent(() => import("../components/MedicationCatalog.vue"));
const MedicationDetail = lazyComponent(() => import("../components/MedicationDetail.vue"));
const DiseaseDetail = lazyComponent(() => import("../components/DiseaseDetail.vue"));
const DiagnosisWizard = lazyComponent(() => import("../components/DiagnosisWizard.vue"));

const tab = ref(route.value.query.get('wizard') === '1' ? 'wizard' : 'catalog');
const water = ref('all');
const species = ref(route.value.query.get('speciesId') || '');
const search = ref('');
const catalog = shallowRef<HealthCatalog>();
const error = ref('');
const loading = ref(false);
const selected = ref<string>();
const selectedMedication = ref<string>();
const diseases = computed(() => catalog.value?.diseases || []);
const matches = useIndexedSearch(diseases, search, item =>
  [item.name, item.category, ...item.synonyms, ...item.keySigns, ...item.speciesSigns].join(' '));
const { visible: shown, hasMore, sentinel, more } = useProgressiveList(matches);
let loadedCatalogKey = '';
let request: AbortController | undefined;
onBeforeUnmount(() => request?.abort());
watch(water, () => { species.value = ''; });
watch([water, species, language, tab], async () => {
  const key = JSON.stringify([water.value, species.value, language.value]);
  request?.abort();
  if (tab.value !== 'catalog' || key === loadedCatalogKey) {
    loading.value = false;
    if (key === loadedCatalogKey) error.value = '';
    return;
  }
  const current = new AbortController(); request = current;
  loading.value = true; error.value = '';
  try {
    const query = new URLSearchParams({ waterType: water.value, speciesId: species.value });
    const result = await api<HealthCatalog>(`/health/catalog?${query}`, { signal: current.signal });
    if (!current.signal.aborted) { catalog.value = result;loadedCatalogKey = key; }
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
  finally { if (request === current) loading.value = false; }
}, { immediate: true });
</script>
<template>
  <div class="stack">
    <div class="row between"><h1>{{ t('health.title') }}</h1><a class="btn small ghost" :href="'#/'">{{ t('common.back') }}</a></div>
    <div class="row" role="tablist" :aria-label="t('health.title')"><button id="health-catalog-tab" class="btn" :class="{ ghost: tab !== 'catalog' }" role="tab" :aria-selected="tab === 'catalog'" aria-controls="health-catalog-panel" @click="tab = 'catalog'">{{ t('health.catalog') }}</button><button id="health-wizard-tab" class="btn" :class="{ ghost: tab !== 'wizard' }" role="tab" :aria-selected="tab === 'wizard'" aria-controls="health-wizard-panel" @click="tab = 'wizard'">{{ t('health.wizard') }}</button><button id="health-medications-tab" class="btn" :class="{ ghost: tab !== 'medications' }" role="tab" :aria-selected="tab === 'medications'" aria-controls="health-medications-panel" @click="tab = 'medications'">{{ t('healthMedications.title') }}</button></div>
    <DiagnosisWizard v-if="tab === 'wizard'" id="health-wizard-panel" role="tabpanel" aria-labelledby="health-wizard-tab" :initial-aquarium-id="route.query.get('aquariumId') || undefined" :initial-stock-id="route.query.get('stockId') || undefined" />
    <MedicationCatalog v-else-if="tab === 'medications'" id="health-medications-panel" role="tabpanel" aria-labelledby="health-medications-tab" @medication="selectedMedication = $event" />
    <section v-else id="health-catalog-panel" class="stack" role="tabpanel" aria-labelledby="health-catalog-tab">
      <p class="muted">{{ t('health.catalogIntro') }}</p>
      <div class="card health-filter-grid"><label>{{ t('health.waterType') }}<select v-model="water"><option value="all">{{ t('common.all') }}</option><option value="fresh">{{ t('health.fresh') }}</option><option value="salt">{{ t('health.salt') }}</option></select></label><label>{{ t('health.species') }}<select v-model="species"><option value="">{{ t('health.allSpecies') }}</option><option v-for="item in catalog?.species || []" :key="item.id" :value="item.id">{{ item.name }} · {{ item.scientificName }}</option></select></label><label>{{ t('health.search') }}<input v-model="search" type="search" :placeholder="t('health.searchPlaceholder')" /></label></div>
      <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t('common.loading') }}</p>
      <template v-else><p class="muted" role="status">{{ matches.length }} {{ t('health.entries') }}</p><p v-if="!shown.length" class="card">{{ t('health.noMatches') }}</p>
        <div class="health-disease-grid" v-memo="[shown, language]"><article v-for="item in shown" :key="item.id" class="card stack"><div class="row"><span class="chip">{{ item.waterType === 'salt' ? t('health.salt') : t('health.fresh') }}</span><span class="chip">{{ item.category }}</span></div><h2>{{ item.name }}</h2><ul><li v-for="sign in (item.speciesSigns.length ? item.speciesSigns : item.keySigns)" :key="sign">{{ sign }}</li></ul><p v-if="item.susceptibility" class="muted">{{ t('health.susceptibility') }}: {{ item.susceptibility }}</p><span v-if="item.contagious.zoonotic" class="chip warn">{{ t('health.zoonoticShort') }}</span><button class="btn ghost" type="button" @click="selected = item.id">{{ t('health.diseaseDetails') }}</button></article></div>
        <div v-if="hasMore" ref="sentinel" class="row" style="justify-content: center">
          <button class="btn ghost" type="button" @click="more">{{ t('common.loadMore') }}</button>
        </div>
      </template>
    </section>
    <MedicationDetail v-if="selectedMedication" :medication-id="selectedMedication" @close="selectedMedication = undefined" @disease="selectedMedication = undefined; selected = $event" />
    <DiseaseDetail v-if="selected" :disease-id="selected" :species-id="species || undefined" @close="selected = undefined" />
  </div>
</template>
