<script setup lang="ts">
import { ref, nextTick, watch } from "vue";
import Modal from "./Modal.vue";
import { t } from "../state";
import type { CatalogImage } from "../../../src/shared/catalog-image";
const props = defineProps<{ image?: CatalogImage | null; name: string }>();
const showCredits = ref(false), imageFailed = ref(false);
const creditButton = ref<HTMLButtonElement>();
const label = (key: string) => t(`speciesDetail.${key}`);
watch(() => props.image?.url, () => { imageFailed.value = false;showCredits.value = false; });
async function closeCredits() {
  showCredits.value = false;await nextTick();creditButton.value?.focus();
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
      <figure v-if="image && !imageFailed" class="species-detail-photo">
        <img :src="image.url" :alt="name" :width="image.width" :height="image.height" decoding="async" @error="imageFailed = true" />
        <button ref="creditButton" class="species-photo-credit" type="button" :aria-label="label('credits')" :title="label('credits')" @click="showCredits = true">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></svg>
        </button>
      </figure>
      <p v-else class="muted species-detail-no-photo">{{ label('noPhoto') }}</p>
  <Modal v-if="showCredits && image" :title="label('credits')" @close="closeCredits">
    <div class="stack species-image-credits">
      <p><strong>{{ image.title }}</strong></p>
      <dl class="species-credit-list">
        <div><dt>{{ label('author') }}</dt><dd>{{ image.author || label('unknown') }}</dd><a v-if="safeLink(image.authorUrl)" :href="safeLink(image.authorUrl)" target="_blank" rel="noopener noreferrer">{{ label('authorLink') }} ↗</a><small v-else>{{ label('noAuthorLink') }}</small></div>
        <div><dt>{{ label('license') }}</dt><dd>{{ image.license || label('unknown') }}</dd><a v-if="safeLink(image.licenseUrl)" :href="safeLink(image.licenseUrl)" target="_blank" rel="noopener noreferrer">{{ label('licenseLink') }} ↗</a><small v-else>{{ label('noLicenseLink') }}</small><p v-if="image.publicDomainBasis">{{ label('basis') }}: {{ image.publicDomainBasis }}</p></div>
        <div><dt>{{ label('source') }}</dt><dd>{{ image.source }}</dd><a v-if="safeLink(image.sourceUrl)" :href="safeLink(image.sourceUrl)" target="_blank" rel="noopener noreferrer">{{ label('sourceLink') }} ↗</a></div>
        <div v-if="image.originalSource"><dt>{{ label('originalSource') }}</dt><dd>{{ image.originalSource }}</dd><a v-if="safeLink(image.originalSourceUrl)" :href="safeLink(image.originalSourceUrl)" target="_blank" rel="noopener noreferrer">{{ label('originalLink') }} ↗</a></div>
      </dl>
      <p v-if="image.requiredAttribution">{{ image.requiredAttribution }}</p>
      <p v-if="image.attribution" class="muted">{{ image.attribution }}</p>
      <p><strong>{{ label('changes') }}:</strong> {{ image.modifications }}</p>
      <p v-if="image.shareAlike" class="muted">{{ label('shareAlike') }}</p>
    </div>
  </Modal>
</template>
