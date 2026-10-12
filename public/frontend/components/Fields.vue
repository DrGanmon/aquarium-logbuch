<script setup lang="ts">
import type { Field, FormData } from "../types";
defineProps<{ fields: Field[]; model: FormData }>();
</script>
<template>
  <div v-for="field in fields" :key="field.key" class="field">
    <label :for="`field-${field.key}`">{{ field.label }}</label
    ><select
      v-if="field.options"
      :id="`field-${field.key}`"
      v-model="model[field.key]"
      :required="field.required"
    >
      <option v-for="(label, key) in field.options" :key="key" :value="key">
        {{ label }}
      </option></select
    ><textarea
      v-else-if="field.type === 'textarea'"
      :id="`field-${field.key}`"
      :value="String(model[field.key] ?? '')"
      @input="model[field.key] = ($event.target as HTMLTextAreaElement).value"
      :required="field.required"
      rows="3"
    /><input
      v-else-if="field.type === 'checkbox'"
      :id="`field-${field.key}`"
      v-model="model[field.key]"
      type="checkbox"
    /><input
      v-else
      :id="`field-${field.key}`"
      v-model="model[field.key]"
      :type="field.type || 'text'"
      :required="field.required"
      :min="field.min"
      :max="field.max"
      :step="field.type === 'number' ? 'any' : undefined"
    />
  </div>
</template>
