<script setup lang="ts">
import { computed } from "vue";
import CatalogPhoto from "./CatalogPhoto.vue";
import Modal from "./Modal.vue";
import { t, language } from "../state";
import type { Species } from "../types";
const props = defineProps<{ species: Species }>();
const emit = defineEmits<{ close: [] }>();
const label = (key: string) => t(`speciesDetail.${key}`);
const translated = (group: string, value?: string) => {
  if (!value) return label("unknown");
  const key = `speciesDetail.${group}.${value}`;
  const result = t(key);
  return result === key ? value : result;
};
const waterRows = computed(() => [
  { key: "temp", unit: "°C" }, { key: "ph", unit: "" },
  ...(props.species.waterType === "fresh" ? [{ key: "gh", unit: "°dGH" }] : []),
  { key: "kh", unit: "°dKH" },
  ...(props.species.salinity ? [{ key: "salinity", unit: "‰" }] : []),
].map(({ key, unit }) => ({ key, unit, range: props.species[key as "temp" | "ph" | "gh" | "kh" | "salinity"] })));
function range(min?: number, max?: number, unit = "") {
  const format = (n?: number) => n == null ? "–" : new Intl.NumberFormat(language.value).format(n);
  return `${format(min)} – ${format(max)}${unit ? ` ${unit}` : ""}`;
}

</script>
<template>
  <Modal :title="species.name" wide @close="emit('close')">
    <div class="species-detail stack">
      <slot />
      <a class="btn small ghost" :href="`#/health?speciesId=${encodeURIComponent(species.id)}`" @click="emit('close')">🩺 {{ t("health.forSpecies") }}</a>
      <div class="species-detail-identity">
        <em>{{ species.scientificName }}</em>
        <div class="row">
          <span class="tag">{{ label(species.waterType === 'salt' ? 'salt' : 'fresh') }}</span>
          <span v-if="species.category" class="tag">{{ species.category }}</span>
        </div>
      </div>
      <CatalogPhoto :image="species.image" :name="species.name" />
      <p v-if="species.description" class="species-detail-description">{{ species.description }}</p>
      <section class="stack species-detail-section">
        <h3>{{ label('quickFacts') }}</h3>
        <dl class="species-facts">
          <div><dt>{{ label('volume') }}</dt><dd>{{ species.minVolumeL != null ? `${label('from')} ${species.minVolumeL} L` : label('unknown') }}</dd></div>
          <div><dt>{{ label('length') }}</dt><dd>{{ species.minTankLengthCm != null ? `${label('from')} ${species.minTankLengthCm} cm` : label('unknown') }}</dd></div>
          <div><dt>{{ label('keeping') }}</dt><dd>{{ translated('social', species.socialType) }}</dd><small v-if="species.minGroupCount">{{ label('minimum') }} {{ species.minGroupCount }} {{ label('animals') }}</small></div>
          <div><dt>{{ label('region') }}</dt><dd>{{ translated('regions', species.tankRegion) }}</dd></div>
          <div><dt>{{ label('food') }}</dt><dd>{{ translated('diets', species.diet) }}</dd></div>
          <div><dt>{{ label('behavior') }}</dt><dd>{{ translated('territorial', species.territorial) }}</dd></div>
        </dl>
      </section>
      <section v-if="species.behaviorNotes" class="stack species-detail-section">
        <h3>{{ label('tankmates') }}</h3><p class="compat-box info">{{ species.behaviorNotes }}</p>
      </section>
      <section class="stack species-detail-section">
        <h3>{{ label('water') }}</h3>
        <p class="muted">{{ label('waterHelp') }}</p>
        <div class="species-water-list">
          <div v-for="row in waterRows" :key="row.key" class="species-water-row">
            <strong>{{ label(row.key) }}</strong>
            <div><span>{{ label('ideal') }}</span><b>{{ range(row.range?.idealMin, row.range?.idealMax, row.unit) }}</b></div>
            <div><span>{{ label('range') }}</span>{{ range(row.range?.min, row.range?.max, row.unit) }}</div>
          </div>
        </div>
      </section>
      <section v-if="species.decorHints" class="stack species-detail-section">
        <h3>{{ label('setup') }}</h3><p>{{ species.decorHints }}</p>
      </section>
      <p class="muted species-detail-footnote">{{ label('guidance') }}</p>
    </div>
  </Modal>

</template>
