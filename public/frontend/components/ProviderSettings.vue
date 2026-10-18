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
const models = ref<{ value: string; label: string }[]>([]);
const error = ref("");
const message = ref("");
const busy = ref(false);
const loadingModels = ref(false);
const lifecycle = new AbortController();
let modelRequest: AbortController | undefined;
let debounce: ReturnType<typeof setTimeout>;

watch(key, (value) => {
  modelRequest?.abort();
  clearTimeout(debounce);
  const trimmed = value.trim();
  if (trimmed.length >= 8) {
    debounce = setTimeout(() => {
      void fetchModels();
    }, 600);
  } else if (!trimmed && !props.masked && !props.keySet) {
    models.value = [];
    model.value = "";
    error.value = "";
  }
});

watch(
  () => props.model,
  (val) => {
    if (val) model.value = val;
  }
);

watch(
  () => props.masked,
  (val) => {
    if (val && models.value.length === 0) {
      void fetchModels();
    }
  }
);

onBeforeUnmount(() => {
  clearTimeout(debounce);
  modelRequest?.abort();
  lifecycle.abort();
});

onMounted(() => {
  if (props.masked || props.keySet) {
    void fetchModels();
  }
});

async function fetchModels() {
  const currentKey = key.value.trim();
  if (!currentKey && !props.masked && !props.keySet) {
    error.value = t("profile.enterKeyToFetchModels") || "Bitte gib zuerst einen API-Schlüssel ein.";
    models.value = [];
    return;
  }
  modelRequest?.abort();
  const request = new AbortController();
  modelRequest = request;
  loadingModels.value = true;
  error.value = "";
  try {
    const result = await api<{
      models: ({ value?: string; label?: string; id?: string; name?: string } | string)[];
    }>(`/me/${props.provider}/models`, {
      method: "POST",
      body: { apiKey: currentKey || undefined },
      signal: request.signal,
    });
    if (request.signal.aborted) return;
    const parsedModels = (result.models || [])
      .map((item) => {
        if (typeof item === "string") return { value: item, label: item };
        const val = item.value || item.id || "";
        const lbl = item.label || item.name || val;
        return { value: val, label: lbl };
      })
      .filter((m) => Boolean(m.value));

    models.value = parsedModels;
    if (parsedModels.length > 0) {
      if (!model.value || !parsedModels.some((m) => m.value === model.value)) {
        model.value = parsedModels[0].value;
      }
    } else {
      model.value = "";
    }
  } catch (e) {
    if (!request.signal.aborted) {
      error.value = errorMessage(e);
      models.value = [];
    }
  } finally {
    if (!request.signal.aborted) {
      loadingModels.value = false;
    }
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
        signal: lifecycle.signal,
        method: type === "save" ? "PUT" : type === "test" ? "POST" : "DELETE",
        body:
          type === "delete"
            ? undefined
            : { apiKey: key.value.trim() || undefined, model: model.value },
      },
    );
    if (result.user) session.user = result.user;
    message.value = result.message || t("common.saved");
    if (type === "delete") {
      key.value = "";
      models.value = [];
      model.value = "";
      toast(message.value);
    } else if (type === "save") {
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
      background: var(--paper);
      gap: 0.75rem;
    "
    @submit.prevent="action('save')"
  >
    <div class="row between">
      <h3 style="margin: 0">{{ title }}</h3>
      <span v-if="masked" class="chip ok">{{ masked }}</span>
    </div>
    <label
      >{{ t("profile.apiKeyLabel") }}<input
        v-model="key"
        type="password"
        autocomplete="off"
        :placeholder="t('profile.apiKeyPlaceholder')" /></label
    ><label
      >{{ t("profile.modelLabel") }}<select
        v-model="model"
        :disabled="busy || loadingModels || (models.length === 0 && !masked && !key.trim())"
      >
        <option v-if="loadingModels" value="" disabled>
          {{ t("profile.fetchingModels") }}
        </option>
        <option v-else-if="models.length === 0" value="" disabled>
          {{ (masked || key.trim()) ? t("profile.noModelsFound") : t("profile.enterKeyToFetchModels") }}
        </option>
        <option v-for="item in models" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select></label
    >
    <div class="row">
      <button class="btn small" :disabled="busy">{{ t("common.save") }}</button
      ><button
        class="btn small ghost"
        type="button"
        :disabled="busy || loadingModels"
        @click="fetchModels"
      >
        {{ loadingModels ? t("profile.fetchingModels") : t("profile.fetchModels") }}</button
      ><button
        class="btn small ghost"
        type="button"
        :disabled="busy || (!masked && !key.trim())"
        @click="action('test')"
      >
        {{ t("profile.testConnection") }}</button
      ><button
        v-if="keySet"
        class="btn small ghost danger"
        type="button"
        :disabled="busy"
        @click="action('delete')"
      >
        {{ t("profile.deleteKey") }}
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="message" class="compat-box ok">{{ message }}</p>
  </form>
</template>
