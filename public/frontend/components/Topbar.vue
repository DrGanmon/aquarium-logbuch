<script setup lang="ts">
import { computed } from "vue";
import { themeIcon, toggleTheme } from "../state";
import type { User, Translate } from "../types";
const props = defineProps<{
  user: User | null;
  publicView?: boolean;
  language: string;
  t: Translate;
}>();
defineEmits<{ language: []; logout: [] }>();
const displayName = computed(() =>
  props.user
    ? [props.user.firstName, props.user.lastName].filter(Boolean).join(" ") ||
      props.user.username
    : "",
);
const avatar = computed(() =>
  props.user?.hasAvatar ? `api/me/avatar?t=${Date.now()}` : undefined,
);
</script>

<template>
  <header class="topbar" id="topbar" :hidden="!user && !publicView">
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
    <div class="topbar-right">
      <a class="btn small ghost" v-if="user" id="btn-species" href="#/species"><span aria-hidden="true">🐠 </span>{{
        t("nav.species")
      }}</a>
      <a class="btn small ghost" v-if="user" href="#/plants">🌿 {{ t("nav.plants") }}</a>
      <a class="btn small ghost" v-if="user" href="#/health">🩺 {{ t("nav.health") }}</a>
      <a class="btn small ghost" href="#/social"><span aria-hidden="true">👥 </span>{{ t("social.title") }}</a>
      <a v-if="!user" class="btn small ghost" href="#/">{{ t("auth.loginBtn") }}</a>
      <a
        v-if="user"
        class="btn small ghost topbar-user"
        id="btn-profile"
        href="#/profile"
        :title="t('nav.profile')"
      >
        <img
          id="topbar-avatar"
          class="avatar-small"
          :src="avatar"
          :style="{ display: avatar ? 'inline-block' : 'none' }"
          alt="Avatar"
        />
        <span id="whoami">{{ displayName }}</span>
      </a>
      <a
        class="btn small ghost"
        id="btn-admin"
        href="#/admin"
        :hidden="!user?.isAdmin"
        ><span aria-hidden="true">⚙️ </span>{{ t("nav.admin") }}</a
      >
      <button
        class="btn small ghost"
        id="btn-lang-topbar"
        type="button"
        :title="t('nav.langToggle')"
        :aria-label="t('nav.langToggle')"
        @click="$emit('language')"
      >
        <span id="topbar-lang-text">{{
          language === "de" ? "🌐 DE" : "🌐 EN"
        }}</span>
      </button>
      <button
        class="btn small ghost"
        id="btn-theme-topbar"
        type="button"
        @click="toggleTheme"
        :title="t('nav.themeToggle')"
        :aria-label="t('nav.themeToggle')"
      >
        <span id="topbar-theme-icon">{{ themeIcon }}</span>
      </button>
      <button
        class="btn small ghost"
        v-if="user"
        id="btn-logout"
        type="button"
        @click="$emit('logout')"
      >
        {{ t("nav.logout") }}
      </button>
    </div>
  </header>
</template>
