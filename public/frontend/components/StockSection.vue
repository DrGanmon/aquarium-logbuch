<script setup lang="ts">
import { ref, onBeforeUnmount, watch, nextTick } from "vue";
import Modal from "./Modal.vue";
import StockForm from "./StockForm.vue";
import SpeciesDetail from "./SpeciesDetail.vue";
import { api } from "../api";
import { session, t, errorMessage, language } from "../state";
import type { Stock, Species } from "../types";
const props = defineProps<{ id: string; stock: Stock[]; readonly: boolean }>();
const emit = defineEmits<{ changed: []; image: [url: string] }>();
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
async function remove(stock: Stock) {
  if (!confirm(t("common.delete") + "?")) return;
  try {
    await api(`/aquariums/${props.id}/stock/${stock.id}`, { method: "DELETE" });
    emit("changed");
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <section class="card stack">
    <div class="row between">
      <h2 style="margin: 0">Besatz & Tierwohl</h2>
      <a class="btn small ghost" href="#/species">📖 {{ t("nav.species") }}</a>
    </div>
    <p class="muted">
      Die Fisch- und Wirbellosenarten bestimmen die optimalen Grenzwerte und
      werden auf Verträglichkeit, Gruppengröße sowie Territorialverhalten
      geprüft.
    </p>
    <p v-if="!stock.length">
      Noch kein Besatz eingetragen. Es gelten die allgemeinen Grenzwerte.
    </p>
    <div v-if="stock.length" class="stock-list">
      <div v-for="item in stock" :key="item.id" class="stock-item">
        <div class="stock-item-main">
          <img
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
            >
            <div v-if="item.variantName" class="stock-species-sub"><strong>{{ t("variants.selected") }}</strong> {{ item.variantName }}</div>
            <div class="stock-species-sub">
              {{ item.species }} · {{ session.config?.profiles[item.profile] }}
            </div>
          </div>
        </div>
        <div class="row">
          <a class="btn small ghost" :href="`#/health?wizard=1&aquariumId=${encodeURIComponent(id)}&stockId=${encodeURIComponent(String(item.id))}`">🩺 {{ t("health.wizard") }}</a>
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
      title="Bewohner bearbeiten"
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
