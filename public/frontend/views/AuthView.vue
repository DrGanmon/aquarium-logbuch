<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { api, refreshSession } from "../api";
import { route } from "../router";
import {
  language,
  theme,
  themeIcon,
  toggleTheme,
  t,
  errorMessage,
  session,
} from "../state";
import type { Registration } from "../types";
const info = ref<Registration>({
  termsVersion: "",
  registration: true,
  localLogin: true,
  oidc: false,
  oidcName: "Pocket ID",
  isClosed: false,
  isInviteOnly: false,
});
const mode = computed(() =>
  route.value.path === "/register"
    ? "register"
    : route.value.path === "/forgot-password"
      ? "forgot"
      : route.value.path.slice(1) || "login",
);
const fields = reactive({
  acceptTerms: false,
  username: "",
  email: route.value.query.get("email") || "",
  password: "",
  repeat: "",
  inviteCode: route.value.query.get("invite") || "",
});
const error = ref(new URLSearchParams(location.search).get("auth_error") || "");
const message = ref("");
const busy = ref(false);
const title = computed(() =>
  t(
    (
      {
        register: "auth.registerTitle",
        forgot: "auth.forgotPasswordTitle",
        "reset-password": "auth.resetPasswordTitle",
        "verify-email": "auth.verifyEmailTitle",
        "delete-account": "auth.deleteAccountTitle",
      } as Record<string, string>
    )[mode.value] || "auth.loginTitle",
  ),
);
onMounted(async () => {
  if (location.search)
    history.replaceState(null, "", location.pathname + location.hash);
  try {
    info.value = await api("/registration");
  } catch (e) {
    error.value = errorMessage(e);
  }
  if (mode.value === "verify-email") await submit();
});
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    let path = "/login";
    let body: object = { username: fields.username, password: fields.password };
    if (mode.value === "register") {
      path = "/register";
      body = { ...fields, language: language.value, termsVersion: info.value.termsVersion };
    }
    if (mode.value === "forgot") {
      path = "/forgot-password";
      body = { identifier: fields.username };
    }
    if (
      ["reset-password", "verify-email", "delete-account"].includes(mode.value)
    ) {
      const token = route.value.query.get("token");
      if (!token) throw new Error("Ungültiger Token.");
      path =
        mode.value === "delete-account"
          ? "/confirm-delete-account"
          : "/" + mode.value;
      if (mode.value === "reset-password" && fields.password !== fields.repeat)
        throw new Error("Die Passwörter stimmen nicht überein.");
      body = { token, password: fields.password };
    }
    const result = await api<{
      message?: string;
      needsVerification?: boolean;
      email?: string;
    }>(path, { method: "POST", body });
    if (
      path === "/login" ||
      (path === "/register" && !result.needsVerification)
    ) {
      await refreshSession();
      location.hash = "#/";
    } else {
      message.value =
        result.message ||
        t(
          mode.value === "reset-password"
            ? "auth.passwordChanged"
            : mode.value === "delete-account"
              ? "auth.accountDeleted"
              : "auth.emailSent",
        );
      if (mode.value === "delete-account") session.user = null;
    }
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function startOidc() {
  if (busy.value) return;
  if (mode.value === 'register' && !fields.acceptTerms) { error.value = t('terms.required');return; }
  busy.value = true;error.value = '';
  try {
    const result = await api<{ url: string }>('/oidc/login', { method: 'POST', body: { acceptTerms: fields.acceptTerms, termsVersion: info.value.termsVersion } });
    location.assign(result.url);
  } catch (e) { error.value = errorMessage(e);busy.value = false; }
}
async function resend() {
  try {
    const result = await api<{ message: string }>("/resend-verification", {
      method: "POST",
      body: { identifier: fields.username },
    });
    message.value = result.message;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <div class="auth">
    <div class="row between" style="margin-bottom: 0.5rem; align-items: center">
      <div style="display: flex; align-items: center; gap: 0.5rem">
        <img
          src="favicon-32x32.png"
          alt="Logo"
          style="width: 28px; height: 28px; border-radius: 6px"
        />
        <p class="muted" style="margin: 0; font-weight: 600">
          {{ t("common.appName") }}
        </p>
      </div>
      <div class="row" style="gap: 0.3rem">
        <button
          class="btn small ghost"
          @click="language = language === 'de' ? 'en' : 'de'"
        >
          🌐 {{ language.toUpperCase() }}</button
        ><button class="btn small ghost" @click="toggleTheme">
          {{ themeIcon }}
          {{ t("common.theme" + theme[0]!.toUpperCase() + theme.slice(1)) }}
        </button>
      </div>
    </div>
    <form class="card stack" @submit.prevent="submit">
      <h1>{{ title }}</h1>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div v-if="message" class="compat-box info" role="status">
        {{ message }}
      </div>
      <template v-if="!message && mode === 'delete-account'"
        ><div class="compat-box danger">
          {{ t("auth.deleteAccountConfirm") }}
        </div>
        <button class="btn danger" :disabled="busy">
          {{ t("auth.deleteAccountBtn") }}
        </button></template
      >
      <template v-else-if="!message && mode === 'reset-password'"
        ><div class="field">
          <label for="new-password">{{ t("auth.password") }}</label
          ><input
            id="new-password"
            v-model="fields.password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>
        <div class="field">
          <label for="repeat">{{ t("auth.passwordRepeat") }}</label
          ><input
            id="repeat"
            v-model="fields.repeat"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>
        <button class="btn" :disabled="busy">
          {{ t("auth.resetPasswordBtn") }}
        </button></template
      >
      <template v-else-if="!message && mode === 'forgot'"
        ><p class="muted">{{ t("auth.forgotPasswordDesc") }}</p>
        <div class="field">
          <label for="ident"
            >{{ t("auth.email") }} / {{ t("auth.username") }}</label
          ><input id="ident" v-model="fields.username" required />
        </div>
        <button class="btn" :disabled="busy">
          {{ t("auth.sendResetLink") }}
        </button></template
      >
      <template
        v-else-if="
          !message &&
          !['verify-email', 'delete-account', 'reset-password'].includes(mode)
        "
      >
        <div
          v-if="mode === 'register' && (info.isClosed || !info.registration)"
          class="compat-box warn"
        >
          {{ t("admin.modeClosed") }}
        </div>
        <label v-if="mode === 'register' || info.oidc" class="terms-consent">
          <input v-model="fields.acceptTerms" type="checkbox" :required="mode === 'register'" :disabled="busy" />
          <span>{{ t('terms.acceptPrefix') }} <a href="#/agb" target="_blank" rel="noopener">{{ t('terms.link') }}</a>{{ t('terms.acceptSuffix') }}
            <small v-if="mode !== 'register'"> {{ t('terms.oidcNotice') }}</small>
          </span>
        </label>
        <template v-if="info.localLogin && !(mode === 'register' && (info.isClosed || !info.registration))"
          ><p
            v-if="mode === 'register' && info.isInviteOnly"
            class="compat-box info"
          >
            🔑 {{ t("auth.inviteCodeHint") }}
          </p>
          <div class="field">
            <label for="u">{{ t("auth.username") }}</label
            ><input
              id="u"
              v-model="fields.username"
              autocomplete="username"
              :placeholder="t('auth.usernamePlaceholder')"
              required
              autofocus
            />
          </div>
          <template v-if="mode === 'register'"
            ><div class="field">
              <label for="e">{{ t("auth.email") }}</label
              ><input
                id="e"
                v-model="fields.email"
                type="email"
                autocomplete="email"
                required
              />
            </div>
            <div class="field">
              <label for="inv">{{ t("auth.inviteCode") }}</label
              ><input
                id="inv"
                v-model="fields.inviteCode"
                :required="info.isInviteOnly"
              /></div
          ></template>
          <div class="field">
            <div class="row between" style="align-items: baseline">
              <label for="p">{{ t("auth.password") }}</label
              ><a
                v-if="mode !== 'register'"
                href="#/forgot-password"
                style="font-size: 0.85rem; color: var(--primary)"
                >{{ t("auth.forgotPasswordLink") }}</a
              >
            </div>
            <input
              id="p"
              v-model="fields.password"
              type="password"
              :autocomplete="
                mode === 'register' ? 'new-password' : 'current-password'
              "
              :minlength="mode === 'register' ? 8 : undefined"
              required
            />
          </div>
          <button class="btn" :disabled="busy">
            {{
              t(mode === "register" ? "auth.registerBtn" : "auth.loginBtn")
            }}</button
          ><button
            v-if="error"
            class="btn small ghost"
            type="button"
            @click="resend"
          >
            📨 {{ t("auth.resendVerifyEmail") }}
          </button></template
        >
        <button v-if="info.oidc" type="button" class="btn" :disabled="busy" @click="startOidc">{{
          t("auth.oidcButton", { provider: info.oidcName })
        }}</button
        ><a
          v-if="mode !== 'register' && info.registration && !info.isClosed"
          class="btn ghost"
          href="#/register"
          >{{ t("auth.registerTitle") }}</a
        > </template
      ><a
        v-if="(mode !== 'login' && mode !== '/') || message"
        class="btn ghost"
        href="#/"
        >{{ t("auth.backToLogin") }}</a
      >
    </form>
  </div>
</template>
