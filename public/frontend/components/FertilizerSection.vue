<script setup lang="ts">
import { reactive, ref } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, errorMessage, fmtDate, toast } from "../state";
import type { Pump } from "../types";
const props = defineProps<{ id: string; fertilizers: Pump[]; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const editing = ref<Pump | null>();
const dosing = ref<Pump>();
const removing = ref<Pump>();
const model = reactive({ name: "", fertilizer_name: "", amount_ml: 2.5, interval_days: 1, time_of_day: "08:00", mode: "manual" as "manual" | "automatic", reminder_mail: false, is_active: true, note: "" });
const error = ref("");
const busy = ref(false);
function edit(pump: Pump | null, mode: "manual" | "automatic" = "manual") {
  error.value = "";
  editing.value = pump;
  Object.assign(model, { mode: pump?.mode || mode, reminder_mail: Boolean(pump?.reminder_mail), name: pump?.name || "", fertilizer_name: pump?.fertilizer_name || "", amount_ml: pump?.amount_ml ?? 2.5, interval_days: pump?.interval_days ?? 1, time_of_day: pump?.time_of_day || "08:00", is_active: pump ? Number(pump.is_active) === 1 : true, note: pump?.note || "" });
}
function close() {
  if (busy.value) return;
  editing.value = undefined;
  dosing.value = undefined;
  removing.value = undefined;
  error.value = "";
}
async function save() {
  if (busy.value || props.readonly) return;
  busy.value = true;
  error.value = "";
  try {
    await api(`/aquariums/${props.id}/fertilizers${editing.value ? "/" + editing.value.id : ""}`, { method: editing.value ? "PUT" : "POST", body: { ...model, reminder_mail: model.mode === "manual" && model.reminder_mail } });
    editing.value = undefined;
    toast(t('fertilizers.saved'));
    emit("changed");
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
async function action() {
  const pump = removing.value || dosing.value;
  if (!pump || busy.value || props.readonly || (!removing.value && pump.mode !== "manual")) return;
  busy.value = true;
  error.value = "";
  try {
    await api(`/aquariums/${props.id}/fertilizers/${pump.id}${removing.value ? "" : "/dose"}`, { method: removing.value ? "DELETE" : "POST", body: removing.value ? undefined : {} });
    toast(t(removing.value ? 'fertilizers.deleted' : 'pumps.recorded'));
    dosing.value = undefined;
    removing.value = undefined;
    emit("changed");
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="card stack">
    <div class="row between">
      <h2 style="margin:0">{{ t('fertilizers.title') }}</h2>
      <div v-if="!readonly" class="row"><button type="button" class="btn small" @click="edit(null, 'manual')">{{ t('fertilizers.addManual') }}</button><button type="button" class="btn small ghost" @click="edit(null, 'automatic')">{{ t('fertilizers.addPump') }}</button></div>
    </div>
    <p class="muted" style="margin:0">{{ t('fertilizers.help') }}</p>
    <p v-if="!fertilizers.length" class="muted">{{ t('fertilizers.empty') }}</p>
    <article v-for="pump in fertilizers" :key="pump.id" class="cycle-card stack">
      <div class="row between"><strong>{{ pump.name }}</strong><span class="chip" :class="Number(pump.is_active) === 1 ? 'ok' : 'none'">{{ t(Number(pump.is_active) === 1 ? 'pumps.active' : 'pumps.paused') }}</span></div>
      <div class="row"><span class="chip info">{{ t(pump.mode === 'manual' ? 'fertilizers.manual' : 'fertilizers.automatic') }}</span><span v-if="pump.mode === 'manual' && pump.reminder_mail" class="chip">{{ t('fertilizers.mail') }}</span></div>
      <div><strong>{{ pump.amount_ml }} ml</strong> {{ pump.fertilizer_name }}</div>
      <div class="muted">{{ pump.interval_days === 1 ? t('pumps.daily') : t('pumps.everyDays', { days: pump.interval_days }) }}{{ pump.time_of_day ? ` · ${pump.time_of_day.slice(0,5)}` : '' }}</div>
      <small v-if="pump.time_of_day && pump.schedule_timezone" class="muted">{{ t('fertilizers.timezone', { zone: pump.schedule_timezone }) }}</small>
      <div v-if="pump.next_due_at">{{ t('fertilizers.next') }}: {{ fmtDate(pump.next_due_at) }}</div>
      <div>{{ t('pumps.last') }}: {{ pump.last_dosed_at ? fmtDate(pump.last_dosed_at) : t('pumps.never') }}</div>
      <p v-if="pump.note" style="margin:0;white-space:pre-wrap">{{ pump.note }}</p>
      <div v-if="!readonly" class="row">
        <button v-if="pump.mode === 'manual'" type="button" class="btn small" :disabled="busy" @click="error = ''; dosing = pump">{{ t('fertilizers.record') }}</button>
        <button class="btn small ghost" :disabled="busy" @click="edit(pump)">{{ t('common.edit') }}</button>
        <button class="btn small ghost danger" :disabled="busy" @click="error = ''; removing = pump">{{ t('common.delete') }}</button>
      </div>
    </article>
    <Modal v-if="editing !== undefined" :title="t(editing ? 'fertilizers.edit' : 'fertilizers.add')" @close="close">
      <form class="stack" @submit.prevent="save">
        <fieldset class="stack pump-fields" :disabled="busy">
          <label>{{ t('fertilizers.mode') }}<select v-model="model.mode"><option value="manual">{{ t('fertilizers.manual') }}</option><option value="automatic">{{ t('fertilizers.automatic') }}</option></select></label>
          <p v-if="model.mode === 'automatic'" class="muted">{{ t('fertilizers.pumpHelp') }}</p>
          <label>{{ t('fertilizers.name') }}<input v-model="model.name" required maxlength="100" :placeholder="t('fertilizers.nameExample')" /></label>
          <label>{{ t('pumps.liquid') }}<input v-model="model.fertilizer_name" required maxlength="100" /></label>
          <label>{{ t('pumps.amount') }}<input v-model.number="model.amount_ml" type="number" min="0.01" max="1000" step="0.01" required /></label>
          <label>{{ t('pumps.interval') }}<input v-model.number="model.interval_days" type="number" min="1" max="365" step="1" required /><small class="muted">{{ t('pumps.intervalHelp') }}</small></label>
          <label>{{ t(model.mode === 'manual' ? 'fertilizers.reminderTime' : 'pumps.time') }}<input v-model="model.time_of_day" type="time" /></label>
          <label v-if="model.mode === 'manual'" class="row"><input v-model="model.reminder_mail" type="checkbox" />{{ t('fertilizers.mail') }}</label>
          <label class="row"><input v-model="model.is_active" type="checkbox" />{{ t('pumps.activePlan') }}</label>
          <label>{{ t('common.notes') }}<textarea v-model="model.note" rows="3" maxlength="500" /></label>
        </fieldset>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :disabled="busy">{{ t(busy ? 'common.loading' : 'common.save') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="close">{{ t('common.cancel') }}</button></div>
      </form>
    </Modal>
    <Modal v-if="dosing || removing" :title="t(removing ? 'fertilizers.deleteTitle' : 'fertilizers.record')" @close="close">
      <form class="stack" @submit.prevent="action">
        <p v-if="removing">{{ t('fertilizers.deleteConfirm', { name: removing.name }) }}</p>
        <template v-else-if="dosing"><p>{{ t('fertilizers.recordConfirm', { amount: dosing.amount_ml, liquid: dosing.fertilizer_name, name: dosing.name }) }}</p><p class="muted">{{ t('fertilizers.recordHelp') }}</p></template>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :class="{ danger: removing }" :disabled="busy">{{ t(busy ? 'common.loading' : removing ? 'common.delete' : 'fertilizers.record') }}</button><button type="button" class="btn ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</button></div>
      </form>
    </Modal>
  </section>
</template>
<style scoped>
.pump-fields { border:0; padding:0; margin:0; min-width:0; }
</style>
