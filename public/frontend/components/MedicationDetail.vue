<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import Modal from './Modal.vue';
import { api } from '../api';
import { language, t, errorMessage } from '../state';
import type { MedicationDetail } from '../health-types';
const props = withDefaults(defineProps<{ medicationId: string; showDiseaseLinks?: boolean }>(), { showDiseaseLinks: true });
const emit = defineEmits<{ close: []; disease: [id: string] }>();
const medication = ref<MedicationDetail>();
const error = ref('');
let request: AbortController | undefined;
watch([() => props.medicationId, language], async () => {
  request?.abort(); const current = new AbortController(); request = current;
  medication.value = undefined; error.value = '';
  try {
    const result = await api<{ medication: MedicationDetail }>(`/health/medications/${encodeURIComponent(props.medicationId)}`, { signal: current.signal });
    if (!current.signal.aborted) medication.value = result.medication;
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
}, { immediate: true });
onBeforeUnmount(() => request?.abort());
const safeLink = (url?: string) => url && /^https?:\/\//i.test(url) ? url : undefined;
</script>
<template>
  <Modal :title="medication?.name || t('healthMedications.details')" wide @close="emit('close')">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!medication" role="status">{{ t('common.loading') }}</p>
    <template v-else>
      <p class="compat-box warn">{{ medication.disclaimer }}</p>
      <p>{{ t('healthMedications.sourceNote') }}</p>
      <div class="row">
        <span class="chip">{{ medication.category }}</span>
        <span class="chip" :class="{ warn: medication.legalStatus === 'rx' }">{{ medication.legalStatusLabel }}</span>
        <span class="chip">{{ t(medication.legalStatusVerified ? 'healthMedications.verified' : 'healthMedications.unverified') }}</span>
        <span v-for="water in medication.waterTypes" :key="water" class="chip">{{ t(water === 'salt' ? 'health.salt' : 'health.fresh') }}</span>
      </div>
      <p>{{ medication.legalNote }}</p>
      <p v-if="medication.invertebrateSafe === false" class="compat-box warn">{{ t('health.unsafeInvertebrates') }}</p>
      <p v-else-if="medication.invertebrateSafe === null" class="compat-box warn">{{ t('health.checkProduct') }}</p>
      <section v-if="medication.activeSubstances.length"><h3>{{ t('healthMedications.substances') }}</h3><p>{{ medication.activeSubstances.join(', ') }}</p></section>
      <section><h3>{{ t('healthMedications.indications') }}</h3>
        <ul><li v-for="indication in medication.indications" :key="`${indication.diseaseId}:${indication.role}`">
          <button v-if="showDiseaseLinks" type="button" class="btn small ghost" @click="emit('disease', indication.diseaseId)">{{ indication.disease }}</button><span v-else>{{ indication.disease }}</span> · {{ indication.roleLabel }}
        </li></ul>
      </section>
      <section><h3>{{ t('healthMedications.cautions') }}</h3><ul><li v-for="caution in medication.cautions" :key="caution">{{ caution }}</li></ul></section>
      <section><h3>{{ t('healthMedications.use') }}</h3><p>{{ medication.use }}</p></section>
      <section><h3>{{ t('healthMedications.homePharmacy') }}</h3>
        <div class="row"><span v-if="medication.homePharmacy.freshwater !== null" class="chip">{{ t('health.fresh') }}: {{ medication.homePharmacy.freshwater }}/10</span><span v-if="medication.homePharmacy.saltwater !== null" class="chip">{{ t('health.salt') }}: {{ medication.homePharmacy.saltwater }}/10</span></div>
        <p>{{ medication.homePharmacy.reason }}</p>
      </section>
      <section v-if="medication.productExamples.length"><h3>{{ t('healthMedications.products') }}</h3><ul><li v-for="product in medication.productExamples" :key="product.name">{{ product.name }} · {{ product.manufacturer }}</li></ul></section>
      <details><summary>{{ t('health.sources') }}</summary>
        <p>{{ medication.legalStatusVerifiedNote }}</p>
        <ul><li v-for="source in medication.sourceDetails" :key="source.id"><a v-if="safeLink(source.url)" :href="safeLink(source.url)" target="_blank" rel="noopener noreferrer">{{ source.title }}</a><span v-else>{{ source.title }}</span><span v-if="source.authors"> · {{ source.authors }}</span><span v-if="source.year"> ({{ source.year }})</span></li></ul>
        <p v-for="note in medication.legalNotes" :key="note" class="muted">{{ note }}</p>
      </details>
    </template>
  </Modal>
</template>
