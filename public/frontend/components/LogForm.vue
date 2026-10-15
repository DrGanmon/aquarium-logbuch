<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Modal from "./Modal.vue";
import Fields from "./Fields.vue";
import { enqueueMaintenance } from "../offline-sync";
import { api } from "../api";
import { session, t, localDateTime, errorMessage, toast } from "../state";
import type { Field, FormData, LogEntry } from "../types";
const props = defineProps<{
  id: string;
  entry?: LogEntry;
  initialType?: string;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const model = reactive<FormData>({
  type: props.entry?.type || props.initialType || "water_change",
  logged_at: props.entry?.timestamp?.slice(0, 16) || localDateTime(),
  percentage: props.entry?.percentage ?? "",
  details: props.entry?.details || "",
  note: props.entry?.note || "",
});
const busy = ref(false);
const error = ref("");
const fields = computed<Field[]>(() => [
  {
    key: "type",
    label: t("common.type"),
    options: Object.fromEntries(
      Object.entries(session.config?.maintenanceTypes || {}).filter(([key]) => key !== "dosing_pump").map(
        ([key, item]) => [key, `${item.icon} ${item.label}`],
      ),
    ),
  },
  {
    key: "logged_at",
    label: t("common.datetime"),
    type: "datetime-local",
    required: true,
  },
  ...(model.type === "water_change"
    ? [
        {
          key: "percentage",
          label: "Wasserwechsel (%)",
          type: "number",
          min: 1,
          max: 100,
        },
      ]
    : []),
  { key: "details", label: t("common.details"), type: "textarea" },
  { key: "note", label: t("common.notes"), type: "textarea" },
]);
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    const body = {
      type: String(model.type),
      logged_at: new Date(String(model.logged_at)).toISOString(),
      percentage: model.percentage ? Number(String(model.percentage).replace(',', '.')) : null,
      details: String(model.details || ''),
      note: String(model.note || ''),
    };
    if (props.entry) {
      await api(`/aquariums/${props.id}/maintenance/${props.entry.id}`, { method: 'PUT', body });
    } else {
      await enqueueMaintenance(props.id, body);
      toast(t('offline.logSaved'));
    }
    emit("saved");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal :title="t('timeline.newEntryBtn')" @close="emit('close')"
    ><form class="stack" @submit.prevent="save">
      <Fields :fields="fields" :model="model" />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn" :disabled="busy">{{ t("common.save") }}</button>
    </form></Modal
  >
</template>
