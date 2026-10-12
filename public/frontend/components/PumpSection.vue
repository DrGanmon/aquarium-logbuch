<script setup lang="ts">
import { reactive, ref } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api";
import { t, errorMessage, fmtDate, toast } from "../state";
import type { Pump } from "../types";
const props = defineProps<{ id: string; pumps: Pump[]; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const editing = ref<Pump | null>();
const dosing = ref<Pump>();
const removing = ref<Pump>();
const model = reactive({ name: "", fertilizer_name: "", amount_ml: 2.5, interval_days: 1, time_of_day: "08:00", is_active: true, note: "" });
const error = ref("");
const busy = ref(false);
function edit(pump: Pump | null) {
  error.value = "";
  editing.value = pump;
  Object.assign(model, { name: pump?.name || "", fertilizer_name: pump?.fertilizer_name || "", amount_ml: pump?.amount_ml ?? 2.5, interval_days: pump?.interval_days ?? 1, time_of_day: pump?.time_of_day || "", is_active: pump ? Number(pump.is_active) === 1 : true, note: pump?.note || "" });
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
    await api(`/aquariums/${props.id}/dosing-pumps${editing.value ? "/" + editing.value.id : ""}`, { method: editing.value ? "PUT" : "POST", body: { ...model } });
    editing.value = undefined;
    toast(t('pumps.saved'));
    emit("changed");
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
async function action() {
  const pump = removing.value || dosing.value;
  if (!pump || busy.value || props.readonly) return;
  busy.value = true;
  error.value = "";
  try {
    await api(`/aquariums/${props.id}/dosing-pumps/${pump.id}${removing.value ? "" : "/dose"}`, { method: removing.value ? "DELETE" : "POST", body: removing.value ? undefined : {} });
    toast(t(removing.value ? 'pumps.deleted' : 'pumps.recorded'));
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
      <h2 style="margin:0">{{ t('pumps.title') }}</h2>
      <button v-if="!readonly" class="btn small" @click="edit(null)">{{ t('pumps.add') }}</button>
    </div>
    <p class="muted" style="margin:0">{{ t('pumps.help') }}</p>
    <p v-if="!pumps.length" class="muted">{{ t('pumps.empty') }}</p>
    <article v-for="pump in pumps" :key="pump.id" class="cycle-card stack">
      <div class="row between"><strong>{{ pump.name }}</strong><span class="chip" :class="Number(pump.is_active) === 1 ? 'ok' : 'none'">{{ t(Number(pump.is_active) === 1 ? 'pumps.active' : 'pumps.paused') }}</span></div>
      <div><strong>{{ pump.amount_ml }} ml</strong> {{ pump.fertilizer_name }}</div>
      <div class="muted">{{ pump.interval_days === 1 ? t('pumps.daily') : t('pumps.everyDays', { days: pump.interval_days }) }}{{ pump.time_of_day ? ` · ${pump.time_of_day.slice(0,5)}` : '' }}</div>
      <div>{{ t('pumps.last') }}: {{ pump.last_dosed_at ? fmtDate(pump.last_dosed_at) : t('pumps.never') }}</div>
      <p v-if="pump.note" style="margin:0;white-space:pre-wrap">{{ pump.note }}</p>
      <div v-if="!readonly" class="row">
        <button class="btn small" :disabled="busy" @click="error = ''; dosing = pump">{{ t('pumps.record') }}</button>
        <button class="btn small ghost" :disabled="busy" @click="edit(pump)">{{ t('common.edit') }}</button>
        <button class="btn small ghost danger" :disabled="busy" @click="error = ''; removing = pump">{{ t('common.delete') }}</button>
      </div>
    </article>
    <Modal v-if="editing !== undefined" :title="t(editing ? 'pumps.edit' : 'pumps.add')" @close="close">
      <form class="stack" @submit.prevent="save">
        <fieldset class="stack pump-fields" :disabled="busy">
          <label>{{ t('pumps.name') }}<input v-model="model.name" required maxlength="100" :placeholder="t('pumps.nameExample')" /></label>
          <label>{{ t('pumps.liquid') }}<input v-model="model.fertilizer_name" required maxlength="100" /></label>
          <label>{{ t('pumps.amount') }}<input v-model.number="model.amount_ml" type="number" min="0.01" max="1000" step="0.01" required /></label>
          <label>{{ t('pumps.interval') }}<input v-model.number="model.interval_days" type="number" min="1" max="365" step="1" required /><small class="muted">{{ t('pumps.intervalHelp') }}</small></label>
          <label>{{ t('pumps.time') }}<input v-model="model.time_of_day" type="time" /></label>
          <label class="row"><input v-model="model.is_active" type="checkbox" />{{ t('pumps.activePlan') }}</label>
          <label>{{ t('common.notes') }}<textarea v-model="model.note" rows="3" maxlength="500" /></label>
        </fieldset>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :disabled="busy">{{ t(busy ? 'common.loading' : 'common.save') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="close">{{ t('common.cancel') }}</button></div>
      </form>
    </Modal>
    <Modal v-if="dosing || removing" :title="t(removing ? 'pumps.deleteTitle' : 'pumps.record')" @close="close">
      <form class="stack" @submit.prevent="action">
        <p v-if="removing">{{ t('pumps.deleteConfirm', { name: removing.name }) }}</p>
        <template v-else-if="dosing"><p>{{ t('pumps.recordConfirm', { amount: dosing.amount_ml, liquid: dosing.fertilizer_name, name: dosing.name }) }}</p><p class="muted">{{ t('pumps.recordHelp') }}</p></template>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row"><button class="btn" :class="{ danger: removing }" :disabled="busy">{{ t(busy ? 'common.loading' : removing ? 'common.delete' : 'pumps.record') }}</button><button type="button" class="btn ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</button></div>
      </form>
    </Modal>
  </section>
</template>
<style scoped>
.pump-fields { border:0; padding:0; margin:0; min-width:0; }
</style>
