<script setup lang="ts">
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { useCatalogRevision } from "../composables/catalog-revision";
import { api } from '../api';
import { useProgressiveList } from '../composables/progressive-list';
import { language, t, errorMessage } from '../state';
import type { HealthCatalog, MedicationCatalog } from '../health-types';
const emit = defineEmits<{ medication: [id: string] }>();
const water = ref('all'), disease = ref(''), legalStatus = ref(''), search = ref('');
const catalog = shallowRef<MedicationCatalog>();
const diseases = shallowRef<HealthCatalog['diseases']>([]);
const loading = ref(false), error = ref('');
const matches = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return (catalog.value?.items || []).filter(item => (!disease.value || item.indications.some(entry => entry.diseaseId === disease.value))
    && (!legalStatus.value || item.legalStatus === legalStatus.value)
    && (!query || [item.name, item.category, ...item.activeSubstances, ...item.productExamples.map(product => product.name)].join(' ').toLocaleLowerCase().includes(query)));
});
const { visible: shown, hasMore, sentinel, more } = useProgressiveList(matches);
const revision = useCatalogRevision("health");
let request: AbortController | undefined;
watch(water, () => { disease.value = ''; });
watch([water, language, revision], async () => {
  request?.abort(); const current = new AbortController(); request = current;
  loading.value = true; error.value = '';
  try {
    const query = new URLSearchParams({ waterType: water.value });
    const [medications, health] = await Promise.all([
      api<MedicationCatalog>(`/health/medications?${query}`, { signal: current.signal }),
      api<HealthCatalog>(`/health/catalog?${query}`, { signal: current.signal }),
    ]);
    if (!current.signal.aborted) { catalog.value = medications; diseases.value = health.diseases; }
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
  finally { if (request === current) loading.value = false; }
}, { immediate: true });
onBeforeUnmount(() => request?.abort());
</script>
<template>
  <section class="stack">
    <p>{{ t('healthMedications.intro') }}</p>
    <p v-if="catalog" class="compat-box warn">{{ catalog.disclaimer }}</p>
    <div class="card health-filter-grid">
      <label>{{ t('health.waterType') }}<select v-model="water"><option value="all">{{ t('common.all') }}</option><option value="fresh">{{ t('health.fresh') }}</option><option value="salt">{{ t('health.salt') }}</option></select></label>
      <label>{{ t('healthMedications.disease') }}<select v-model="disease"><option value="">{{ t('common.all') }}</option><option v-for="item in diseases" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>{{ t('healthMedications.legalStatus') }}<select v-model="legalStatus"><option value="">{{ t('common.all') }}</option><option value="otc">{{ t('healthMedications.otc') }}</option><option value="rx">{{ t('health.prescription') }}</option><option value="not_a_medicine">{{ t('healthMedications.notMedicine') }}</option></select></label>
      <label>{{ t('health.search') }}<input v-model="search" type="search" :placeholder="t('healthMedications.search')" /></label>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <template v-else>
      <p role="status">{{ matches.length }} {{ t('health.entries') }}</p><p v-if="!shown.length" class="card">{{ t('health.noMatches') }}</p>
      <div class="health-disease-grid">
        <article v-for="item in shown" :key="item.id" class="card stack">
          <div class="row"><span class="chip">{{ t(item.kind === 'supply' ? 'healthMedications.supply' : 'healthMedications.medication') }}</span><span class="chip" :class="{ warn: item.legalStatus === 'rx' }">{{ item.legalStatusLabel }}</span></div>
          <h2>{{ item.name }}</h2><p>{{ item.category }}</p><p v-if="item.activeSubstances.length">{{ item.activeSubstances.join(', ') }}</p>
          <p class="muted">{{ t(item.legalStatusVerified ? 'healthMedications.verified' : 'healthMedications.unverified') }}</p>
          <span v-if="item.invertebrateSafe === false" class="chip warn">{{ t('health.unsafeInvertebrates') }}</span>
          <span v-else-if="item.invertebrateSafe === null" class="chip warn">{{ t('health.checkProduct') }}</span>
          <button type="button" class="btn ghost" @click="emit('medication', item.id)">{{ t('healthMedications.details') }}</button>
        </article>
      </div>
      <div v-if="hasMore" ref="sentinel" class="row" style="justify-content: center">
        <button class="btn ghost" type="button" @click="more">{{ t('common.loadMore') }}</button>
      </div>
      <details v-if="catalog"><summary>{{ t('healthMedications.homePharmacy') }}</summary><p>{{ catalog.homePharmacyScale }}</p><ul><li v-for="criterion in catalog.homePharmacyCriteria" :key="criterion">{{ criterion }}</li></ul></details>
    </template>
  </section>
</template>
