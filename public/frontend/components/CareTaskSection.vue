<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { enqueueMaintenance } from "../offline-sync";
import { registerMessages, session, t, errorMessage, toast, language } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
import { CARE_TASK_EXCLUDED_TYPES, localDate } from "../../../src/shared/care-tasks";
import type { CareTask } from "../types";
const props = defineProps<{ id: string; tasks: CareTask[]; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const editing = ref<CareTask | null>();
const completing = ref<CareTask>();
const removing = ref<CareTask>();
const error = ref(""), busy = ref(false);
const model = reactive({ type: "water_change", title: "", interval: 1, unit: "weeks" as CareTask["unit"], start_date: localDate(new Date()), time_of_day: "", note: "", is_active: true });
const types = computed(() => Object.entries(session.config?.maintenanceTypes || {}).filter(([key]) => !CARE_TASK_EXCLUDED_TYPES.includes(key)));
const label = (task: CareTask) => task.title || session.config?.maintenanceTypes?.[task.type]?.label || task.type;
const icon = (task: CareTask) => session.config?.maintenanceTypes?.[task.type]?.icon || "📝";
const sorted = computed(() => [...props.tasks].sort((a, b) => Number(b.is_active) - Number(a.is_active) || String(a.next_due_date || "9").localeCompare(String(b.next_due_date || "9"))));
const fmtDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(language.value === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const every = (task: Pick<CareTask, "interval" | "unit">) => t(`careTasks.every.${task.unit}`, { count: task.interval });
function status(task: CareTask) {
  if (!task.is_active) return { cls: "none", text: t("careTasks.paused") };
  if (task.days_remaining == null) return { cls: "none", text: "" };
  if (task.days_remaining < 0) return { cls: "crit", text: t("careTasks.overdue", { days: -task.days_remaining }) };
  if (task.days_remaining === 0) return { cls: "warn", text: t("careTasks.dueToday") };
  return { cls: "ok", text: t("careTasks.dueIn", { days: task.days_remaining }) };
}
function edit(task: CareTask | null) {
  error.value = "";
  Object.assign(model, task
    ? { type: task.type, title: task.title || "", interval: task.interval, unit: task.unit, start_date: task.start_date, time_of_day: task.time_of_day || "", note: task.note || "", is_active: Boolean(task.is_active) }
    : { type: types.value[0]?.[0] || "water_change", title: "", interval: 1, unit: "weeks", start_date: localDate(new Date()), time_of_day: "", note: "", is_active: true });
  editing.value = task;
}
function close() {
  if (busy.value) return;
  editing.value = undefined;completing.value = undefined;removing.value = undefined;error.value = "";
}
async function run(work: () => Promise<unknown>, message: string) {
  if (busy.value || props.readonly) return;
  busy.value = true;error.value = "";
  try {
    await work();
    toast(t(message));
    editing.value = undefined;completing.value = undefined;removing.value = undefined;
    emit("changed");
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
const save = () => run(() => api(`/aquariums/${props.id}/tasks${editing.value ? "/" + editing.value.id : ""}`, { method: editing.value ? "PUT" : "POST", body: { ...model, title: model.title.trim(), time_of_day: model.time_of_day || null } }), "careTasks.saved");
const remove = () => run(() => api(`/aquariums/${props.id}/tasks/${removing.value!.id}`, { method: "DELETE" }), "careTasks.deleted");
// Completing a task records the matching logbook entry; the next due date follows from it.
const complete = () => run(() => enqueueMaintenance(props.id, { type: completing.value!.type, logged_at: new Date().toISOString(), percentage: null, details: completing.value!.title || "", note: "" }), "careTasks.completed");
</script>
<template>
  <section class="card stack" data-care-tasks>
    <div class="row between">
      <h2 style="margin:0">{{ t("careTasks.title") }}</h2>
      <button v-if="!readonly" type="button" class="btn small" @click="edit(null)">{{ t("careTasks.add") }}</button>
    </div>
    <p class="muted" style="margin:0">{{ t("careTasks.help") }}</p>
    <p v-if="!tasks.length" class="muted">{{ t("careTasks.empty") }}</p>
    <article v-for="task in sorted" :key="task.id" class="cycle-card stack care-task">
      <div class="row between"><strong>{{ icon(task) }} {{ label(task) }}</strong><span v-if="status(task).text" class="chip" :class="status(task).cls">{{ status(task).text }}</span></div>
      <div class="muted">{{ every(task) }}{{ task.time_of_day ? ` · ${task.time_of_day}` : "" }}</div>
      <div v-if="task.next_due_date">{{ t("careTasks.next") }}: {{ fmtDay(task.next_due_date) }}</div>
      <div class="muted">{{ t("careTasks.last") }}: {{ task.last_done_at ? new Date(task.last_done_at).toLocaleDateString() : t("careTasks.never") }}</div>
      <p v-if="task.note" style="margin:0;white-space:pre-wrap">{{ task.note }}</p>
      <div v-if="!readonly" class="row">
        <button v-if="task.is_active" type="button" class="btn small" :disabled="busy" @click="error = ''; completing = task">{{ t("careTasks.complete") }}</button>
        <button type="button" class="btn small ghost" :disabled="busy" @click="edit(task)">{{ t("common.edit") }}</button>
        <button type="button" class="btn small ghost danger" :disabled="busy" @click="error = ''; removing = task">{{ t("common.delete") }}</button>
      </div>
    </article>
    <Modal v-if="editing !== undefined" :title="t(editing ? 'careTasks.edit' : 'careTasks.add')" @close="close">
      <form class="stack" @submit.prevent="save">
        <fieldset class="stack task-fields" :disabled="busy">
          <label>{{ t("careTasks.type") }}<select v-model="model.type" required><option v-for="[key, item] in types" :key="key" :value="key">{{ item.icon }} {{ item.label }}</option></select></label>
          <small class="muted">{{ t("careTasks.typeHelp") }}</small>
          <label>{{ t("careTasks.customTitle") }}<input v-model="model.title" maxlength="80" :placeholder="t('careTasks.customTitlePlaceholder')" /></label>
          <div class="row task-interval">
            <label>{{ t("careTasks.interval") }}<input v-model.number="model.interval" type="number" min="1" :max="model.unit === 'months' ? 24 : 365" step="1" required /></label>
            <label>{{ t("careTasks.unit") }}<select v-model="model.unit"><option value="days">{{ t("common.days") }}</option><option value="weeks">{{ t("common.weeks") }}</option><option value="months">{{ t("careTasks.months") }}</option></select></label>
          </div>
          <label>{{ t("careTasks.startDate") }}<input v-model="model.start_date" type="date" required /><small class="muted">{{ t("careTasks.startHelp") }}</small></label>
          <label>{{ t("careTasks.time") }}<input v-model="model.time_of_day" type="time" /><small class="muted">{{ t("careTasks.timeHelp") }}</small></label>
          <label class="row"><input v-model="model.is_active" type="checkbox" />{{ t("careTasks.active") }}</label>
          <label>{{ t("common.notes") }}<textarea v-model="model.note" rows="3" maxlength="500" /></label>
        </fieldset>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :disabled="busy">{{ t(busy ? "common.loading" : "common.save") }}</button><button class="btn ghost" type="button" :disabled="busy" @click="close">{{ t("common.cancel") }}</button></div>
      </form>
    </Modal>
    <Modal v-if="completing || removing" :title="t(removing ? 'careTasks.deleteTitle' : 'careTasks.complete')" @close="close">
      <form class="stack" @submit.prevent="removing ? remove() : complete()">
        <p v-if="removing">{{ t("careTasks.deleteConfirm", { name: label(removing) }) }}</p>
        <p v-else-if="completing">{{ t("careTasks.completeConfirm", { name: label(completing) }) }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :class="{ danger: removing }" :disabled="busy">{{ t(busy ? "common.loading" : removing ? "common.delete" : "careTasks.complete") }}</button><button type="button" class="btn ghost" :disabled="busy" @click="close">{{ t("common.cancel") }}</button></div>
      </form>
    </Modal>
  </section>
</template>
<style scoped>
.task-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.task-interval > label { flex: 1 1 8rem; }
</style>
