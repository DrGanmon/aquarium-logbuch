<script setup lang="ts">
import { computed } from "vue";
import Modal from "./Modal.vue";
import { confirmRequest } from "../dialog";
import { t } from "../state";
const request = computed(() => confirmRequest.value);
</script>
<template>
  <Modal v-if="request" :key="request.message" :title="request.title" dialog-class="confirm-dialog" @close="request.resolve(false)">
    <form class="stack" data-confirm-dialog @submit.prevent="request.resolve(true)">
      <p style="margin: 0; white-space: pre-line">{{ request.message }}</p>
      <div class="row confirm-actions">
        <button type="button" class="btn ghost" @click="request.resolve(false)">{{ t("common.cancel") }}</button>
        <button type="submit" class="btn" :class="{ danger: request.danger }" autofocus>{{ request.confirmLabel || t("common.confirm") }}</button>
      </div>
    </form>
  </Modal>
</template>
