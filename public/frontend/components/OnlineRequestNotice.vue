<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { language } from '../state';
const props = defineProps<{ retry: () => Promise<boolean>; cancel: () => void; mutation: boolean }>();
const dialog = ref<HTMLDialogElement>();
const checking = ref(false);
const failed = ref(false);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => { dialog.value?.close();previousFocus?.focus(); });
async function check() {
  if (checking.value) return;
  checking.value = true;
  try { failed.value = !await props.retry(); } finally { checking.value = false; }
}
</script>
<template>
  <dialog ref="dialog" :aria-label="language === 'en' ? 'Currently offline' : 'Gerade offline'" @cancel.prevent="cancel">
    <div class="stack">
      <h2>{{ language === 'en' ? 'Currently offline' : 'Gerade offline' }}</h2>
      <p>{{ language === 'en' ? 'The client cannot reach the server. This feature will be available again when connected. Your local aquarium data remains available.' : 'Der Client kann den Server gerade nicht erreichen. Diese Funktion ist mit einer Verbindung wieder verfügbar. Deine lokalen Aquariendaten bleiben nutzbar.' }}</p>
      <p v-if="mutation">{{ language === 'en' ? 'If the connection broke during submission, check whether the action already succeeded before retrying.' : 'Falls die Verbindung während der Übertragung abbrach, prüfe vor dem Wiederholen, ob die Aktion bereits ausgeführt wurde.' }}</p>
      <p v-if="failed" role="status">{{ language === 'en' ? 'Still offline. Please check your connection and try again.' : 'Weiterhin offline. Bitte prüfe deine Verbindung und versuche es erneut.' }}</p>
      <button class="btn" type="button" :disabled="checking" @click="check">{{ checking ? (language === 'en' ? 'Checking…' : 'Wird geprüft…') : (language === 'en' ? 'Check now' : 'Jetzt prüfen') }}</button>
      <button class="btn ghost" type="button" @click="cancel">{{ language === 'en' ? 'Close' : 'Schließen' }}</button>
    </div>
  </dialog>
</template>
