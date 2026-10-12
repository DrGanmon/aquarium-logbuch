<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Modal from "./Modal.vue";
import Fields from "./Fields.vue";
import { api } from "../api";
import { t, errorMessage, fmtDate } from "../state";
import type { Pump, Field, FormData } from "../types";
const props = defineProps<{ id: string; pumps: Pump[]; readonly: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const editing = ref<Pump | null>();
const model = reactive<FormData>({});
const error = ref("");
const busy = ref(false);
const fields = computed<Field[]>(() => [
  { key: "name", label: t("common.name"), required: true },
  { key: "fertilizer_name", label: "Dünger / Flüssigkeit", required: true },
  {
    key: "amount_ml",
    label: "Dosiermenge (ml)",
    type: "number",
    min: 0.01,
    max: 1000,
    required: true,
  },
  {
    key: "interval_days",
    label: "Intervall (Tage)",
    type: "number",
    min: 1,
    max: 365,
  },
  { key: "time_of_day", label: t("common.time"), type: "time" },
  { key: "is_active", label: "Aktiv", type: "checkbox" },
  { key: "note", label: t("common.notes"), type: "textarea" },
]);
function edit(pump: Pump | null) {
  editing.value = pump;
  Object.assign(model, {
    name: "",
    fertilizer_name: "",
    amount_ml: 2.5,
    interval_days: 1,
    time_of_day: "08:00",
    is_active: true,
    note: "",
    ...pump,
  });
  model.is_active = Boolean(model.is_active);
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api(
      `/aquariums/${props.id}/dosing-pumps${editing.value ? "/" + editing.value.id : ""}`,
      { method: editing.value ? "PUT" : "POST", body: model },
    );
    editing.value = undefined;
    emit("changed");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function action(pump: Pump, remove = false) {
  if (remove && !confirm(t("common.delete") + "?")) return;
  try {
    await api(
      `/aquariums/${props.id}/dosing-pumps/${pump.id}${remove ? "" : "/dose"}`,
      { method: remove ? "DELETE" : "POST" },
    );
    emit("changed");
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <section class="card stack">
    <div class="row between">
      <h2 style="margin: 0">⚙️ Dosierpumpen & Düngung</h2>
      <button v-if="!readonly" class="btn small ghost" @click="edit(null)">
        + Dosierpumpe
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!pumps.length" class="muted">
      Noch keine Dosierpumpen eingerichtet.
    </p>
    <div v-for="pump in pumps" :key="pump.id" class="cycle-card stack">
      <div class="row between">
        <strong>{{ pump.name }}</strong
        ><span class="chip" :class="pump.is_active ? 'ok' : 'none'">{{
          pump.is_active ? "Aktiv" : "Inaktiv"
        }}</span>
      </div>
      <div>
        {{ pump.fertilizer_name }} · {{ pump.amount_ml }} ml · alle
        {{ pump.interval_days }} Tage · {{ pump.time_of_day }}
      </div>
      <div class="muted">
        Zuletzt: {{ fmtDate(pump.last_dosed_at) }} · Nächste Dosis:
        {{ fmtDate(pump.next_due_at) }}
      </div>
      <p v-if="pump.note">{{ pump.note }}</p>
      <div v-if="!readonly" class="row">
        <button class="btn small" @click="action(pump)">
          🌿 Dosierung eintragen</button
        ><button class="btn small ghost" @click="edit(pump)">
          {{ t("common.edit") }}</button
        ><button class="btn small ghost danger" @click="action(pump, true)">
          {{ t("common.delete") }}
        </button>
      </div>
    </div>
    <Modal
      v-if="editing !== undefined"
      title="Dosierpumpe"
      @close="editing = undefined"
      ><form class="stack" @submit.prevent="save">
        <Fields :fields="fields" :model="model" />
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn" :disabled="busy">{{ t("common.save") }}</button>
      </form></Modal
    >
  </section>
</template>
