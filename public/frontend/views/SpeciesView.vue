<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { runWorkerTask } from "../worker-client";
import AddSpeciesDialog from "../components/AddSpeciesDialog.vue";
import SpeciesDetail from "../components/SpeciesDetail.vue";
import { api } from "../api";
import { t, errorMessage, language } from "../state";
import { route } from "../router";
import type { Species } from "../types";
const species = ref<Species[]>([]);
const search = ref("");
const water = ref("all");
const category = ref("all");
const selected = ref<Species>();
const adding = ref<Species>();
const error = ref("");
const categories = computed(() => [
  ...new Set(
    species.value.map((s) => s.category).filter((s): s is string => !!s),
  ),
]);
const shown = ref<Species[]>([]);
let generation = 0;
let loadRequest: AbortController | undefined;
let detailRequest: AbortController | undefined;
let disposed = false;
onBeforeUnmount(() => { disposed = true; generation++; loadRequest?.abort(); detailRequest?.abort(); });
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
      if (!disposed && current === generation) error.value = errorMessage(e);
    }
  },
  { immediate: true },
);
onMounted(load);
watch(language, load);
async function load() {
  loadRequest?.abort();
  const request = new AbortController();
  loadRequest = request;
  try {
    const result = await api<{ species: Species[] } | Species[]>("/species", { signal: request.signal });
    if (request.signal.aborted) return;
    species.value = Array.isArray(result) ? result : result.species;
    const id = route.value.path.split("/")[2];
    if (id)
      selected.value = (await api<{ species: Species }>(
        `/species/${encodeURIComponent(decodeURIComponent(id))}`,
        { signal: request.signal },
      )).species;
  } catch (e) {
    if (!request.signal.aborted) error.value = errorMessage(e);
  }
}
async function open(item: Species) {
  detailRequest?.abort();
  const request = new AbortController();
  detailRequest = request;
  try {
    selected.value = (await api<{ species: Species }>(`/species/${encodeURIComponent(item.id)}`, { signal: request.signal })).species;
  } catch (e) {
    if (!request.signal.aborted) error.value = errorMessage(e);
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
        @keydown.enter.self="open(item)"
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
        <div class="row">
          <button class="btn small ghost" @click.stop="open(item)">{{ t("common.details") }}</button>
          <button class="btn small" @click.stop="adding = item">{{ t("speciesAdd.title") }}</button>
        </div>
      </article>
    </div>
    <SpeciesDetail v-if="selected" :species="selected" @close="selected = undefined">
      <button class="btn" @click="adding = selected">{{ t("speciesAdd.title") }}</button>
    </SpeciesDetail>
    <AddSpeciesDialog v-if="adding" :key="adding.id" :species="adding" @close="adding = undefined" @added="adding = undefined" />
  </div>
</template>
