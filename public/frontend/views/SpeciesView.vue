<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useCatalogSearch } from "../composables/catalog-search";
import { useCatalogRevision } from "../composables/catalog-revision";
import { api } from "../api";
import { t, errorMessage, language } from "../state";
import { route } from "../router";
import type { Species } from "../types";
const AddSpeciesDialog = lazyComponent(() => import("../components/AddSpeciesDialog.vue"));
const SpeciesDetail = lazyComponent(() => import("../components/SpeciesDetail.vue"));
const { shown, total, next, search, water, category, categories, pageError, loading, sentinel, load, retry } = useCatalogSearch<Species>("species");
const selected = ref<Species>(), adding = ref<Species>();
const revision = useCatalogRevision("species");
watch(revision, () => { if (selected.value) void loadDetail(selected.value.id); });
const error = ref("");
let detailRequest: AbortController | undefined;
let disposed = false;
onBeforeUnmount(() => { disposed = true;detailRequest?.abort(); });
watch(language, () => { detailRequest?.abort();selected.value = undefined;adding.value = undefined;void loadRouteDetail(); });
onMounted(loadRouteDetail);

async function open(item: Species) { await loadDetail(item.id); }
async function loadRouteDetail() {
  const id = route.value.path.split("/")[2];if (!id) return;
  try { await loadDetail(decodeURIComponent(id)); }
  catch (caught) { if (!disposed) error.value = errorMessage(caught); }
}
async function loadDetail(id: string) {
  detailRequest?.abort();const request = new AbortController();detailRequest = request;error.value = "";
  try {
    const result = await api<{ species: Species }>(`/species/${encodeURIComponent(id)}`, { signal: request.signal });
    if (!request.signal.aborted && !disposed) selected.value = result.species;
  } catch (caught) { if (!request.signal.aborted && !disposed) error.value = errorMessage(caught); }
}
</script>
<template>
  <div class="stack">
    <div class="row between">
      <h1>{{ t("nav.species") }}</h1>
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
      <span class="muted">{{ t("speciesCatalog.count", { loaded: shown.length, total }) }}</span>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="pageError" class="error" role="alert">{{ pageError }} <button type="button" class="btn small ghost" :disabled="loading" @click="retry">{{ t("detail.lazyRetry") }}</button></p>
    <div class="species-grid" v-memo="[shown, language]">
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
        <p v-if="item.matchedVariants?.length" class="variant-matches"><strong>{{ t("variants.matches") }}</strong> {{ item.matchedVariants.join(" · ") }}</p>
        <div class="row">
          <button class="btn small ghost" @click.stop="open(item)">{{ t("common.details") }}</button>
          <button class="btn small" @click.stop="adding = item">{{ t("speciesAdd.title") }}</button>
        </div>
      </article>
    </div>
    <p v-if="loading" class="muted" role="status">{{ t("common.loading") }}</p>
    <p v-else-if="!shown.length && !pageError" class="muted" role="status">{{ t("speciesCatalog.empty") }}</p>
    <div v-if="next !== null" ref="sentinel" class="row" style="justify-content: center">
      <button type="button" class="btn ghost" :disabled="loading" @click="load(true)">{{ t("speciesCatalog.more") }}</button>
    </div>
    <SpeciesDetail v-if="selected" :species="selected" @close="selected = undefined">
      <button class="btn" @click="adding = selected">{{ t("speciesAdd.title") }}</button>
    </SpeciesDetail>
    <AddSpeciesDialog v-if="adding" :key="adding.id" :species="adding" @close="adding = undefined" @added="adding = undefined" />
  </div>
</template>
