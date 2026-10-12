<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import Modal from "./Modal.vue";
import { t, language } from "../state";
import type { Species } from "../types";
const props = defineProps<{ species: Species }>();
const emit = defineEmits<{ close: [] }>();
const showCredits = ref(false);
const creditButton = ref<HTMLButtonElement>();
async function closeCredits() {
  showCredits.value = false;
  await nextTick();
  creditButton.value?.focus();
}
const imageFailed = ref(false);
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
function safeLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}
</script>
<template>
  <Modal :title="species.name" wide @close="emit('close')">
    <div class="species-detail stack">
      <div class="species-detail-identity">
        <em>{{ species.scientificName }}</em>
        <div class="row">
          <span class="tag">{{ label(species.waterType === 'salt' ? 'salt' : 'fresh') }}</span>
          <span v-if="species.category" class="tag">{{ species.category }}</span>
        </div>
      </div>
      <figure v-if="species.image && !imageFailed" class="species-detail-photo">
        <img :src="species.image.url" :alt="species.name" :width="species.image.width" :height="species.image.height" decoding="async" @error="imageFailed = true" />
        <button ref="creditButton" class="species-photo-credit" type="button" :aria-label="label('credits')" :title="label('credits')" @click="showCredits = true">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></svg>
        </button>
      </figure>
      <p v-else class="muted species-detail-no-photo">{{ label('noPhoto') }}</p>
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
  <Modal v-if="showCredits && species.image" :title="label('credits')" @close="closeCredits">
    <div class="stack species-image-credits">
      <p><strong>{{ species.image.title }}</strong></p>
      <dl class="species-credit-list">
        <div><dt>{{ label('author') }}</dt><dd>{{ species.image.author || label('unknown') }}</dd><a v-if="safeLink(species.image.authorUrl)" :href="safeLink(species.image.authorUrl)" target="_blank" rel="noopener noreferrer">{{ label('authorLink') }} ↗</a><small v-else>{{ label('noAuthorLink') }}</small></div>
        <div><dt>{{ label('license') }}</dt><dd>{{ species.image.license || label('unknown') }}</dd><a v-if="safeLink(species.image.licenseUrl)" :href="safeLink(species.image.licenseUrl)" target="_blank" rel="noopener noreferrer">{{ label('licenseLink') }} ↗</a><small v-else>{{ label('noLicenseLink') }}</small><p v-if="species.image.publicDomainBasis">{{ label('basis') }}: {{ species.image.publicDomainBasis }}</p></div>
        <div><dt>{{ label('source') }}</dt><dd>{{ species.image.source }}</dd><a v-if="safeLink(species.image.sourceUrl)" :href="safeLink(species.image.sourceUrl)" target="_blank" rel="noopener noreferrer">{{ label('sourceLink') }} ↗</a></div>
        <div v-if="species.image.originalSource"><dt>{{ label('originalSource') }}</dt><dd>{{ species.image.originalSource }}</dd><a v-if="safeLink(species.image.originalSourceUrl)" :href="safeLink(species.image.originalSourceUrl)" target="_blank" rel="noopener noreferrer">{{ label('originalLink') }} ↗</a></div>
      </dl>
      <p v-if="species.image.requiredAttribution">{{ species.image.requiredAttribution }}</p>
      <p v-if="species.image.attribution" class="muted">{{ species.image.attribution }}</p>
      <p><strong>{{ label('changes') }}:</strong> {{ species.image.modifications }}</p>
      <p v-if="species.image.shareAlike" class="muted">{{ label('shareAlike') }}</p>
    </div>
  </Modal>
</template>
