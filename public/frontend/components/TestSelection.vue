<script setup lang="ts">
import { deviceText as dt } from "../composables/device-guide-labels";
import { computed, ref, watch } from "vue";
import { session, t } from "../state";
import { lazyComponent } from "../composables/lazy-component";
import type { Suite } from "../types";
import { selectTest } from "../composables/test-selection";
const DeviceSetupWizard = lazyComponent(() => import("./DeviceSetupWizard.vue"));
const wizard = ref<Suite | null>(null);
const deviceSuites = computed(() => suites.value.filter(suite => suite.deviceGuide && model.value.some(reference => reference.startsWith(`${suite.id}:`))));
watch(() => session.user?.id, () => { wizard.value = null; });
function changeTest(reference: string, enabled: boolean) {
  const alreadySelected = model.value.includes(reference);
  model.value = selectTest(model.value, reference, enabled);
  if (enabled && !alreadySelected && currentSuite.value?.deviceGuide) wizard.value = currentSuite.value;
}
const model = defineModel<string[]>({ required: true });
const suites = computed(() => session.config?.suites || []);
const browseSuite = ref(session.config?.userPreferences.selectedSuite || suites.value[0]?.id || "");
const currentSuite = computed(() => suites.value.find(suite => suite.id === browseSuite.value));
function addSuite(replace: boolean) {
  let next = replace ? [] : [...model.value];
  for (const test of currentSuite.value?.tests || []) next = selectTest(next, `${browseSuite.value}:${test.key}`, true);
  model.value = next;
  if (currentSuite.value?.deviceGuide) wizard.value = currentSuite.value;
}
</script>
<template>
  <div class="stack">
    <p class="muted">{{ t("testSelection.description") }}</p>
    <label>{{ t("measure.suiteLabel") }}
      <select v-model="browseSuite">
        <option v-for="suite in suites" :key="suite.id" :value="suite.id">{{ suite.name }}</option>
      </select>
    </label>
    <div class="row">
      <button type="button" class="btn small ghost" @click="addSuite(true)">{{ t("testSelection.useSuite") }}</button>
      <button type="button" class="btn small ghost" @click="addSuite(false)">{{ t("testSelection.addSuite") }}</button>
      <button type="button" class="btn small ghost" @click="model = []">{{ t("testSelection.clear") }}</button>
    </div>
    <div class="picker">
      <label v-for="test in currentSuite?.tests" :key="`${browseSuite}:${test.key}`">
        <input type="checkbox" :checked="model.includes(`${browseSuite}:${test.key}`)"
          @change="changeTest(`${browseSuite}:${test.key}`, ($event.target as HTMLInputElement).checked)" />
        {{ test.name }} <span v-if="test.wait" class="muted">({{ test.wait }} s)</span>
      </label>
    </div>
    <div v-for="suite in deviceSuites" :key="suite.id" class="row">
      <button type="button" class="btn small ghost" @click="wizard = suite">{{ dt("open", { name: suite.name }) }}</button>
    </div>
    <DeviceSetupWizard v-if="wizard" :key="wizard.id" :suite="wizard"
      :parameters="model.filter(reference => reference.startsWith(`${wizard!.id}:`)).map(reference => reference.split(':')[1]!)"
      @close="wizard = null" />
    <p>{{ t("testSelection.selected", { count: model.length }) }}</p>
    <ul v-if="model.length">
      <template v-for="suite in suites" :key="suite.id">
        <template v-for="test in suite.tests" :key="test.key">
          <li v-if="model.includes(`${suite.id}:${test.key}`)">
            {{ test.name }} — {{ suite.name }}
            <button type="button" class="btn small ghost" :aria-label="t('testSelection.remove', { name: test.name })"
              @click="model = selectTest(model, `${suite.id}:${test.key}`, false)">✕</button>
          </li>
        </template>
      </template>
    </ul>
  </div>
</template>
