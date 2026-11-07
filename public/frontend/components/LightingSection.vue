<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { registerMessages, t, errorMessage, toast } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
import { LIGHT_CHANNELS, brightnessAt, lightingSummary, previewColor, validateLightingInput, MAX_RAMP_MINUTES, type LightingInput } from "../../../src/shared/lighting";
import type { Lighting } from "../types";
const props = defineProps<{ id: string; lighting: Lighting | null; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const editing = ref(false), removing = ref(false), busy = ref(false), error = ref("");
const model = reactive({ red: 30, green: 40, blue: 50, white: 80, start_time: "10:00", end_time: "20:00", sunrise_minutes: 30, sunset_minutes: 30, note: "" });
const colors: Record<string, string> = { red: "#e5484d", green: "#30a46c", blue: "#3e63dd", white: "#9ba1a6" };
const draft = computed(() => validateLightingInput(model));
const draftSummary = computed(() => draft.value.value ? lightingSummary(draft.value.value) : null);
const hours = (minutes: number) => t("lighting.duration", { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, "0") });
/** 24-hour brightness curve as SVG path (x: minutes 0–1440, y: 0–100). */
function curve(lighting: Pick<LightingInput, "start_time" | "end_time" | "sunrise_minutes" | "sunset_minutes">) {
  const points: string[] = [];
  for (let minute = 0; minute <= 1440; minute += 5) points.push(`${minute},${(100 - brightnessAt(lighting, minute % 1440) * 100).toFixed(1)}`);
  return `M0,100 L${points.join(" L")} L1440,100 Z`;
}
const shown = computed(() => editing.value ? (draft.value.value ? { ...draft.value.value, ...lightingSummary(draft.value.value) } : null) : props.lighting);
function edit() {
  error.value = "";
  if (props.lighting) Object.assign(model, { ...props.lighting, note: props.lighting.note || "" });
  editing.value = true;
}
async function run(work: () => Promise<unknown>, message: string) {
  if (busy.value || props.readonly) return;
  busy.value = true;error.value = "";
  try { await work();toast(t(message));editing.value = false;removing.value = false;emit("changed"); }
  catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
const save = () => {
  if (draft.value.error) { error.value = draft.value.error;return; }
  return run(() => api(`/aquariums/${props.id}/lighting`, { method: "PUT", body: { ...model, note: model.note.trim() } }), "lighting.saved");
};
const remove = () => run(() => api(`/aquariums/${props.id}/lighting`, { method: "DELETE" }), "lighting.deleted");
</script>
<template>
  <section class="card stack" data-lighting>
    <div class="row between">
      <h2 style="margin:0">💡 {{ t("lighting.title") }}</h2>
      <button v-if="!readonly" type="button" class="btn small" :class="{ ghost: lighting }" @click="edit">{{ t(lighting ? "common.edit" : "lighting.add") }}</button>
    </div>
    <p v-if="!lighting" class="muted" style="margin:0">{{ t("lighting.empty") }}</p>
    <template v-else>
      <div class="lighting-overview">
        <div class="lighting-swatch" :style="{ background: previewColor(lighting) }" :title="t('lighting.preview')" role="img" :aria-label="t('lighting.preview')"></div>
        <div class="lighting-channels">
          <div v-for="channel in LIGHT_CHANNELS" :key="channel" class="lighting-channel">
            <span>{{ t(`lighting.${channel}`) }}</span>
            <span class="lighting-bar"><span :style="{ width: `${lighting[channel]}%`, background: colors[channel] }"></span></span>
            <strong>{{ lighting[channel] }} %</strong>
          </div>
        </div>
      </div>
      <dl class="lighting-times">
        <div><dt>{{ t("lighting.start") }}</dt><dd>{{ lighting.start_time }}</dd></div>
        <div><dt>{{ t("lighting.sunrise") }}</dt><dd>{{ t("lighting.minutes", { count: lighting.sunrise_minutes }) }}</dd></div>
        <div><dt>{{ t("lighting.full") }}</dt><dd>{{ lighting.full_from }}–{{ lighting.full_until }}</dd></div>
        <div><dt>{{ t("lighting.sunset") }}</dt><dd>{{ t("lighting.minutes", { count: lighting.sunset_minutes }) }}</dd></div>
        <div><dt>{{ t("lighting.end") }}</dt><dd>{{ lighting.end_time }}</dd></div>
        <div><dt>{{ t("lighting.photoperiod") }}</dt><dd>{{ hours(lighting.photoperiod_minutes) }}</dd></div>
      </dl>
      <svg class="lighting-curve" viewBox="0 0 1440 100" preserveAspectRatio="none" role="img" :aria-label="t('lighting.curve')">
        <path :d="curve(lighting)" :fill="previewColor(lighting)" fill-opacity=".9" stroke="#f2b84b" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="lighting-axis muted" aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <p v-if="lighting.note" style="margin:0;white-space:pre-wrap">{{ lighting.note }}</p>
      <div v-if="!readonly"><button type="button" class="btn small ghost danger" :disabled="busy" @click="error = ''; removing = true">{{ t("common.delete") }}</button></div>
    </template>
    <Modal v-if="editing" :title="t('lighting.edit')" @close="busy || (editing = false)">
      <form class="stack" @submit.prevent="save">
        <fieldset class="stack lighting-fields" :disabled="busy">
          <legend class="muted">{{ t("lighting.channelsHelp") }}</legend>
          <label v-for="channel in LIGHT_CHANNELS" :key="channel" class="lighting-slider">
            <span>{{ t(`lighting.${channel}`) }}</span>
            <input v-model.number="model[channel]" type="range" min="0" max="100" step="1" :style="{ accentColor: colors[channel] }" :aria-label="t(`lighting.${channel}`)" />
            <span class="row lighting-number"><input v-model.number="model[channel]" type="number" min="0" max="100" step="1" required :aria-label="`${t(`lighting.${channel}`)} (%)`" /> %</span>
          </label>
          <div class="row lighting-pair">
            <label>{{ t("lighting.start") }}<input v-model="model.start_time" type="time" required /></label>
            <label>{{ t("lighting.end") }}<input v-model="model.end_time" type="time" required /></label>
          </div>
          <div class="row lighting-pair">
            <label>{{ t("lighting.sunriseMinutes") }}<input v-model.number="model.sunrise_minutes" type="number" min="0" :max="MAX_RAMP_MINUTES" step="1" required /></label>
            <label>{{ t("lighting.sunsetMinutes") }}<input v-model.number="model.sunset_minutes" type="number" min="0" :max="MAX_RAMP_MINUTES" step="1" required /></label>
          </div>
          <small class="muted">{{ t("lighting.rampHelp") }}</small>
          <label>{{ t("common.notes") }}<textarea v-model="model.note" rows="2" maxlength="500" :placeholder="t('lighting.notePlaceholder')" /></label>
        </fieldset>
        <div v-if="shown" class="stack lighting-preview">
          <svg class="lighting-curve" viewBox="0 0 1440 100" preserveAspectRatio="none" role="img" :aria-label="t('lighting.curve')">
            <path :d="curve(shown)" :fill="previewColor(shown)" fill-opacity=".9" stroke="#f2b84b" stroke-width="2" vector-effect="non-scaling-stroke" />
          </svg>
          <small v-if="draftSummary" class="muted">{{ t("lighting.summary", { from: draftSummary.full_from, until: draftSummary.full_until, total: hours(draftSummary.photoperiod_minutes) }) }}</small>
        </div>
        <p v-else-if="draft.error" class="error">{{ draft.error }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :disabled="busy">{{ t(busy ? "common.loading" : "common.save") }}</button><button class="btn ghost" type="button" :disabled="busy" @click="editing = false">{{ t("common.cancel") }}</button></div>
      </form>
    </Modal>
    <Modal v-if="removing" :title="t('lighting.deleteTitle')" @close="busy || (removing = false)">
      <form class="stack" @submit.prevent="remove">
        <p>{{ t("lighting.deleteConfirm") }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn danger" :disabled="busy">{{ t(busy ? "common.loading" : "common.delete") }}</button><button type="button" class="btn ghost" :disabled="busy" @click="removing = false">{{ t("common.cancel") }}</button></div>
      </form>
    </Modal>
  </section>
</template>
<style scoped>
.lighting-overview { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.lighting-swatch { width: 64px; height: 64px; border-radius: 50%; border: 1px solid var(--line); box-shadow: 0 0 18px rgba(0, 0, 0, .12) inset; flex: none; }
.lighting-channels { flex: 1 1 260px; display: grid; gap: .35rem; }
.lighting-channel { display: grid; grid-template-columns: 4.5rem 1fr 3.5rem; gap: .6rem; align-items: center; }
.lighting-channel strong { text-align: right; }
.lighting-bar { height: .55rem; background: var(--line); border-radius: 99px; overflow: hidden; }
.lighting-bar > span { display: block; height: 100%; border-radius: 99px; }
.lighting-times { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: .5rem 1rem; margin: 0; }
.lighting-times dt { font-size: .8rem; color: var(--muted, inherit); }
.lighting-times dd { margin: 0; font-weight: 600; }
.lighting-curve { width: 100%; height: 90px; border-radius: 10px; background: linear-gradient(#0f1b2d, #1c2f4a); border: 1px solid var(--line); display: block; }
.lighting-axis { display: flex; justify-content: space-between; font-size: .75rem; }
.lighting-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.lighting-slider { display: grid; grid-template-columns: 4.5rem 1fr auto; gap: .6rem; align-items: center; }
.lighting-number input { width: 4.5rem; }
.lighting-pair > label { flex: 1 1 8rem; }
@media (max-width: 480px) { .lighting-slider { grid-template-columns: 1fr auto; } .lighting-slider > input[type="range"] { grid-column: 1 / -1; grid-row: 2; } }
</style>
