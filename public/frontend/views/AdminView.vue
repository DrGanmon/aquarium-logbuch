<script setup lang="ts">
import AdminPanel from "../components/AdminPanel.vue";
</script>
<template>
  <div class="stack">
    <div>
      <a class="muted" href="#/">‹ Zurück zur Übersicht</a>
      <h1 style="margin-top: 0.3rem">Benutzerverwaltung & Administration</h1>
    </div>
    <AdminPanel
      v-for="section in [
        'users',
        'registration',
        'legal-config',
        'mail',
        'backups',
        'logs',
      ]"
      :key="section"
      :section="section"
    />
  </div>
</template>
