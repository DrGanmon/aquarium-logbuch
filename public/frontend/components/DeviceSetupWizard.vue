<script setup lang="ts">
import { deviceText as dt } from "../composables/device-guide-labels";
import { computed, ref, watch } from 'vue';
import type { Suite } from '../types';
import { language, session, t } from '../state';
import { deviceGuideSteps } from '../../../src/shared/device-guide';
import Modal from './Modal.vue';
const props = defineProps<{ suite: Suite; parameters: string[]; returnToTest?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const mode = ref<'all' | 'beforeUse'>('all');
const index = ref(0);
const confirmed = ref(false);
const steps = computed(() => {
  const guide = props.suite.deviceGuide;
  if (!guide) return [];
  return deviceGuideSteps(guide, props.parameters).filter(s => mode.value === 'all' || s.phase === 'beforeUse');
});
const current = computed(() => steps.value[index.value]);
const done = computed(() => index.value >= steps.value.length);
const units = computed(() => props.suite.tests?.filter(test => props.parameters.includes(test.key)) || []);
watch([index, mode], () => { confirmed.value = false; });
watch(mode, () => { index.value = 0; });
watch(() => session.user?.id, () => emit('close'));
function next() {
  if (!confirmed.value) return;
  index.value++;
  if (done.value && props.returnToTest) emit("close");
}
</script>
<template>
  <Modal :title="`${dt('title')} — ${suite.name}`" wide @close="emit('close')">
    <p v-if="returnToTest" role="status">{{ dt("testPaused") }}</p>
    <p class="muted">{{ dt('scope') }}</p>
    <label>{{ dt('mode') }}
      <select v-model="mode">
        <option value="all">{{ dt('all') }}</option>
        <option value="beforeUse">{{ dt('beforeUse') }}</option>
      </select>
    </label>
    <template v-if="current && !done">
      <p role="status">{{ dt('progress', { current: index + 1, total: steps.length }) }} · {{ dt(current.phase) }}</p>
      <progress :value="index" :max="steps.length" style="width: 100%" :aria-label="dt('progressLabel')" />
      <section :key="current.id" class="stack" aria-live="polite">
        <h3>{{ current.title[language] }}</h3>
        <p style="white-space: pre-line">{{ current.text[language] }}</p>
        <label class="row">
          <input v-model="confirmed" type="checkbox" />
          {{ dt('confirm') }}
        </label>
      </section>
      <div class="row between">
        <button type="button" class="btn ghost" :disabled="index === 0" @click="index--">{{ dt('back') }}</button>
        <button type="button" class="btn" :disabled="!confirmed" @click="next">{{ dt(returnToTest && index === steps.length - 1 ? 'finishAndResume' : 'next') }}</button>
      </div>
    </template>
    <div v-else class="stack" role="status">
      <h3>{{ dt('finished') }}</h3>
      <p>{{ dt('finishedHint') }}</p>
      <div class="row">
        <button type="button" class="btn ghost" @click="index = 0">{{ dt('restart') }}</button>
        <button type="button" class="btn" @click="emit('close')">{{ t('common.close') }}</button>
      </div>
    </div>
    <details>
      <summary>{{ dt('units') }}</summary>
      <ul><li v-for="test in units" :key="test.key"><strong>{{ test.name }}{{ test.unit ? ` (${test.unit})` : '' }}</strong>: {{ test.hint }}</li></ul>
    </details>
    <p class="muted">{{ dt('pauseHint') }}</p>
    <details>
      <summary>{{ dt('sources') }} ({{ suite.deviceGuide?.revision.split('.')[0] }})</summary>
      <ul><li v-for="source in suite.deviceGuide?.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a></li></ul>
      <p>{{ dt('sourceHint') }}</p>
    </details>
  </Modal>
</template>
