<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { api } from '../api';
import { t, language, errorMessage, fmtDate, session } from '../state';
import type { Aquarium } from '../types';
import type { AnswerInput, DiagnosisResponse, HealthResident, ResidentResponse } from '../health-types';
import DiseaseDetail from './DiseaseDetail.vue';
const ChatDialog = lazyComponent(() => import("./ChatDialog.vue"));

const showHealthChat = ref(false);
const props = defineProps<{ initialAquariumId?: string; initialStockId?: string }>();
const aquariums = ref<Aquarium[]>([]);
const aquariumsLoading = ref(true);
const aquariumId = ref(props.initialAquariumId || '');
const stockId = ref(props.initialStockId || '');
const residents = ref<HealthResident[]>([]);
const selectionLoading = ref(false);
const busy = ref(false);
const error = ref('');
const outcome = ref<DiagnosisResponse>();
const answers = ref<AnswerInput[]>([]);
watch(() => outcome.value?.complete, complete => { if (!complete) showHealthChat.value = false; });
const answerHistory = ref<{ questionId: string; text: string; answer: AnswerInput['answer'] }[]>([]);
const chatDiagnosis = computed(() => outcome.value?.complete && outcome.value.aiChat ? {
  stockId: Number(stockId.value), answers: [...answers.value], ...outcome.value.aiChat,
  context: JSON.stringify({ aquarium: outcome.value.aquarium, resident: outcome.value.resident,
    measurements: outcome.value.measurements, answers: [...outcome.value.automaticAnswers, ...answerHistory.value],
    probableDiagnoses: outcome.value.results, disclaimer: outcome.value.disclaimer }, null, 2),
} : undefined);
const selectionStep = ref(props.initialAquariumId ? 2 : 1);
const currentStep = computed(() => outcome.value ? 3 : selectionStep.value);
const steps = computed(() => [t('health.aquarium'), t('health.resident'), t('health.symptoms')]);
function changeSelection(step: number) {
  diagnosisRequest?.abort(); busy.value = false;
  outcome.value = undefined; answers.value = []; answerHistory.value = []; selectionStep.value = step;
}
function chooseAquarium(id: Aquarium['id']) {
  if (String(id) !== aquariumId.value) stockId.value = '';
  aquariumId.value = String(id); selectionStep.value = 2;
}
function measurementInfo(parameter: string) {
  const configured = session.config?.parameters.find(item => item.key === parameter);
  const evidence = outcome.value?.automaticAnswers.flatMap(item => item.evidence).find(item => item.param === parameter);
  return { label: evidence?.label || configured?.name || parameter, unit: evidence?.unit || configured?.unit || '' };
}
function oldMeasurement(date: string) {
  const time = new Date(date).getTime();
  return !Number.isFinite(time) || Date.now() - time > 24 * 60 * 60 * 1000 || time > Date.now() + 5 * 60 * 1000;
}
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
  finally { aquariumsLoading.value = false; }
});
watch([aquariumId, language], async () => {
  selectionRequest?.abort(); diagnosisRequest?.abort(); busy.value = false;
  outcome.value = undefined; answers.value = []; answerHistory.value = []; residents.value = []; error.value = '';
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
watch(stockId, () => { diagnosisRequest?.abort(); busy.value = false; outcome.value = undefined; answers.value = []; answerHistory.value = []; error.value = ''; });
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
    const previousQuestion = outcome.value?.question;
    const history = answerHistory.value.slice(0, nextAnswers.length);
    const last = nextAnswers[nextAnswers.length - 1];
    if (previousQuestion && last && nextAnswers.length > answers.value.length) history.push({ ...last, text: previousQuestion.text });
    answerHistory.value = history;
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
    <ol class="health-steps" :aria-label="t('health.wizard')">
      <li v-for="(step, index) in steps" :key="index" :class="{ active: currentStep === index + 1, done: currentStep > index + 1 }" :aria-current="currentStep === index + 1 ? 'step' : undefined"><span>{{ index + 1 }}</span>{{ step }}</li>
    </ol>
    <div v-if="!outcome" class="card stack health-selection">
      <template v-if="selectionStep === 1">
        <h2>{{ t('health.chooseAquarium') }}</h2>
        <div class="health-choice-grid">
          <button v-for="aquarium in aquariums" :key="aquarium.id" class="health-choice" type="button" @click="chooseAquarium(aquarium.id)"><strong>{{ aquarium.name }}</strong><span class="muted">{{ aquarium.water_type === 'salt' ? t('health.salt') : t('health.fresh') }}</span><span aria-hidden="true">→</span></button>
        </div>
        <p v-if="aquariumsLoading" role="status">{{ t('common.loading') }}</p>
        <p v-else-if="!aquariums.length" class="muted">{{ t('health.noAquariums') }}</p>
      </template>
      <template v-else>
        <div class="row between"><h2>{{ t('health.chooseResident') }}</h2><button class="btn small ghost" type="button" :disabled="busy" @click="changeSelection(1)">{{ t('health.changeAquarium') }}</button></div>
        <p class="muted">{{ aquariums.find(item => String(item.id) === aquariumId)?.name }}</p>
        <p v-if="selectionLoading" role="status">{{ t('common.loading') }}</p>
        <div v-else class="health-choice-grid">
          <button v-for="resident in residents" :key="resident.stockId" class="health-choice" :class="{ selected: stockId === String(resident.stockId) }" type="button" :aria-pressed="stockId === String(resident.stockId)" :disabled="busy || !resident.supported" @click="stockId = String(resident.stockId)"><strong>{{ resident.name || resident.speciesName }}</strong><span class="muted">{{ resident.name ? resident.speciesName + ' · ' : '' }}{{ resident.count }} ×</span><span v-if="!resident.supported" class="muted">{{ t('health.unsupported') }}</span></button>
        </div>
        <p v-if="!selectionLoading && !residents.length" class="muted">{{ t('health.noResidents') }}</p>
        <p v-else-if="residents.some(item => !item.supported)" class="muted">{{ t('health.unsupportedNote') }}</p>
        <button class="btn" type="button" :disabled="!ready || busy || selectionLoading" @click="evaluate([])">{{ busy ? t('common.loading') : t('health.start') }}</button>
      </template>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button v-if="error && ready" class="btn ghost" type="button" :disabled="busy" @click="evaluate([])">{{ t('health.restart') }}</button>
    <template v-if="outcome">
      <p class="compat-box warn">{{ t('health.modelNote') }}</p>
      <p v-if="urgent" class="compat-box crit" role="alert">{{ t('health.urgent') }}</p>
      <section class="card stack health-context">
        <div class="row between"><div><span class="muted">{{ outcome.aquarium.name }}</span><h2>{{ outcome.resident.name || outcome.resident.speciesName }}</h2><span v-if="outcome.resident.name" class="muted">{{ outcome.resident.speciesName }}</span></div><button class="btn small ghost" type="button" :disabled="busy" @click="changeSelection(2)">{{ t('health.changeResident') }}</button></div>
        <h3>{{ t('health.latestWater') }}</h3>
        <div v-if="outcome.measurements.length" class="health-water-grid">
          <div v-for="item in outcome.measurements" :key="item.parameter" class="health-water-value" :class="{ stale: oldMeasurement(item.measured_at) }"><span class="muted">{{ measurementInfo(item.parameter).label }}</span><strong>{{ item.value }} <small>{{ measurementInfo(item.parameter).unit }}</small></strong><time :datetime="item.measured_at">{{ fmtDate(item.measured_at) }}</time><span v-if="oldMeasurement(item.measured_at)" class="health-stale-label">{{ t('health.outdated') }}</span></div>
        </div>
        <p v-else class="muted">{{ t('health.noWaterValues') }}</p>
        <p class="muted health-context-note">{{ t('health.measurementAge') }}</p>
        <h3>{{ t('health.answersSoFar') }}</h3>
        <ul v-if="answerHistory.length || outcome.automaticAnswers.length" class="health-answer-history">
          <li v-for="item in outcome.automaticAnswers" :key="'auto-' + item.questionId"><span>{{ item.text }}<small>{{ t('health.automatic') }}</small></span><strong class="chip">{{ answerLabel(item.answer) }}</strong></li>
          <li v-for="item in answerHistory" :key="item.questionId"><span>{{ item.text }}</span><strong class="chip">{{ answerLabel(item.answer) }}</strong></li>
        </ul>
        <p v-else class="muted">{{ t('health.noAnswersYet') }}</p>
      </section>
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
        <div v-if="chatDiagnosis" class="health-chat-offer stack">
          <h3>{{ t('health.aiChat') }}</h3>
          <p>{{ t('health.chatIntro') }}</p>
          <p class="muted">{{ t('health.chatNotSaved') }}</p>
          <button class="btn" type="button" @click="showHealthChat = true">{{ t('health.openChat') }}</button>
        </div>
        <p v-for="caution in outcome.caution" :key="caution" class="compat-box warn">{{ caution }}</p>
      </div>
      <div class="row"><button class="btn ghost" type="button" :disabled="busy || !answers.length" @click="back">{{ t('common.back') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="evaluate([])">{{ t('health.restart') }}</button><a class="btn ghost" :href="`#/a/${aquariumId}/messen`">{{ t('health.measureNow') }}</a></div>
    </template>
    <ChatDialog v-if="showHealthChat && chatDiagnosis" :id="aquariumId" :name="outcome?.resident.name || outcome?.resident.speciesName || ''" :readonly="true" :diagnosis="chatDiagnosis" @close="showHealthChat = false" />
    <DiseaseDetail v-if="selectedDisease" :disease-id="selectedDisease" :species-id="selectedResident?.speciesId" @close="selectedDisease = undefined" />
  </section>
</template>
