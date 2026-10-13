<script setup lang="ts">
import Modal from "./Modal.vue";
import { t } from "../state";
import { useFrontendUpdate } from "../composables/frontend-update";

const { availableVersion, dismiss, reload } = useFrontendUpdate();
</script>

<template>
  <Modal v-if="availableVersion" :title="t('frontendUpdate.title')" @close="dismiss">
    <p>{{ t("frontendUpdate.message", { version: availableVersion }) }}</p>
    <p class="muted">{{ t("frontendUpdate.warning") }}</p>
    <div class="row">
      <button type="button" class="btn" @click="reload">{{ t("frontendUpdate.reload") }}</button>
      <button type="button" class="btn ghost" @click="dismiss">{{ t("frontendUpdate.later") }}</button>
    </div>
  </Modal>
</template>
