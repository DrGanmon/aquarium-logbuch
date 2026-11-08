<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch, nextTick } from "vue";
import Modal from "./Modal.vue";
import StockForm from "./StockForm.vue";
import SpeciesDetail from "./SpeciesDetail.vue";
import { api } from "../api";
import { session, t, errorMessage, language, registerMessages, undoable } from "../state";
import { isUnsynced } from "../composables/sync-status";
import SyncBadge from "./SyncBadge.vue";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
import type { Stock, Species } from "../types";
const props = defineProps<{ id: string; stock: Stock[]; readonly: boolean }>();
const emit = defineEmits<{ changed: []; image: [url: string] }>();
// Deleted residents disappear at once and can be restored from the toast for a few seconds.
const hidden = ref(new Set<Stock["id"]>());
const visibleStock = computed(() => props.stock.filter((item) => !hidden.value.has(item.id)));
const editing = ref<Stock>();
const error = ref("");
const selectedSpecies = ref<Species>();
let speciesTrigger: HTMLElement | undefined;
async function closeSpecies() {
  selectedSpecies.value = undefined;
  await nextTick();
  speciesTrigger?.focus();
}
const speciesBusy = ref<string>();
let speciesRequest: AbortController | undefined;
const speciesCache = new Map<string, Species>();
watch(language, () => { speciesRequest?.abort(); speciesCache.clear(); selectedSpecies.value = undefined; });
onBeforeUnmount(() => speciesRequest?.abort());
async function showSpecies(stock: Stock, event: Event) {
  speciesTrigger = event.currentTarget as HTMLElement;
  if (!stock.speciesId) return;
  speciesRequest?.abort();
  const request = new AbortController();
  speciesRequest = request;
  speciesBusy.value = stock.speciesId;
  error.value = "";
  try {
    const cached = speciesCache.get(stock.speciesId);
    const species = cached || (await api<{ species: Species }>(`/species/${encodeURIComponent(stock.speciesId)}`, { signal: request.signal })).species;
    if (!request.signal.aborted) {
      speciesCache.set(stock.speciesId, species);
      selectedSpecies.value = species;
    }
  } catch (e) {
    if (!request.signal.aborted) error.value = errorMessage(e);
  } finally {
    if (speciesRequest === request) speciesBusy.value = undefined;
  }
}
function remove(stock: Stock) {
  const toggle = (hide: boolean) => { const next = new Set(hidden.value);if (hide) next.add(stock.id);else next.delete(stock.id);hidden.value = next; };
  undoable(t("aquariumView.stockDeleted", { name: stock.name || stock.variantName || stock.species }), {
    hide: () => toggle(true),
    restore: () => toggle(false),
    commit: async () => {
      await api(`/aquariums/${props.id}/stock/${stock.id}`, { method: "DELETE" });
      emit("changed");
    },
  });
}
</script>
<template>
  <section class="card stack">
    <div class="row between">
      <h2 style="margin: 0">{{ t("detail.residentsTitle") }}</h2>
      <a class="btn small ghost" href="#/species">{{ t("nav.species") }}</a>
    </div>
    <p class="muted">{{ t("stockSection.intro") }}</p>
    <p v-if="!visibleStock.length">{{ t("stockSection.empty") }}</p>
    <div v-if="visibleStock.length" class="stock-list">
      <div v-for="item in visibleStock" :key="item.id" class="stock-item">
        <div class="stock-item-main">
          <img v-server-image
            v-if="item.has_image || item.image_file"
            class="stock-avatar"
            loading="lazy"
            :src="`api/aquariums/${id}/stock/${item.id}/image`"
            :alt="item.name || item.species"
            @click="emit('image', `api/aquariums/${id}/stock/${item.id}/image`)"
          />
          <div v-else class="stock-avatar-placeholder">🐠</div>
          <div>
            <strong class="stock-name-title"
              >{{ item.name || item.variantName || item.species }}
              <span class="tag">{{ item.count }} ×</span></strong
            > <SyncBadge :show="isUnsynced(item.id, `/aquariums/${id}/stock/${item.id}`)" />
            <div v-if="item.variantName" class="stock-species-sub"><strong>{{ t("variants.selected") }}</strong> {{ item.variantName }}</div>
            <div class="stock-species-sub">
              {{ item.species }} · {{ session.config?.profiles[item.profile] }}
            </div>
          </div>
        </div>
        <div class="row">
          <a class="btn small ghost" :href="`#/health?wizard=1&aquariumId=${encodeURIComponent(id)}&stockId=${encodeURIComponent(String(item.id))}`">{{ t("health.wizard") }}</a>
          <button v-if="item.speciesId" class="btn small ghost" :disabled="speciesBusy === item.speciesId" @click="showSpecies(item, $event)">{{ speciesBusy === item.speciesId ? t('common.loading') : t('detail.residentDetails') }}</button>
          <span v-if="!item.speciesId" class="muted">{{ t('detail.noSpeciesDetails') }}</span>
          <template v-if="!readonly">
          <button class="btn small ghost" @click="editing = item">
            {{ t("common.edit") }}</button
          ><button class="btn small ghost danger" @click="remove(item)">
            {{ t("common.delete") }}
          </button>
          </template>
        </div>
      </div>
    </div>
    <SpeciesDetail v-if="selectedSpecies" :species="selectedSpecies" @close="closeSpecies" />
    <p v-if="error" class="error">{{ error }}</p>
    <StockForm v-if="!readonly" :id="id" @saved="emit('changed')" /><Modal
      v-if="editing"
:title="t('stockSection.editTitle')"
      @close="editing = undefined"
      ><StockForm
        :id="id"
        :stock="editing"
        @saved="
          editing = undefined;
          emit('changed');
        "
    /></Modal>
  </section>
</template>
