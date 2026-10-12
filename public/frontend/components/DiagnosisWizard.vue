<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { api } from '../api';
import { t, language, errorMessage, fmtDate } from '../state';
import type { Aquarium } from '../types';
import type { AnswerInput, DiagnosisResponse, HealthResident, ResidentResponse } from '../health-types';
import DiseaseDetail from './DiseaseDetail.vue';
const props = defineProps<{ initialAquariumId?: string; initialStockId?: string }>();
const aquariums = ref<Aquarium[]>([]);
const aquariumId = ref(props.initialAquariumId || '');
const stockId = ref(props.initialStockId || '');
const residents = ref<HealthResident[]>([]);
const selectionLoading = ref(false);
const busy = ref(false);
const error = ref('');
const outcome = ref<DiagnosisResponse>();
const answers = ref<AnswerInput[]>([]);
const selectedDisease = ref<string>();
const questionHeading = ref<HTMLElement>();
const selectedResident = computed(() => residents.value.find(item => String(item.stockId) === stockId.value));
const ready = computed(() => Boolean(aquariumId.value && selectedResident.value?.supported));
let selectionRequest: AbortController | undefined;
let diagnosisRequest: AbortController | undefined;
const lifecycle = new AbortController();
onBeforeUnmount(() => { lifecycle.abort(); selectionRequest?.abort(); diagnosisRequest?.abort(); });
onMounted(async () => {
  try { aquariums.value = await api<Aquarium[]>('/aquariums', { signal: lifecycle.signal }); }
  catch (caught) { if (!lifecycle.signal.aborted) error.value = errorMessage(caught); }
});
watch([aquariumId, language], async () => {
  selectionRequest?.abort(); diagnosisRequest?.abort();
  outcome.value = undefined; answers.value = []; residents.value = []; error.value = '';
  if (!aquariumId.value) { selectionLoading.value = false; return; }
  const request = new AbortController(); selectionRequest = request; selectionLoading.value = true;
  try {
    const result = await api<ResidentResponse>(`/health/aquariums/${encodeURIComponent(aquariumId.value)}/residents`, { signal: request.signal });
    if (request.signal.aborted) return;
    residents.value = result.residents;
    if (!result.residents.some(item => String(item.stockId) === stockId.value)) stockId.value = '';
  } catch (caught) { if (!request.signal.aborted) error.value = errorMessage(caught); }
  finally { if (selectionRequest === request) selectionLoading.value = false; }
}, { immediate: true });
watch(stockId, () => { diagnosisRequest?.abort(); outcome.value = undefined; answers.value = []; error.value = ''; });
async function evaluate(nextAnswers: AnswerInput[]) {
  if (!ready.value || lifecycle.signal.aborted) return;
  diagnosisRequest?.abort();
  const request = new AbortController(); diagnosisRequest = request;
  busy.value = true; error.value = '';
  try {
    const result = await api<DiagnosisResponse>(`/health/aquariums/${encodeURIComponent(aquariumId.value)}/diagnosis`, {
      method: 'POST', signal: request.signal, body: { stockId: Number(stockId.value), answers: nextAnswers },
    });
    if (request.signal.aborted) return;
    answers.value = nextAnswers; outcome.value = result;
    await nextTick(); questionHeading.value?.focus();
  } catch (caught) { if (!request.signal.aborted) error.value = errorMessage(caught); }
  finally { if (diagnosisRequest === request) busy.value = false; }
}
function answer(value: AnswerInput['answer']) {
  if (!busy.value && outcome.value?.question) void evaluate([...answers.value, { questionId: outcome.value.question.id, answer: value }]);
}
function back() { if (!busy.value && answers.value.length) void evaluate(answers.value.slice(0, -1)); }
const percentage = (value: number) => new Intl.NumberFormat(language.value, { style: 'percent', maximumFractionDigits: 0 }).format(value);
const answerLabel = (answer: string) => t(`health.${answer}`);
const urgent = computed(() => outcome.value?.automaticAnswers.some(item => item.answer === 'yes' && ['water_bad', 'after_med'].includes(item.questionId))
  || answers.value.some(item => item.answer === 'yes' && ['sudden_deaths', 'gills'].includes(item.questionId)));
