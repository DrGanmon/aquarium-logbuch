<script setup lang="ts">
import Icon from "./Icon.vue";
import { registerMessages, t } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
defineProps<{ show: boolean }>();
</script>
<template>
  <span v-if="show" class="sync-badge" :title="t('aquariumView.unsyncedTitle')" data-sync-badge><Icon name="sync" :size="14" />{{ t("aquariumView.unsynced") }}</span>
</template>
