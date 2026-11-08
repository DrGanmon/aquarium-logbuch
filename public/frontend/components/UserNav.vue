<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { theme, toggleTheme } from "../state";
import { api } from "../api";
import { route } from "../router";
import Icon from "./Icon.vue";
import type { User, Translate } from "../types";
const props = defineProps<{
  user: User;
  language: string;
  t: Translate;
}>();
const emit = defineEmits<{ language: []; logout: [] }>();
// Navigation of signed-in users is loaded after the start so the startup bundle stays small.
const displayName = computed(() =>
  props.user
    ? [props.user.firstName, props.user.lastName].filter(Boolean).join(" ") ||
      props.user.username
    : "",
);
const avatar = computed(() =>
  props.user?.hasAvatar ? `api/me/avatar?t=${Date.now()}` : undefined,
);
const themeLabel = computed(() => props.t(({ system: "common.themeSystem", dark: "common.themeDark", light: "common.themeLight" } as const)[theme.value]));
const mobileServer = document.documentElement?.dataset.mobileServer;
const guideUrl = computed(() => { const path = props.language === "en" ? "handbuch/en/" : "handbuch/";return mobileServer ? new URL(path, mobileServer).href : path; });
const unread = ref(0);
let notificationTimer: ReturnType<typeof setInterval> | undefined;
async function refreshNotifications() {
  if (!props.user) { unread.value = 0; return; }
  try {
    const result = await api<{ unreadSocial: number; openWater: number }>("/notifications?limit=1");
    unread.value = result.unreadSocial + result.openWater;
  } catch { /* Den letzten bekannten Zähler bei vorübergehenden Fehlern erhalten. */ }
}
// Primary destinations of the bottom tab bar on small screens (profile, aquariums, health, social); everything else lives in "More".
const currentPath = computed(() => route.value.path);
const section = computed(() => {
  const path = currentPath.value;
  if (path === "/profile") return "profile";
  if (path.startsWith("/social")) return "social";
  if (path.startsWith("/health")) return "health";
  if (["/species", "/plants", "/notifications", "/admin"].some(prefix => path.startsWith(prefix))) return "more";
  return "aquariums";
});
const moreOpen = ref(false);
const moreButton = ref<HTMLButtonElement>();
const morePanel = ref<HTMLElement>();
function closeMore(focus = false) {
  moreOpen.value = false;
  if (focus) moreButton.value?.focus();
}
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (moreOpen.value && !morePanel.value?.contains(target) && !moreButton.value?.contains(target)) closeMore();
}
function escape(event: KeyboardEvent) { if (event.key === "Escape" && moreOpen.value) closeMore(true); }
watch(() => route.value.path, () => closeMore());
watch(moreOpen, open => { if (open) requestAnimationFrame(() => morePanel.value?.querySelector<HTMLElement>("a, button")?.focus()); });
function run(action: "language" | "logout") { closeMore(); if (action === "language") emit("language"); else emit("logout"); }
watch(() => props.user?.id, refreshNotifications);
onMounted(() => {
  void refreshNotifications();
  notificationTimer = setInterval(refreshNotifications, 60000);
  window.addEventListener("focus", refreshNotifications);
  window.addEventListener("notifications-updated", refreshNotifications);
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", escape);
});
onBeforeUnmount(() => {
  if (notificationTimer) clearInterval(notificationTimer);
  window.removeEventListener("focus", refreshNotifications);
  window.removeEventListener("notifications-updated", refreshNotifications);
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", escape);
});
</script>

