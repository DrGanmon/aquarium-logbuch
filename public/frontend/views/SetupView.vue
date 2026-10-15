<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api, refreshSession } from "../api";
import { errorMessage, language, session, t } from "../state";

const termsVersion = ref("");
const busy = ref(false), error = ref("");
const form = reactive({
  username: "", email: "", password: "", repeat: "", acceptTerms: false,
  smtpEnabled: false, smtpHost: "", smtpPort: 587, smtpSecure: false, smtpUser: "", smtpPass: "", smtpFrom: "",
  backupEnabled: true, backupPassword: "", intervalHours: 24, retentionCount: 10, includeFiles: true,
  registrationMode: "open",
});
onMounted(async () => {
  try { termsVersion.value = (await api<{ termsVersion: string }>("/setup/status")).termsVersion; }
  catch (caught) { error.value = errorMessage(caught); }
});
async function submit() {
  if (busy.value) return;
  error.value = "";
  if (form.password !== form.repeat) { error.value = t("setup.passwordMismatch"); return; }
  busy.value = true;
  try {
    await api("/setup/complete", { method: "POST", body: {
      username: form.username, email: form.email, password: form.password, language: language.value,
      acceptTerms: form.acceptTerms, termsVersion: termsVersion.value,
      smtp: { enabled: form.smtpEnabled, host: form.smtpHost, port: form.smtpPort, secure: form.smtpSecure,
        user: form.smtpUser, pass: form.smtpPass, from: form.smtpFrom, rejectUnauthorized: true },
      backup: { enabled: form.backupEnabled, password: form.backupPassword, intervalHours: form.intervalHours,
        retentionCount: form.retentionCount, includeFiles: form.includeFiles },
      registration: { mode: form.registrationMode },
    } });
    session.setupRequired = false;
    await refreshSession(); location.hash = "#/";
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="page-shell setup-page">
    <form class="card stack" @submit.prevent="submit">
      <h1>🐠 {{ t("setup.title") }}</h1><p class="muted">{{ t("setup.intro") }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <fieldset class="stack"><legend>{{ t("setup.admin") }}</legend>
        <label>{{ t("auth.username") }}<input v-model="form.username" required autocomplete="username" /></label>
        <label>{{ t("auth.email") }}<input v-model="form.email" required type="email" autocomplete="email" /></label>
        <label>{{ t("auth.password") }}<input v-model="form.password" required minlength="8" type="password" autocomplete="new-password" /></label>
        <label>{{ t("auth.passwordRepeat") }}<input v-model="form.repeat" required minlength="8" type="password" autocomplete="new-password" /></label>
      </fieldset>
      <fieldset class="stack"><legend>{{ t("setup.smtp") }}</legend>
        <label class="row"><input v-model="form.smtpEnabled" type="checkbox" />{{ t("setup.smtpEnable") }}</label>
        <template v-if="form.smtpEnabled">
          <label>{{ t("setup.host") }}<input v-model="form.smtpHost" required /></label><label>{{ t("setup.port") }}<input v-model.number="form.smtpPort" type="number" min="1" max="65535" required /></label>
          <label class="row"><input v-model="form.smtpSecure" type="checkbox" />{{ t("setup.smtpSecure") }}</label>
          <label>{{ t("setup.smtpUser") }}<input v-model="form.smtpUser" /></label><label>{{ t("setup.smtpPassword") }}<input v-model="form.smtpPass" type="password" /></label>
          <label>{{ t("setup.smtpFrom") }}<input v-model="form.smtpFrom" required /></label>
        </template>
      </fieldset>
      <fieldset class="stack"><legend>{{ t("setup.backup") }}</legend>
        <label class="row"><input v-model="form.backupEnabled" type="checkbox" />{{ t("setup.backupEnable") }}</label>
        <label>{{ t("setup.backupPassword") }}<input v-model="form.backupPassword" :required="form.backupEnabled" minlength="12" type="password" /></label>
        <label>{{ t("setup.interval") }}<input v-model.number="form.intervalHours" type="number" min="1" max="720" /></label>
        <label>{{ t("setup.retention") }}<input v-model.number="form.retentionCount" type="number" min="1" max="100" /></label>
        <label class="row"><input v-model="form.includeFiles" type="checkbox" />{{ t("setup.includeFiles") }}</label>
      </fieldset>
      <fieldset class="stack"><legend>{{ t("setup.registration") }}</legend>
        <label>{{ t("setup.registrationMode") }}
          <select v-model="form.registrationMode" required>
            <option value="open">{{ t("setup.registrationOpen") }}</option>
            <option value="invite_admin">{{ t("setup.registrationInviteAdmin") }}</option>
            <option value="invite_open">{{ t("setup.registrationInviteOpen") }}</option>
            <option value="closed">{{ t("setup.registrationClosed") }}</option>
          </select>
        </label>
        <p class="muted">{{ t(`setup.registrationHint.${form.registrationMode}`) }}</p>
      </fieldset>
      <label class="row"><input v-model="form.acceptTerms" required type="checkbox" /> <span>{{ t("setup.acceptTerms", { version: termsVersion }) }}</span></label>
      <button class="btn primary" type="submit" :disabled="busy">{{ busy ? t("common.saving") : t("setup.complete") }}</button>
    </form>
  </section>
</template>

<style scoped>.setup-page { max-width: 52rem; margin: 0 auto; } fieldset { border: 1px solid var(--border); border-radius: .75rem; padding: 1rem; } legend { font-weight: 700; padding: 0 .4rem; } label:not(.row) { display: grid; gap: .35rem; }</style>
