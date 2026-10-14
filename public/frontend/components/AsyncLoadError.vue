<script setup lang="ts">
import { t } from '../state';
function reload() { location.reload(); }
</script>
<template>
  <div class="card stack" role="alert">
    <p>{{ t('common.moduleLoadFailed') }}</p>
    <button type="button" class="btn ghost" @click="reload">{{ t('common.reloadPage') }}</button>
  </div>
</template>