<template>
      <a class="btn small ghost" id="btn-species" href="#/species" :aria-current="currentPath.startsWith('/species') ? 'page' : undefined"><Icon name="fish" :size="18" />{{ t("nav.species") }}</a>
      <a class="btn small ghost" href="#/plants" :aria-current="currentPath.startsWith('/plants') ? 'page' : undefined"><Icon name="leaf" :size="18" />{{ t("nav.plants") }}</a>
      <a class="btn small ghost" href="#/health"><Icon name="health" :size="18" />{{ t("nav.health") }}</a>
      <a class="btn small ghost" href="#/social"><Icon name="users" :size="18" />{{ t("social.title") }}</a>
      <a class="btn small ghost" href="#/notifications" :aria-label="t('notifications.title')"><Icon name="bell" :size="18" />{{ t("notifications.shortTitle") }}<span v-if="unread" class="notification-count">{{ unread > 99 ? "99+" : unread }}</span></a>
      <a
       
        class="btn small ghost topbar-user"
        id="btn-profile"
        href="#/profile"
        :title="t('nav.profile')"
      >
        <img v-server-image
          id="topbar-avatar"
          class="avatar-small"
          :src="avatar"
          :style="{ display: avatar ? 'inline-block' : 'none' }"
          alt=""
        />
        <Icon v-if="!avatar" name="user" :size="18" />
        <span id="whoami">{{ displayName }}</span>
      </a>
      <a
        class="btn small ghost"
        id="btn-admin"
        href="#/admin"
        :hidden="!user?.isAdmin"
        ><Icon name="admin" :size="18" />{{ t("nav.admin") }}</a
      >
      <button
        class="btn small ghost"
        id="btn-logout"
        type="button"
        @click="$emit('logout')"
      >
        <Icon name="logout" :size="18" />{{ t("nav.logout") }}
      </button>
  <Teleport to="body"><nav class="bottom-nav" :aria-label="t('nav.mainNav')" data-bottom-nav>
    <a href="#/profile" :aria-current="section === 'profile' ? 'page' : undefined" :title="displayName"><img v-if="avatar" v-server-image class="avatar-small" :src="avatar" alt="" /><Icon v-else name="user" /><span>{{ t("nav.profileShort") }}</span></a>
    <a href="#/" :aria-current="section === 'aquariums' ? 'page' : undefined"><Icon name="home" /><span>{{ t("nav.aquariums") }}</span></a>
    <a href="#/health" :aria-current="section === 'health' ? 'page' : undefined"><Icon name="health" /><span>{{ t("nav.health") }}</span></a>
    <a href="#/social" :aria-current="section === 'social' ? 'page' : undefined"><Icon name="users" /><span>{{ t("social.title") }}</span></a>
    <button ref="moreButton" type="button" :aria-expanded="moreOpen" aria-controls="bottom-nav-more" :class="{ active: section === 'more' }" @click="moreOpen = !moreOpen"><Icon name="more" /><span>{{ t("nav.more") }}</span><span v-if="unread" class="notification-count" aria-hidden="true">{{ unread > 99 ? "99+" : unread }}</span></button>
    <div v-show="moreOpen" id="bottom-nav-more" ref="morePanel" class="bottom-nav-more card">
      <a href="#/species" :aria-current="currentPath.startsWith('/species') ? 'page' : undefined"><Icon name="fish" />{{ t("nav.species") }}</a>
      <a href="#/plants" :aria-current="currentPath.startsWith('/plants') ? 'page' : undefined"><Icon name="leaf" />{{ t("nav.plants") }}</a>
      <a href="#/notifications" :aria-current="currentPath.startsWith('/notifications') ? 'page' : undefined"><Icon name="bell" />{{ t("nav.notifications") }}<span v-if="unread" class="notification-count">{{ unread > 99 ? "99+" : unread }}</span></a>
      <a v-if="user.isAdmin" href="#/admin"><Icon name="admin" />{{ t("nav.admin") }}</a>
      <a :href="guideUrl" target="_blank" rel="noopener noreferrer"><Icon name="book" />{{ t("footer.userGuide") }}</a>
      <button type="button" @click="run('language')"><Icon name="globe" />{{ t("nav.langToggle") }}</button>
      <button type="button" @click="toggleTheme"><Icon name="theme" />{{ t("nav.themeToggle") }}: {{ themeLabel }}</button>
      <button type="button" @click="run('logout')"><Icon name="logout" />{{ t("nav.logout") }}</button>
    </div>
  </nav></Teleport>
</template>

<style scoped>
.notification-count { min-width: 1.25rem; margin-left: .3rem; padding: .05rem .35rem; border-radius: 1rem; background: var(--coral); color: white; font-weight: 700; text-align: center; font-size: .75rem; }
.topbar-right .btn { gap: .35rem; }
</style>
