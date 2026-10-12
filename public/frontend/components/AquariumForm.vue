<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import Modal from "./Modal.vue";
import Fields from "./Fields.vue";
import { api } from "../api";
import { readImage } from "../composables/media";
import { session, t, errorMessage, toast } from "../state";
import type { Aquarium, Field, FormData, Id } from "../types";
const props = defineProps<{ aquarium?: Aquarium }>();
const emit = defineEmits<{ close: []; saved: [id: Id] }>();
const model = reactive<FormData>({
  name: "",
  motto: "",
  description: "",
  water_type: "fresh",
  volume_l: null,
  notes: "",
  measure_cycle_interval: 7,
  measure_cycle_unit: "days",
  measure_cycle_day_of_week: null,
  measure_reminder_mail: false,
  fertilize_cycle_interval: 0,
  fertilize_cycle_unit: "weeks",
  fertilize_cycle_day_of_week: null,
  fertilize_reminder_mail: false,
});
if (props.aquarium)
  for (const key of Object.keys(model)) {
    const value = (props.aquarium as unknown as Record<string, unknown>)[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    )
      model[key] = value;
  }
model.measure_reminder_mail = Boolean(model.measure_reminder_mail);
model.fertilize_reminder_mail = Boolean(model.fertilize_reminder_mail);
const busy = ref(false);
const error = ref("");
const image = ref("");
const fields = computed<Field[]>(() => [
  { key: "name", label: t("aquariums.nameLabel"), required: true },
  { key: "motto", label: t("aquariums.mottoLabel") },
  {
    key: "description",
    label: t("aquariums.descriptionLabel"),
    type: "textarea",
  },
  {
    key: "water_type",
    label: t("aquariums.waterTypeLabel"),
    options: session.config?.waterTypes,
  },
  {
    key: "volume_l",
    label: t("aquariums.volumeLabel"),
    type: "number",
    min: 1,
    max: 100000,
  },
  { key: "notes", label: t("common.notes"), type: "textarea" },
]);
const cycles = ["measure", "fertilize"];
const weekdays = computed(() =>
  Object.fromEntries(
    [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ].map((day, i) => [String(i + 1), t("common." + day)]),
  ),
);
async function fileChanged(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    image.value = await readImage(file);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const body = {
      ...model,
      volume_l: model.volume_l === "" ? null : model.volume_l,
      measure_reminder_mail: model.measure_reminder_mail ? 1 : 0,
      fertilize_reminder_mail: model.fertilize_reminder_mail ? 1 : 0,
    };
    const result = await api<{ id: Id }>(
      props.aquarium ? `/aquariums/${props.aquarium.id}` : "/aquariums",
      { method: props.aquarium ? "PUT" : "POST", body },
    );
    const id = props.aquarium?.id ?? result.id;
    if (image.value)
      await api(`/aquariums/${id}/images`, {
        method: "POST",
        body: { image: image.value, is_primary: 1 },
      });
    toast(t("common.saved"));
    emit("saved", id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (
    !props.aquarium ||
    !confirm(t("aquariums.deleteConfirm", { name: props.aquarium.name }))
  )
    return;
  try {
    await api(`/aquariums/${props.aquarium.id}`, { method: "DELETE" });
    emit("close");
    location.hash = "#/";
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <Modal
    :title="
      t(aquarium ? 'aquariums.modalEditTitle' : 'aquariums.modalNewTitle')
    "
    wide
    @close="emit('close')"
    ><form class="stack" @submit.prevent="save">
      <Fields :fields="fields" :model="model" />
      <div class="field">
        <label
          >📸 {{ t("common.imageLightboxTitle")
          }}<input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="fileChanged" /></label
        ><img v-if="image" :src="image" class="img-preview" alt="Vorschau" />
      </div>
      <fieldset v-for="cycle in cycles" :key="cycle" class="stack">
        <legend>
          {{ cycle === "measure" ? "🧪 Messzyklus" : "🌿 Düngzyklus" }}
        </legend>
        <div class="row">
          <input
            v-model="model[`${cycle}_cycle_interval`]"
            type="number"
            min="0"
            max="365"
            aria-label="Intervall"
          /><select v-model="model[`${cycle}_cycle_unit`]">
            <option value="days">{{ t("common.days") }}</option>
            <option value="weeks">{{ t("common.weeks") }}</option></select
          ><select v-model="model[`${cycle}_cycle_day_of_week`]">
            <option :value="null">{{ t("aquariums.noDay") }}</option>
            <option
              v-for="(day, key) in weekdays"
              :key="key"
              :value="Number(key)"
            >
              {{ day }}
            </option>
          </select>
        </div>
        <label class="row"
          ><input v-model="model[`${cycle}_reminder_mail`]" type="checkbox" />📧
          Erinnerungs-E-Mail</label
        >
      </fieldset>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="row">
        <button class="btn" :disabled="busy">{{ t("common.save") }}</button
        ><button class="btn ghost" type="button" @click="emit('close')">
          {{ t("common.cancel") }}</button
        ><button
          v-if="aquarium?.role === 'owner'"
          class="btn danger"
          type="button"
          @click="remove"
        >
          {{ t("common.delete") }}
        </button>
      </div>
    </form></Modal
  >
</template>
