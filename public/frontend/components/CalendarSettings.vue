<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { registerMessages, t, errorMessage, toast } from "../state";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
registerMessages({ de: featuresDe, en: featuresEn });
interface CalDavAccess { username: string; password: string; created_at: string; serverUrl: string; calendarUrl: string; wellKnownUrl: string }
const access = ref<CalDavAccess>(), error = ref(""), busy = ref(false), showPassword = ref(false), downloading = ref(false);
const year = new Date().getFullYear();
// Account credentials are only available online.
async function load(regenerate = false) {
  if (busy.value) return;
  if (regenerate && !confirm(t("calendar.regenerateConfirm"))) return;
  busy.value = true;error.value = "";
  try {
    access.value = await api<CalDavAccess>(regenerate ? "/me/caldav/password" : "/me/caldav", { method: regenerate ? "POST" : "GET", networkOnly: true });
    if (regenerate) { showPassword.value = true;toast(t("calendar.regenerated")); }
  } catch (caught) { error.value = navigator.onLine ? errorMessage(caught) : t("calendar.offline"); }
  finally { busy.value = false; }
}
onMounted(() => void load());
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value);toast(t("calendar.copied")); }
  catch { error.value = t("calendar.copyFailed"); }
}
async function download() {
  if (downloading.value) return;
  downloading.value = true;error.value = "";
  try {
    const response = await fetch("api/me/calendar.ics", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? t("calendar.loginRequired") : `HTTP ${response.status}`);
    const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || `aquarienpflege-${year}-${year + 1}.ics`;
    const url = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(link);link.click();link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (caught) { error.value = navigator.onLine ? errorMessage(caught) : t("calendar.offline"); }
  finally { downloading.value = false; }
}
</script>
<template>
  <section class="card stack" data-calendar-settings>
    <h2 style="margin:0">📅 {{ t("calendar.title") }}</h2>
    <p class="muted" style="margin:0">{{ t("calendar.help") }}</p>
    <div class="stack">
      <h3 style="margin:0">{{ t("calendar.downloadTitle") }}</h3>
      <p class="muted" style="margin:0">{{ t("calendar.downloadHelp", { from: year, to: year + 1 }) }}</p>
      <div><button type="button" class="btn" :disabled="downloading" @click="download">{{ downloading ? t("common.loading") : t("calendar.download", { from: year, to: year + 1 }) }}</button></div>
    </div>
    <div class="stack">
      <h3 style="margin:0">{{ t("calendar.caldavTitle") }}</h3>
      <p class="muted" style="margin:0">{{ t("calendar.caldavHelp") }}</p>
      <p v-if="busy && !access" class="muted">{{ t("common.loading") }}</p>
      <dl v-if="access" class="caldav-access">
        <dt>{{ t("calendar.server") }}</dt>
        <dd><code>{{ access.serverUrl }}</code><button type="button" class="btn small ghost" @click="copy(access.serverUrl)">{{ t("calendar.copy") }}</button></dd>
        <dt>{{ t("calendar.username") }}</dt>
        <dd><code>{{ access.username }}</code><button type="button" class="btn small ghost" @click="copy(access.username)">{{ t("calendar.copy") }}</button></dd>
        <dt>{{ t("calendar.password") }}</dt>
        <dd>
          <code data-caldav-password>{{ showPassword ? access.password : "••••••••••••••••" }}</code>
          <button type="button" class="btn small ghost" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ t(showPassword ? "calendar.hide" : "calendar.show") }}</button>
          <button type="button" class="btn small ghost" @click="copy(access.password)">{{ t("calendar.copy") }}</button>
        </dd>
        <dt>{{ t("calendar.calendarUrl") }}</dt>
        <dd><code>{{ access.calendarUrl }}</code><button type="button" class="btn small ghost" @click="copy(access.calendarUrl)">{{ t("calendar.copy") }}</button></dd>
      </dl>
      <p class="muted" style="margin:0">{{ t("calendar.passwordHelp") }}</p>
      <ul class="muted caldav-steps">
        <li>{{ t("calendar.ios") }}</li>
        <li>{{ t("calendar.android") }}</li>
        <li>{{ t("calendar.desktop") }}</li>
      </ul>
      <div><button type="button" class="btn small ghost danger" :disabled="busy" @click="load(true)">{{ t("calendar.regenerate") }}</button></div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.caldav-access { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: .5rem 1rem; margin: 0; align-items: center; }
.caldav-access dt { font-weight: 600; }
.caldav-access dd { margin: 0; display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; min-width: 0; }
.caldav-access code { overflow-wrap: anywhere; padding: .2rem .4rem; border-radius: 6px; background: var(--paper); border: 1px solid var(--line); }
.caldav-steps { margin: 0; padding-left: 1.2rem; }
@media (max-width: 560px) { .caldav-access { grid-template-columns: 1fr; } }
</style>
