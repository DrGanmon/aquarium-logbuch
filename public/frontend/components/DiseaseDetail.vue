<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import Modal from './Modal.vue';
import { api } from '../api';
import { language, t, errorMessage } from '../state';
import type { DiseaseDetail } from '../health-types';
const props = defineProps<{ diseaseId: string; speciesId?: string }>();
const emit = defineEmits<{ close: [] }>();
const disease = ref<DiseaseDetail>();
const error = ref('');
let request: AbortController | undefined;
watch([() => props.diseaseId, () => props.speciesId, language], async () => {
  request?.abort();
  const current = new AbortController(); request = current;
  disease.value = undefined; error.value = '';
  try {
    const query = new URLSearchParams(props.speciesId ? { speciesId: props.speciesId } : {});
    const result = await api<{ disease: DiseaseDetail }>(`/health/diseases/${encodeURIComponent(props.diseaseId)}?${query}`, { signal: current.signal });
    if (!current.signal.aborted) disease.value = result.disease;
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
}, { immediate: true });
onBeforeUnmount(() => request?.abort());
const safeLink = (url?: string) => url && /^https?:\/\//i.test(url) ? url : undefined;
</script>
<template>
  <Modal :title="disease?.name || t('health.diseaseDetails')" wide @close="emit('close')">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!disease" role="status">{{ t('common.loading') }}</p>
    <template v-else>
      <div class="row"><span class="chip">{{ disease.waterType === 'salt' ? t('health.salt') : t('health.fresh') }}</span><span class="chip">{{ disease.category }}</span></div>
      <p class="compat-box warn">{{ disease.disclaimer }}</p>
      <details><summary>{{ t('health.background') }}</summary><p>{{ disease.description }}</p></details>
      <section v-if="disease.speciesSigns.length"><h3>{{ t('health.speciesSigns') }}</h3><ul><li v-for="sign in disease.speciesSigns" :key="sign">{{ sign }}</li></ul></section>
      <section><h3>{{ t('health.signs') }}</h3><ul><li v-for="sign in disease.generalSigns" :key="sign">{{ sign }}</li></ul></section>
      <section><h3>{{ t('health.confirmation') }}</h3><p>{{ disease.diagnosis }}</p></section>
      <section><h3>{{ t('health.transmission') }}</h3><p>{{ disease.contagious.transmission }}</p><p v-if="disease.contagious.notes">{{ disease.contagious.notes }}</p><p v-if="disease.contagious.zoonotic" class="compat-box warn">{{ t('health.zoonotic') }}</p></section>
      <section><h3>{{ t('health.risks') }}</h3><ul><li v-for="factor in disease.predisposingFactors" :key="factor">{{ factor }}</li></ul></section>
      <section><h3>{{ t('health.treatment') }}</h3><p>{{ disease.treatment.summary }}</p><p class="muted">{{ t('health.treatmentNote') }}</p><p v-for="caution in disease.treatmentCautions" :key="caution" class="compat-box warn">{{ caution }}</p>
        <details><summary>{{ t('health.sourceTreatment') }}</summary><ol><li v-for="step in disease.treatment.steps" :key="step">{{ step }}</li></ol>
          <div v-for="substance in disease.treatment.activeSubstances" :key="substance.substance" class="health-substance"><strong>{{ substance.substance }}</strong><p>{{ substance.notes }}</p><div class="row"><span v-if="substance.prescriptionRequired" class="chip warn">{{ t('health.prescription') }}</span><span v-if="substance.invertebrateSafe === false" class="chip crit">{{ t('health.unsafeInvertebrates') }}</span><span v-if="substance.invertebrateSafe === null" class="chip warn">{{ t('health.checkProduct') }}</span></div></div>
          <p>{{ disease.treatment.prognosis }}</p>
        </details>
      </section>
      <section><h3>{{ t('health.prevention') }}</h3><ul><li v-for="item in disease.prevention" :key="item">{{ item }}</li></ul></section>
      <details><summary>{{ t('health.affectedSpecies') }} ({{ disease.affectedSpeciesNames.length }})</summary><ul><li v-for="species in disease.affectedSpeciesNames" :key="species.id">{{ species.name }} · <i>{{ species.scientificName }}</i></li></ul></details>
      <details><summary>{{ t('health.sources') }}</summary><ul><li v-for="source in disease.sourceDetails" :key="source.id"><a v-if="safeLink(source.url)" :href="safeLink(source.url)" target="_blank" rel="noopener noreferrer">{{ source.title }}</a><span v-else>{{ source.title }}</span><span v-if="source.authors"> · {{ source.authors }}</span><span v-if="source.year"> ({{ source.year }})</span></li></ul><p v-for="note in disease.legalNotes" :key="note" class="muted">{{ note }}</p></details>
    </template>
  </Modal>
</template>
