<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { registerMessages, t, errorMessage, toast } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
interface Settings { enabled: boolean; username: string; profileUrl: string }
const settings = ref<Settings>(), enabled = ref(false);
const busy = ref(false), error = ref("");
// Social features stay online; nothing is queued offline.
async function load() {
  try {
    settings.value = await api<Settings>("/social/profile", { networkOnly: true });
    enabled.value = settings.value.enabled;
  } catch (caught) { error.value = navigator.onLine ? errorMessage(caught) : t("socialProfile.offline"); }
}
onMounted(() => void load());
async function save() {
  if (busy.value) return;
  busy.value = true;error.value = "";
  try {
    settings.value = await api<Settings>("/social/profile", { method: "PUT", networkOnly: true, body: { enabled: enabled.value } });
    toast(t(settings.value.enabled ? "socialProfile.enabledSaved" : "socialProfile.disabledSaved"));
  } catch (caught) {
    error.value = navigator.onLine ? errorMessage(caught) : t("socialProfile.offline");
    if (settings.value) enabled.value = settings.value.enabled;
  } finally { busy.value = false; }
}
</script>
<template>
  <section class="card stack" data-social-profile-settings>
    <h2 style="margin:0">👤 {{ t("socialProfile.settingsTitle") }}</h2>
    <p class="muted" style="margin:0">{{ t("socialProfile.settingsHelp") }}</p>
    <p v-if="!settings && !error" class="muted">{{ t("common.loading") }}</p>
    <form v-if="settings" class="stack" @submit.prevent="save">
      <label class="terms-consent"><input v-model="enabled" type="checkbox" :disabled="busy" /><span>{{ t("socialProfile.enable") }}</span></label>
      <p class="compat-box warn">{{ t(enabled ? "socialProfile.publicNotice" : "socialProfile.disabledNotice") }}</p>
      <div class="row">
        <button class="btn" :disabled="busy || enabled === settings.enabled">{{ t(busy ? "common.loading" : "common.save") }}</button>
        <a class="btn ghost" :href="settings.profileUrl">{{ t(settings.enabled ? "socialProfile.view" : "socialProfile.preview") }}</a>
      </div>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
