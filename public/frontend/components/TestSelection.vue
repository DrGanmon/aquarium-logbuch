<script setup lang="ts">
import { computed, ref } from "vue";
import { session, t } from "../state";
import { selectTest } from "../composables/test-selection";
const model = defineModel<string[]>({ required: true });
const suites = computed(() => session.config?.suites || []);
const browseSuite = ref(session.config?.userPreferences.selectedSuite || suites.value[0]?.id || "");
const currentSuite = computed(() => suites.value.find(suite => suite.id === browseSuite.value));
function addSuite(replace: boolean) {
  let next = replace ? [] : [...model.value];
  for (const test of currentSuite.value?.tests || []) next = selectTest(next, `${browseSuite.value}:${test.key}`, true);
  model.value = next;
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
          @change="model = selectTest(model, `${browseSuite}:${test.key}`, ($event.target as HTMLInputElement).checked)" />
        {{ test.name }} <span v-if="test.wait" class="muted">({{ test.wait }} s)</span>
      </label>
    </div>
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
