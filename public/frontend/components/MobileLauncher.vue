<script setup lang="ts">
import { ref } from 'vue';
import { normalizeServer } from '../mobile-runtime';
defineProps<{ native: boolean }>();
const emit = defineEmits<{ connect: [server: string] }>();
const server = ref(localStorage.getItem('aquarium_mobile_server') || '');
const error = ref('');
function connect() {
  try {
    const address = normalizeServer(server.value);
    localStorage.setItem('aquarium_mobile_server', address);
    emit('connect', address);
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
</script>
<template>
  <main class="auth" style="padding: max(24px, env(safe-area-inset-top)) 16px">
    <form class="card stack" @submit.prevent="connect">
      <h1>Aquarium-Logbuch · Prototyp</h1>
      <p>Verbinde die App mit deinem Aquarium-Server. Offline-Daten bleiben je Server und Konto getrennt auf diesem Gerät.</p>
      <label>Serveradresse / Server URL
        <input v-model="server" type="url" placeholder="https://aquarium.example.org/" required autocomplete="url" autocapitalize="none" spellcheck="false" />
      </label>
      <p>Die Serverauswahl erscheint bei jedem Neustart. Ausstehende Änderungen bleiben beim bisherigen Server gespeichert.</p>
      <p v-if="!native" role="alert">Diese Vorschau zeigt nur die Serverauswahl. Die Verbindung benötigt die native Android- oder iOS-App.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <button class="btn" type="submit" :disabled="!native">Verbinden / Connect</button>
    </form>
  </main>
</template>