</script>
<template>
  <section class="stack health-wizard">
    <p class="muted">{{ t('health.wizardIntro') }}</p>
    <div class="card stack">
      <div class="health-select-grid">
        <label>{{ t('health.aquarium') }}<select v-model="aquariumId" :disabled="busy"><option value="">{{ t('health.chooseAquarium') }}</option><option v-for="aquarium in aquariums" :key="aquarium.id" :value="String(aquarium.id)">{{ aquarium.name }} · {{ aquarium.water_type === 'salt' ? t('health.salt') : t('health.fresh') }}</option></select></label>
        <label>{{ t('health.resident') }}<select v-model="stockId" :disabled="busy || selectionLoading || !aquariumId"><option value="">{{ t('health.chooseResident') }}</option><option v-for="resident in residents" :key="resident.stockId" :value="String(resident.stockId)" :disabled="!resident.supported">{{ resident.name || resident.speciesName }}{{ resident.name ? ` · ${resident.speciesName}` : '' }} · {{ resident.count }} ×{{ resident.supported ? '' : ` (${t('health.unsupported')})` }}</option></select></label>
      </div>
      <p v-if="selectionLoading" role="status">{{ t('common.loading') }}</p>
      <p v-else-if="aquariumId && !residents.length" class="muted">{{ t('health.noResidents') }}</p>
      <p v-else-if="residents.some(item => !item.supported)" class="muted">{{ t('health.unsupportedNote') }}</p>
      <button v-if="!outcome" class="btn" type="button" :disabled="!ready || busy || selectionLoading" @click="evaluate([])">{{ busy ? t('common.loading') : t('health.start') }}</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button v-if="error && ready" class="btn ghost" type="button" :disabled="busy" @click="evaluate([])">{{ t('health.restart') }}</button>
    <template v-if="outcome">
      <p class="compat-box warn">{{ t('health.modelNote') }}</p>
      <p v-if="urgent" class="compat-box crit" role="alert">{{ t('health.urgent') }}</p>
      <details v-if="outcome.automaticAnswers.length" class="card">
        <summary>{{ t('health.automatic') }} ({{ outcome.automaticAnswers.length }})</summary><p class="muted">{{ t('health.measurementAge') }}</p>
        <div v-for="item in outcome.automaticAnswers" :key="item.questionId" class="health-auto-answer"><strong>{{ item.text }}</strong> · {{ answerLabel(item.answer) }}<ul><li v-for="evidence in item.evidence" :key="evidence.param">{{ evidence.label }}: {{ evidence.value }} {{ evidence.unit }} · {{ fmtDate(evidence.measuredAt) }}</li></ul></div>
      </details>
      <div v-if="outcome.question" class="card stack health-question" :aria-busy="busy">
        <span class="muted">{{ t('health.question') }} {{ outcome.answeredCount + 1 }} / {{ outcome.maxQuestions }}</span>
        <h2 ref="questionHeading" tabindex="-1">{{ outcome.question.text }}</h2>
        <p v-if="outcome.question.hint" class="muted">{{ outcome.question.hint }}</p>
        <p v-if="outcome.question.missingParameters.length" class="compat-box warn">{{ t('health.missingValues') }} {{ outcome.question.missingParameters.join(', ') }}. {{ t('health.unknownHint') }}</p>
        <div class="row health-answer-buttons"><button class="btn" type="button" :disabled="busy" @click="answer('yes')">{{ t('health.yes') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="answer('no')">{{ t('health.no') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="answer('unknown')">{{ t('health.unknown') }}</button></div>
      </div>
      <div v-else class="card stack">
        <h2 ref="questionHeading" tabindex="-1">{{ t('health.result') }}</h2>
        <p>{{ outcome.disclaimer }}</p>
        <p v-if="outcome.reason === 'limit' || outcome.reason === 'no_information'" class="muted">{{ t('health.inconclusive') }}</p>
        <div v-for="(result, index) in outcome.results" :key="result.diseaseId" class="health-result" :class="{ primary: index === 0 }">
          <div class="row between"><h3>{{ result.name }}</h3><span class="chip">{{ percentage(result.probability) }} · {{ t('health.modelWeight') }}</span></div>
          <p v-if="result.diseaseId === '_none'">{{ t('health.noneNote') }}</p>
          <template v-else><p v-if="result.susceptibility" class="muted">{{ t('health.susceptibility') }}: {{ result.susceptibility }}</p><ul v-if="result.signs.length"><li v-for="sign in result.signs" :key="sign">{{ sign }}</li></ul><button class="btn small ghost" type="button" @click="selectedDisease = result.diseaseId">{{ t('health.diseaseDetails') }}</button></template>
        </div>
        <p v-for="caution in outcome.caution" :key="caution" class="compat-box warn">{{ caution }}</p>
      </div>
      <div class="row"><button class="btn ghost" type="button" :disabled="busy || !answers.length" @click="back">{{ t('common.back') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="evaluate([])">{{ t('health.restart') }}</button><a class="btn ghost" :href="`#/a/${aquariumId}/messen`">{{ t('health.measureNow') }}</a></div>
    </template>
    <DiseaseDetail v-if="selectedDisease" :disease-id="selectedDisease" :species-id="selectedResident?.speciesId" @close="selectedDisease = undefined" />
  </section>
</template>
