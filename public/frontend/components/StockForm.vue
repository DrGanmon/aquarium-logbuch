<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { api } from "../api";
import { registerMessages, session, t, errorMessage } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
import { readImage } from "../composables/media";
import type { Stock } from "../types";
registerMessages({ de: featuresDe, en: featuresEn });
const props = defineProps<{ id: string; stock?: Stock }>();
const emit = defineEmits<{ saved: [] }>();
const model = reactive({
  species: props.stock?.species || "",
  name: props.stock?.name || "",
  count: props.stock?.count || 1,
  profile: props.stock?.profile || "allgemein",
  image: "",
  remove_image: false,
});
const error = ref("");
const busy = ref(false);
const selectedSpecies = computed(() =>
  session.config?.species.find(
    (s) =>
      s.id === model.species ||
      s.name.toLowerCase() === model.species.toLowerCase(),
  ),
);
function speciesChanged() {
  if (selectedSpecies.value) model.profile = selectedSpecies.value.profile;
}
async function fileChanged(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    model.image = await readImage(file);
    model.remove_image = false;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api(
      `/aquariums/${props.id}/stock${props.stock ? "/" + props.stock.id : ""}`,
      { method: props.stock ? "PUT" : "POST", body: model },
    );
    Object.assign(model, {
      species: "",
      name: "",
      count: 1,
      profile: "allgemein",
      image: "",
      remove_image: false,
    });
    emit("saved");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <form class="stack" @submit.prevent="save">
    <h3 v-if="!stock" style="margin: 0">{{ t("stockForm.newTitle") }}</h3>
    <div class="grid2">
      <div class="field">
        <label :for="`species-input-${stock?.id || 'new'}`">{{ t("stockForm.species") }}</label
        ><input
          :id="`species-input-${stock?.id || 'new'}`"
          v-model="model.species"
          list="species-list"
          required
          maxlength="80"
          :placeholder="t('stockForm.speciesPlaceholder')"
          @input="speciesChanged"
        /><datalist id="species-list">
          <option
            v-for="species in session.config?.species"
            :key="species.id"
            :value="species.name"
          />
        </datalist>
      </div>
      <div class="field">
        <label
          >{{ t("stockForm.name") }}<input
            v-model="model.name"
            maxlength="80"
            :placeholder="t('stockForm.namePlaceholder')"
        /></label>
      </div>
    </div>
    <div v-if="selectedSpecies" class="species-preview">
      <strong>{{ selectedSpecies.name }}</strong>
      <div class="muted">
        {{ selectedSpecies.scientificName }} ·
        {{ t("stockForm.minVolume", { volume: selectedSpecies.minVolumeL }) }} ·
        {{ t("stockForm.animals", { count: selectedSpecies.minGroupCount }) }}
      </div>
      <p>{{ selectedSpecies.behaviorNotes }}</p>
      <a class="btn small ghost" :href="`#/species/${selectedSpecies.id}`">{{
        t("common.details")
      }}</a>
    </div>
    <div class="grid2">
      <div class="field">
        <label
          >{{ t("common.count")
          }}<input
            v-model.number="model.count"
            type="number"
            min="1"
            max="10000"
            required
        /></label>
      </div>
      <div class="field">
        <label
          >{{ t("stockForm.waterProfile") }}<select v-model="model.profile">
            <option
              v-for="(label, key) in session.config?.profiles"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select></label
        >
      </div>
    </div>
    <div class="field">
      <label
        >{{ t("stockForm.photo") }}<input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          @change="fileChanged" /></label
      ><img
        v-if="model.image"
        class="img-preview"
        :src="model.image"
        :alt="t('stockForm.preview')"
        style="max-height: 120px; object-fit: cover"
      /><button
        v-if="model.image"
        class="btn small ghost"
        type="button"
        @click="model.image = ''"
      >
        {{ t("stockForm.removePhoto") }}
      </button>
    </div>
    <label v-if="stock?.has_image || stock?.image_file" class="row"
      ><input v-model="model.remove_image" type="checkbox" />{{ t("stockForm.removePhoto") }}</label
    >
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div>
      <button class="btn" :disabled="busy">
        {{ stock ? t("common.save") : t("stockForm.add") }}
      </button>
    </div>
  </form>
</template>
