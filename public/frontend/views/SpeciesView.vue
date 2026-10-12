<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { runWorkerTask } from "../worker-client";
import Modal from "../components/Modal.vue";
import { api } from "../api";
import { t, errorMessage, language } from "../state";
import { route } from "../router";
import type { Species } from "../types";
const species = ref<Species[]>([]);
const search = ref("");
const water = ref("all");
const category = ref("all");
const selected = ref<Species>();
const error = ref("");
const categories = computed(() => [
  ...new Set(
    species.value.map((s) => s.category).filter((s): s is string => !!s),
  ),
]);
const shown = ref<Species[]>([]);
let generation = 0;
watch(
  [species, search, water, category],
  async () => {
    const current = ++generation;
    try {
      const result = await runWorkerTask("SEARCH_SPECIES", {
        species: JSON.parse(JSON.stringify(species.value)),
        query: search.value,
        waterType: water.value,
        category: category.value,
      });
      if (current === generation) shown.value = result.filtered;
    } catch (e) {
      error.value = errorMessage(e);
    }
  },
  { immediate: true },
);
onMounted(load);
watch(language, load);
async function load() {
  try {
    const result = await api<{ species: Species[] } | Species[]>("/species");
    species.value = Array.isArray(result) ? result : result.species;
    const id = route.value.path.split("/")[2];
    if (id)
      selected.value = await api(
        `/species/${encodeURIComponent(decodeURIComponent(id))}`,
      );
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function open(item: Species) {
  try {
    selected.value = await api(`/species/${item.id}`);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <div class="stack">
    <div class="row between">
      <h1>{{ t("nav.species") }}</h1>
      <a class="btn small ghost" href="#/">{{ t("common.back") }}</a>
    </div>
    <div class="card stack">
      <div class="row">
        <input
          v-model="search"
          :placeholder="t('common.search')"
          :aria-label="t('common.search')"
        /><select v-model="water" aria-label="Wasserart">
          <option value="all">{{ t("common.all") }}</option>
          <option value="fresh">Süßwasser</option>
          <option value="salt">Meerwasser</option></select
        ><select v-model="category" aria-label="Kategorie">
          <option value="all">{{ t("common.all") }}</option>
          <option v-for="item in categories" :key="item">{{ item }}</option>
        </select>
      </div>
      <span class="muted">{{ shown.length }} Arten</span>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="species-grid">
      <article
        v-for="item in shown"
        :key="item.id"
        class="card species-card"
        :class="item.waterType"
        tabindex="0"
        @click="open(item)"
        @keydown.enter="open(item)"
      >
        <h3>{{ item.name }}</h3>
        <div class="muted" style="font-style: italic">
          {{ item.scientificName }}
        </div>
        <div class="row">
          <span class="tag">{{ item.category }}</span
          ><span class="tag">ab {{ item.minVolumeL }} L</span
          ><span class="tag info">{{ item.minGroupCount }} Tiere</span>
        </div>
        <p>{{ item.description }}</p>
        <button class="btn small ghost" @click.stop="open(item)">
          {{ t("common.details") }}
        </button>
      </article>
    </div>
    <Modal
      v-if="selected"
      :title="selected.name"
      wide
      @close="selected = undefined"
      ><div class="stack">
        <em class="muted">{{ selected.scientificName }}</em>
        <div class="row">
          <span class="tag">{{ selected.category }}</span
          ><span class="tag">ab {{ selected.minVolumeL }} L</span
          ><span class="tag"
            >{{ selected.minGroupCount }} Tiere ·
            {{ selected.socialType }}</span
          ><span class="tag">{{ selected.territorial }}</span>
        </div>
        <p>{{ selected.description }}</p>
        <div v-if="selected.behaviorNotes" class="compat-box info">
          {{ selected.behaviorNotes }}
        </div>
        <p>{{ selected.decorHints }}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Wasserwert</th>
                <th>Bereich</th>
                <th>Ideal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="key in (['temp', 'ph', 'gh', 'kh', 'salinity'] as const).filter(key => key !== 'salinity' || selected?.salinity)" :key="key">
                <td>{{ key === "salinity" ? "Salinität (‰)" : key }}</td>
                <td>
                  {{ selected[key]?.min ?? "–" }} –
                  {{ selected[key]?.max ?? "–" }}
                </td>
                <td>
                  {{ selected[key]?.idealMin ?? "–" }} –
                  {{ selected[key]?.idealMax ?? "–" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="muted">
          {{ selected.tankRegion }} · {{ selected.diet }} ·
          {{ selected.minTankLengthCm }} cm
        </div>
        <div v-if="selected.parameters" class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Minimum</th>
                <th>Maximum</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(value, key) in selected.parameters" :key="key">
                <td>{{ key }}</td>
                <td>{{ value.okMin }}</td>
                <td>{{ value.okMax }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div></Modal
    >
  </div>
</template>
