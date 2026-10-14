<script setup lang="ts">
import { ref, onMounted, type CSSProperties } from "vue";
import { t } from "../state";
defineProps<{ title: string; persistent?: boolean; wide?: boolean; dialogClass?: string; dialogStyle?: CSSProperties }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      :class="[{ wide }, dialogClass]"
      :style="dialogStyle"
      @cancel.prevent="!persistent && emit('close')"
      @click="
        (event) => {
          if (!persistent && event.target === dialog) emit('close');
        }
      "
    >
      <div class="stack">
        <div class="row between">
          <h2 style="margin: 0">{{ title }}</h2>
          <button
            v-if="!persistent"
            class="btn small ghost"
            type="button"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <slot />
      </div></dialog
  ></Teleport>
</template>
