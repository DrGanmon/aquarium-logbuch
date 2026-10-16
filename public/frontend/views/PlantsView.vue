<script setup lang="ts">
import { lazyComponent } from "../composables/lazy-component";
import { onMounted, ref } from "vue";
import { useCatalogSearch } from "../composables/catalog-search";
import { t, errorMessage, language } from "../state";
import { route } from "../router";
import type { PlantSummary } from "../../../src/shared/plants";
const AddPlantDialog = lazyComponent(() => import("../components/AddPlantDialog.vue"));
const adding = ref<PlantSummary>();
const PlantDetail = lazyComponent(() => import("../components/PlantDetail.vue"));
const { shown, total, next, search, water, category, categories, pageError, loading, sentinel, load, retry } = useCatalogSearch<PlantSummary>("plants");
const selected = ref<{ id: string }>();
const error = ref("");
onMounted(loadRouteDetail);

function open(item: PlantSummary) { selected.value = { id: item.id }; }
function loadRouteDetail() {
  const id = route.value.path.split("/")[2];if (!id) return;
  try { selected.value = { id: decodeURIComponent(id) }; }
  catch (caught) { error.value = errorMessage(caught); }
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
          <span class="tag">{{ item.category }}</span>
        </div>
        <p>{{ item.description }}</p>
        <p v-if="item.matchedVariants?.length" class="variant-matches"><strong>{{ t("variants.matches") }}</strong> {{ item.matchedVariants.join(" · ") }}</p>
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
