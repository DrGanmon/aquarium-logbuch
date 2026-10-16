<script setup lang="ts">
import { t } from '../state';
import type { CatalogVariant } from '../../../src/shared/catalog-variants';
defineProps<{ modelValue: string; rootId: string; variants?: CatalogVariant[]; disabled?: boolean }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <label v-if="variants?.length">{{ t(rootId === 'ancistrus-sp' ? 'variants.speciesLabel' : 'variants.label') }}
    <select :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <option :value="rootId">{{ t('variants.base') }}</option>
      <option v-for="variant in variants" :key="variant.id" :value="variant.id">{{ variant.name }} · {{ t('variants.' + variant.kind) }}</option>
    </select>
  </label>
  <p v-if="variants?.find(item => item.id === modelValue)?.description" class="muted">{{ variants.find(item => item.id === modelValue)?.description }}</p>
</template>
