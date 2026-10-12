<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { t } from "../state";
defineProps<{ loaded: boolean; loading: boolean; error: string; label: string }>();
const emit = defineEmits<{ activate: [] }>();
const root = ref<HTMLElement>();
const activated = ref(false);
function activate() { activated.value = true; emit("activate"); }
let observer: IntersectionObserver | undefined;
onMounted(() => {
  if (!root.value) return;
  if (!("IntersectionObserver" in window)) { activate(); return; }
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer?.disconnect();
      activate();
    }
  }, { rootMargin: "200px" });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div ref="root" class="lazy-section" :aria-busy="loading" :aria-label="label">
    <p v-if="error" class="error" role="alert">{{ error }} <button class="btn small ghost" type="button" :disabled="loading" @click="activate">{{ t('detail.lazyRetry') }}</button></p>
    <slot v-if="activated && loaded" />
    <div v-else class="card stack lazy-placeholder">
      <h2>{{ label }}</h2>
      <p class="muted" role="status">{{ loading ? t('common.loading') : t('detail.lazyWaiting') }}</p>
    </div>
    <p v-if="loading && loaded" class="muted" role="status">{{ t('common.loading') }}</p>
  </div>
</template>
