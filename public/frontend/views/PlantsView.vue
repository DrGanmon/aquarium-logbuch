<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { api } from "../api";
import { t, errorMessage, language } from "../state";
import { route } from "../router";
import type { PlantSummary } from "../../../src/shared/plants";
const AddPlantDialog = lazyComponent(() => import("../components/AddPlantDialog.vue"));
const adding = ref<PlantSummary>();
const PlantDetail = lazyComponent(() => import("../components/PlantDetail.vue"));
interface PlantPage { plants: PlantSummary[]; total: number; next: number | null; categories: string[] }
const shown = ref<PlantSummary[]>([]), total = ref(0), next = ref<number | null>(null);
const search = ref(""), water = ref("all"), category = ref("all"), categories = ref<string[]>([]);
const selected = ref<{ id: string }>();
const error = ref(""), pageError = ref(""), loading = ref(true), sentinel = ref<HTMLElement>();
let loadRequest: AbortController | undefined;
let observer: IntersectionObserver | undefined, reloadTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

onBeforeUnmount(() => {
  disposed = true;clearTimeout(reloadTimer);loadRequest?.abort();observer?.disconnect();
});
watch(language, () => { category.value = "all"; });
watch([search, water, category, language], ([query], previous) => {
  clearTimeout(reloadTimer);loadRequest?.abort();shown.value = [];total.value = 0;next.value = null;
  pageError.value = "";loading.value = true;
  reloadTimer = setTimeout(() => { reloadTimer = undefined;void load(); }, previous?.length && query !== previous[0] ? 200 : 0);
}, { immediate: true, flush: "sync" });
watch(sentinel, element => {
  observer?.disconnect();
  if (!element || !("IntersectionObserver" in window)) return;
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting) && !pageError.value) void load(true);
  }, { rootMargin: "300px" });
  observer.observe(element);
}, { flush: "post" });
onMounted(loadRouteDetail);

async function load(more = false) {
  if (disposed || (more && (loading.value || reloadTimer !== undefined || next.value === null))) return;
  loadRequest?.abort();const request = new AbortController();loadRequest = request;
  loading.value = true;pageError.value = "";
  const query = new URLSearchParams({ limit: "24", offset: String(more ? next.value : 0), q: search.value });
  if (water.value !== "all") query.set("water_type", water.value);
  if (category.value !== "all") query.set("category", category.value);
  try {
    const result = await api<PlantPage>(`/plants?${query}`, { signal: request.signal });
    if (request.signal.aborted || disposed) return;
    shown.value = more ? [...shown.value, ...result.plants] : result.plants;
    total.value = result.total;next.value = result.next;categories.value = result.categories;
  } catch (caught) { if (!request.signal.aborted && !disposed) pageError.value = errorMessage(caught); }
  finally { if (loadRequest === request && !request.signal.aborted) loading.value = false; }
}
function retry() { void load(shown.value.length > 0 && next.value !== null); }
function open(item: PlantSummary) { selected.value = { id: item.id }; }
function loadRouteDetail() {
  const id = route.value.path.split("/")[2];if (!id) return;
  try { selected.value = { id: decodeURIComponent(id) }; }
  catch (caught) { if (!disposed) error.value = errorMessage(caught); }
}
</script>
<template>
  <div class="stack">
    <div class="row between">
      <h1>{{ t("nav.plants") }}</h1>
      <a v-if="route.query.get('aquariumId')" class="btn small ghost" :href="`#/a/${encodeURIComponent(route.query.get('aquariumId')!)}`">{{ t("plantStock.back") }}</a>
      <a class="btn small ghost" :href="'#/'">{{ t("common.back") }}</a>
    </div>
    <div class="card stack">
      <div class="row">
        <input
          v-model="search"
          maxlength="200"
          :placeholder="t('common.search')"
          :aria-label="t('common.search')"
        /><select v-model="water" :aria-label="t('speciesCatalog.water')">
          <option value="all">{{ t("common.all") }}</option>
          <option value="fresh">{{ t("speciesCatalog.fresh") }}</option>
          <option value="salt">{{ t("speciesCatalog.salt") }}</option></select
        ><select v-model="category" :aria-label="t('speciesCatalog.category')">
          <option value="all">{{ t("common.all") }}</option>
          <option v-for="item in categories" :key="item">{{ item }}</option>
        </select>
      </div>
      <span class="muted">{{ t("plants.count", { loaded: shown.length, total }) }}</span>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="pageError" class="error" role="alert">{{ pageError }} <button type="button" class="btn small ghost" :disabled="loading" @click="retry">{{ t("detail.lazyRetry") }}</button></p>
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
          <span class="tag">{{ item.category }}</span>
        </div>
        <p>{{ item.description }}</p>
        <div class="row">
          <button class="btn small ghost" @click.stop="open(item)">{{ t("common.details") }}</button>
          <button class="btn small" @click.stop="adding = item">{{ t("plantStock.add") }}</button>
        </div>
      </article>
    </div>
    <p v-if="loading" class="muted" role="status">{{ t("common.loading") }}</p>
    <p v-else-if="!shown.length && !pageError" class="muted" role="status">{{ t("plants.empty") }}</p>
    <div v-if="next !== null" ref="sentinel" class="row" style="justify-content: center">
      <button type="button" class="btn ghost" :disabled="loading" @click="load(true)">{{ t("speciesCatalog.more") }}</button>
    </div>
    <PlantDetail v-if="selected" :key="selected.id" :plant-id="selected.id" @close="selected = undefined">
      <template #default="{ plant }"><button class="btn" @click="adding = plant">{{ t('plantStock.add') }}</button></template>
    </PlantDetail>
    <AddPlantDialog v-if="adding" :key="adding.id" :plant="adding" :aquarium-id="route.query.get('aquariumId') || undefined" @close="adding = undefined" @added="adding = undefined" />
  </div>
</template>
