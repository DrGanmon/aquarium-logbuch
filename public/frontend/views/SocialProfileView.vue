<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { api, ApiError } from "../api";
import { registerMessages, session, language, t, errorMessage } from "../state";
import { route } from "../router";
import featuresDe from "../../locales/features.de.json";
import featuresEn from "../../locales/features.en.json";
import type { SocialPostView, SocialProfileView } from "../../../src/types/social";
registerMessages({ de: featuresDe, en: featuresEn });

// The profile is returned as its own object so new sections can be added without touching the post grid.
const username = computed(() => { try { return decodeURIComponent(route.value.path.slice("/social/u/".length)); } catch { return ""; } });
const profile = ref<SocialProfileView | null>(null), posts = ref<SocialPostView[]>([]), next = ref<number | null>(null);
const loading = ref(false), error = ref(""), notFound = ref(false);
let request: AbortController | undefined;
onBeforeUnmount(() => request?.abort());
async function load(more = false) {
  if (!username.value || (more && (loading.value || !next.value))) return;
  request?.abort();const current = new AbortController();request = current;
  loading.value = true;error.value = "";
  if (!more) { profile.value = null;posts.value = [];next.value = null;notFound.value = false; }
  try {
    const query = more ? `?before=${next.value}` : "";
    const result = await api<{ profile: SocialProfileView; posts: SocialPostView[]; next: number | null }>(`/social/profiles/${encodeURIComponent(username.value)}${query}`, { signal: current.signal });
    if (current.signal.aborted) return;
    profile.value = result.profile;posts.value = more ? [...posts.value, ...result.posts] : result.posts;next.value = result.next;
  } catch (caught) {
    if (current.signal.aborted) return;
    if (caught instanceof ApiError && caught.status === 404) notFound.value = true;
    else error.value = errorMessage(caught);
  } finally { if (request === current) loading.value = false; }
}
watch([username, () => session.user?.id, language], () => { void load(); }, { immediate: true });
</script>
<template>
  <div class="social-layout social-profile-page">
    <a href="#/social" class="btn small ghost social-back">← {{ t("social.backToFeed") }}</a>
    <p v-if="loading && !profile" role="status" class="social-empty">{{ t("common.loading") }}</p>
    <section v-else-if="notFound" class="card stack social-empty"><h1>{{ t("socialProfile.notFoundTitle") }}</h1><p>{{ t("socialProfile.notFoundText") }}</p></section>
    <template v-else-if="profile">
      <p v-if="profile.isOwner && !profile.enabled" class="compat-box warn" data-profile-preview>{{ t("socialProfile.previewDisabled") }} <a href="#/profile">{{ t("socialProfile.openSettings") }}</a></p>
      <header class="card social-profile-header" data-social-profile>
        <img v-if="profile.avatarUrl" v-server-image :src="profile.avatarUrl" class="social-profile-avatar" :alt="t('social.avatar', { username: profile.username })" />
        <span v-else class="social-profile-avatar social-avatar-placeholder" aria-hidden="true">{{ profile.username.slice(0, 1).toUpperCase() }}</span>
        <div class="stack social-profile-meta">
          <h1>{{ profile.username }}</h1>
          <p class="muted"><strong>{{ profile.postCount }}</strong> {{ t("socialProfile.posts", { count: profile.postCount }) }}</p>
          <a v-if="profile.isOwner" class="btn small ghost" href="#/profile">{{ t("socialProfile.openSettings") }}</a>
        </div>
      </header>
      <p v-if="!session.user" class="social-public-note">{{ t("socialProfile.guestNote") }} <a href="#/login">{{ t("auth.loginBtn") }}</a></p>
      <p v-if="!posts.length && !loading" class="card social-empty">{{ t("socialProfile.noPosts") }}</p>
      <div v-else class="social-profile-grid" :aria-label="t('socialProfile.postsTitle')">
        <a v-for="post in posts" :key="post.id" :href="`#/social/${post.id}`" class="social-profile-tile">
          <img v-server-image :src="post.imageUrl" :alt="post.text || t('social.photoBy', { username: profile.username })" loading="lazy" decoding="async" />
          <span v-if="!post.is_public" class="social-profile-badge">{{ t("social.internalBadge") }}</span>
        </a>
      </div>
      <button v-if="next" type="button" class="btn ghost social-more" :disabled="loading" @click="load(true)">{{ t("social.more") }}</button>
    </template>
    <p v-if="error" class="error card" role="alert">{{ error }} <button type="button" class="btn small ghost" @click="load()">{{ t("social.retry") }}</button></p>
  </div>
</template>
<style scoped>
.social-profile-header { display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; }
.social-profile-avatar { width: 112px; height: 112px; border-radius: 50%; object-fit: cover; flex: none; font-size: 2.5rem; }
.social-profile-meta { gap: .35rem; min-width: 0; }
.social-profile-meta h1 { margin: 0; overflow-wrap: anywhere; }
.social-profile-meta p { margin: 0; }
.social-profile-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .4rem; }
.social-profile-tile { position: relative; display: block; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: var(--paper); }
.social-profile-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s; }
.social-profile-tile:hover img { transform: scale(1.04); }
.social-profile-badge { position: absolute; left: .4rem; bottom: .4rem; font-size: .7rem; padding: .1rem .4rem; border-radius: 99px; background: rgba(0, 0, 0, .6); color: #fff; }
@media (max-width: 520px) { .social-profile-avatar { width: 80px; height: 80px; } .social-profile-grid { gap: .2rem; } }
</style>
