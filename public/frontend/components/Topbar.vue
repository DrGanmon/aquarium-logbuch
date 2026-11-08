<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import { theme, toggleTheme } from "../state";
import type { User, Translate } from "../types";
// Links, notification badge and the mobile tab bar of signed-in users load on demand.
const UserNav = defineAsyncComponent(() => import("./UserNav.vue"));
const props = defineProps<{
  user: User | null;
  publicView?: boolean;
  language: string;
  t: Translate;
}>();
const emit = defineEmits<{ language: []; logout: [] }>();
const themeLabel = computed(() => props.t(({ system: "common.themeSystem", dark: "common.themeDark", light: "common.themeLight" } as const)[theme.value]));
function focusMain() { const main = document.getElementById("app");main?.focus();main?.scrollIntoView(); }
</script>

<template>
  <a class="skip-link" href="#app" @click.prevent="focusMain">{{ t("nav.skipToContent") }}</a>
  <header class="topbar" id="topbar" :class="{ 'has-bottom-nav': user }" :hidden="!user && !publicView">
    <a class="brand" href="#/">
      <img
        src="favicon-32x32.png"
        alt="Logo"
        class="brand-logo"
        width="24"
        height="24"
      />
      <span id="topbar-brand-name">{{ t("common.appName") }}</span>
    </a>
    <nav class="topbar-right" :aria-label="t('nav.mainNav')">
      <template v-if="!user">
        <a class="btn small ghost" href="#/social">{{ t("social.title") }}</a>
        <a class="btn small ghost" href="#/">{{ t("auth.loginBtn") }}</a>
      </template>
      <UserNav v-if="user" :user="user" :language="language" :t="t" @language="emit('language')" @logout="emit('logout')" />
      <button
        class="btn small ghost"
        id="btn-lang-topbar"
        type="button"
        :title="t('nav.langToggle')"
        :aria-label="t('nav.langToggle')"
        @click="$emit('language')"
      >
        <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3.2 3.5 3.2 14.5 0 18M12 3c-3.2 3.5-3.2 14.5 0 18" /></svg>
        <span id="topbar-lang-text">{{ language === "de" ? "DE" : "EN" }}</span>
      </button>
      <button
        class="btn small ghost"
        id="btn-theme-topbar"
        type="button"
        @click="toggleTheme"
        :title="t('nav.themeToggle')"
        :aria-label="`${t('nav.themeToggle')}: ${themeLabel}`"
      >
        <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3v18M12 7h4.5M12 11h6.5M12 15h5.5" /></svg>
        <span id="topbar-theme-icon" class="topbar-theme-label">{{ themeLabel }}</span>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.topbar-right .btn { gap: .35rem; }
</style>
