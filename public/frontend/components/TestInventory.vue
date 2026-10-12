<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "../api";
import { t, language, toast, errorMessage } from "../state";
import type { TestInventoryItem } from "../types";
const props = defineProps<{ suiteId: string; selectedTests: string[] }>();
const items = ref<TestInventoryItem[]>([]);
const error = ref("");
const busy = ref(false);
const loading = ref(false);
let generation = 0;
const visible = computed(() => items.value.filter((item) => props.selectedTests.includes(item.key)));
watch([() => props.suiteId, language], async () => {
  const current = ++generation;
  items.value = [];
  error.value = "";
  if (!props.suiteId) return;
  loading.value = true;
  try {
    const response = await api<{ items: TestInventoryItem[] }>(`/me/test-inventory?suiteId=${encodeURIComponent(props.suiteId)}`);
    if (current === generation) items.value = response.items;
  } catch (e) {
    if (current === generation) error.value = errorMessage(e);
  } finally {
    if (current === generation) loading.value = false;
  }
}, { immediate: true });
function percentage(item: TestInventoryItem) {
  return Number(item.capacity) > 0 ? Math.round(Number(item.used) / Number(item.capacity) * 100) : null;
}
function changeVariant(item: TestInventoryItem) {
  const variant = item.consumable.variants.find((option) => option.id === item.variant);
  item.capacity = variant?.capacity ?? null;
  item.tracksUsage = variant?.trackUsage !== false;
}
async function save(item: TestInventoryItem, reset = false) {
  if (busy.value) return;
  if (reset && !confirm(t("testInventory.resetConfirm", { name: item.name }))) return;
  busy.value = true;
  error.value = "";
  const current = generation;
  try {
    const result = await api<{ items: TestInventoryItem[] }>(`/me/test-inventory/${encodeURIComponent(item.key)}`, {
      method: "PUT",
      body: {
        suiteId: props.suiteId,
        used: reset ? 0 : Number(item.used),
        capacity: item.capacity === "" || item.capacity == null ? null : Number(item.capacity),
        ...(item.variant ? { variant: item.variant } : {}),
        reminderEnabled: item.reminderEnabled,
        reset,
      },
    });
    if (current === generation) {
      const index = items.value.findIndex((entry) => entry.key === item.key);
      const updated = result.items.find((entry) => entry.key === item.key);
      if (updated && index >= 0) items.value[index] = updated;
      toast(t("common.saved"));
    }
  } catch (e) {
    if (current === generation) error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="visible.length || loading || error" class="card stack">
    <h2>{{ t("testInventory.title") }}</h2>
    <p class="muted">{{ t("testInventory.description") }}</p>
    <p v-if="loading" role="status">{{ t("common.loading") }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="test-inventory-grid">
      <form v-for="item in visible" :key="item.key" class="test-inventory-item stack" @submit.prevent="save(item)">
        <h3>{{ item.name }}</h3>
        <label v-if="item.consumable.variants.length">
          {{ t("testInventory.variant") }}
          <select v-model="item.variant" @change="changeVariant(item)">
            <option v-for="variant in item.consumable.variants" :key="variant.id" :value="variant.id">{{ variant.name }}</option>
          </select>
        </label>
        <p class="muted">{{ item.consumable.note }}</p>
        <template v-if="item.tracksUsage">
          <div class="grid2">
            <label>{{ t("testInventory.used") }}<input v-model.number="item.used" type="number" min="0" max="1000000" step="1" required /></label>
            <label>{{ t("testInventory.capacity") }}<input v-model.number="item.capacity" type="number" min="1" max="1000000" step="1" :placeholder="t('testInventory.unknownCapacity')" /></label>
          </div>
          <template v-if="percentage(item) !== null">
            <progress :value="Math.min(100, percentage(item)!)" max="100" :aria-label="t('testInventory.progress', { name: item.name })" />
            <p :class="{ error: Number(item.used) >= Math.ceil(Number(item.capacity) * 0.75) }">
              {{ t("testInventory.status", { used: item.used, capacity: item.capacity, remaining: Math.max(0, Number(item.capacity) - Number(item.used)), percent: percentage(item) }) }}
            </p>
          </template>
          <p v-else class="muted">{{ t("testInventory.capacityHint") }}</p>
          <label class="row"><input v-model="item.reminderEnabled" type="checkbox" />{{ t("testInventory.reminder") }}</label>
          <p v-if="item.reminderSentAt" class="muted">{{ t("testInventory.reminderSent") }}</p>
        </template>
        <p v-else class="muted">{{ t("testInventory.noReagent") }}</p>
        <p><a :href="item.consumable.source" target="_blank" rel="noopener noreferrer">{{ t("testInventory.source") }}</a></p>
        <div class="row">
          <button class="btn small" :disabled="busy">{{ t("common.save") }}</button>
          <button v-if="item.tracksUsage" class="btn small ghost" type="button" :disabled="busy" @click="save(item, true)">{{ t("testInventory.reset") }}</button>
        </div>
      </form>
    </div>
  </section>
</template>
