<script setup lang="ts">
import Modal from "./Modal.vue";
import { t } from "../state";
import { useFrontendUpdate } from "../composables/frontend-update";

const { availableVersion, ready, applying, failed, dismiss, reload } = useFrontendUpdate();
</script>

<template>
  <Modal v-if="availableVersion" :title="t('frontendUpdate.title')" @close="dismiss">
    <p>{{ t("frontendUpdate.message", { version: availableVersion.slice(0, 12) }) }}</p>
    <p class="muted">{{ t("frontendUpdate.warning") }}</p>
    <p v-if="!ready" class="muted" role="status">{{ t("frontendUpdate.preparing") }}</p>
    <p v-if="failed" role="alert">{{ t("frontendUpdate.failed") }}</p>
    <div class="row">
      <button type="button" class="btn" :disabled="!ready || applying" @click="reload">{{ t("frontendUpdate.reload") }}</button>
      <button type="button" class="btn ghost" :disabled="applying" @click="dismiss">{{ t("frontendUpdate.later") }}</button>
    </div>
  </Modal>
</template>
