<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { api } from "../api";
import { session, t, errorMessage, toast } from "../state";
import type { User } from "../types";
const props = defineProps<{
  provider: string;
  title: string;
  model?: string;
  masked?: string | null;
  keySet?: boolean;
}>();
const key = ref("");
const model = ref(props.model || "");
const models = ref<{ id: string; name?: string }[]>([]);
const error = ref("");
const message = ref("");
const busy = ref(false);
let debounce: ReturnType<typeof setTimeout>;
watch(key, (value) => {
  clearTimeout(debounce);
  if (value.length >= 8)
    debounce = setTimeout(() => {
      void fetchModels();
    }, 600);
});
onBeforeUnmount(() => clearTimeout(debounce));
onMounted(() => {
  if (props.masked) void fetchModels();
});
async function fetchModels() {
  try {
    const result = await api<{
      models: ({ id: string; name?: string } | string)[];
    }>(`/me/${props.provider}/models`, {
      method: "POST",
      body: { apiKey: key.value || undefined },
    });
    models.value = result.models.map((item) =>
      typeof item === "string" ? { id: item } : item,
    );
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function action(type: "save" | "test" | "delete") {
  if (busy.value) return;
  if (type === "delete" && !confirm("API-Schlüssel entfernen?")) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await api<{ user?: User; message?: string }>(
      `/me/${props.provider}${type === "test" ? "/test" : ""}`,
      {
        method: type === "save" ? "PUT" : type === "test" ? "POST" : "DELETE",
        body:
          type === "delete"
            ? undefined
            : { apiKey: key.value || undefined, model: model.value },
      },
    );
    if (result.user) session.user = result.user;
    message.value = result.message || t("common.saved");
    if (type !== "test") {
      key.value = "";
      toast(message.value);
    }
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <form
    class="stack"
    style="
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--bg);
      gap: 0.75rem;
    "
    @submit.prevent="action('save')"
  >
    <div class="row between">
      <h3 style="margin: 0">{{ title }}</h3>
      <span v-if="masked" class="chip ok">{{ masked }}</span>
    </div>
    <label
      >API-Schlüssel<input
        v-model="key"
        type="password"
        autocomplete="off"
        placeholder="Neuen Schlüssel eingeben" /></label
    ><label
      >Modell<input v-model="model" :list="`models-${provider}`" /><datalist
        :id="`models-${provider}`"
      >
        <option v-for="item in models" :key="item.id" :value="item.id">
          {{ item.name }}
        </option>
      </datalist></label
    >
    <div class="row">
      <button class="btn small" :disabled="busy">{{ t("common.save") }}</button
      ><button
        class="btn small ghost"
        type="button"
        :disabled="busy"
        @click="fetchModels"
      >
        Modelle laden</button
      ><button
        class="btn small ghost"
        type="button"
        :disabled="busy"
        @click="action('test')"
      >
        🧪 Verbindung testen</button
      ><button
        v-if="keySet"
        class="btn small ghost danger"
        type="button"
        :disabled="busy"
        @click="action('delete')"
      >
        Schlüssel entfernen
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="message" class="compat-box ok">{{ message }}</p>
  </form>
</template>
