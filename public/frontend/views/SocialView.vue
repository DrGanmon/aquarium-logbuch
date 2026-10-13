<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../api';
import { session, language, t, errorMessage, toast } from '../state';
import { route } from '../router';
import { readImage } from '../composables/media';
import SocialPostCard from '../components/SocialPostCard.vue';
import type { SocialPostView } from '../../../src/types/social';
const posts = ref<SocialPostView[]>([]), next = ref<number | null>(null);
const loading = ref(false), publishing = ref(false), error = ref(''), composer = ref(false);
const image = ref(''), caption = ref(''), fileInput = ref<HTMLInputElement>(), processing = ref(false);
const isPublic = ref(false), acceptTerms = ref(false), termsVersion = ref('');
onMounted(async () => { try { termsVersion.value = (await api<{ version: string }>('/terms')).version; } catch (caught) { error.value = errorMessage(caught); } });
const postId = computed(() => /^\/social\/\d+$/.test(route.value.path) ? route.value.path.split('/')[2] : undefined);
let request: AbortController | undefined;
let imageGeneration = 0;
onBeforeUnmount(() => { request?.abort();imageGeneration++; });
async function load(more = false) {
  if (more && (loading.value || !next.value)) return;
  request?.abort();const current = new AbortController();request = current;
  loading.value = true;error.value = '';
  if (!more) { posts.value = [];next.value = null; }
  try {
    if (postId.value) {
      const result = await api<{ post: SocialPostView }>(`/social/posts/${postId.value}`, { signal: current.signal });
      if (!current.signal.aborted) posts.value = [result.post];
    } else {
      const query = more ? `?before=${next.value}` : '';
      const result = await api<{ posts: SocialPostView[]; next: number | null }>(`/social/posts${query}`, { signal: current.signal });
      if (!current.signal.aborted) { posts.value = more ? [...posts.value, ...result.posts] : result.posts;next.value = result.next; }
    }
  } catch (caught) { if (!current.signal.aborted) error.value = errorMessage(caught); }
  finally { if (request === current) loading.value = false; }
}
watch([postId, () => session.user?.id, language], () => { void load(); }, { immediate: true });
async function chooseImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];if (!file) return;
  const generation = ++imageGeneration;processing.value = true;error.value = '';image.value = '';
  try { const value = await readImage(file);if (generation === imageGeneration) image.value = value; }
  catch (caught) { if (generation === imageGeneration) error.value = errorMessage(caught); }
  finally { if (generation === imageGeneration) processing.value = false; }
}
function closeComposer() { composer.value = false;isPublic.value = false;acceptTerms.value = false;image.value = '';caption.value = '';imageGeneration++;processing.value = false;if (fileInput.value) fileInput.value.value = ''; }
async function publish() {
  if (publishing.value || processing.value || !image.value) return;
  publishing.value = true;error.value = '';
  try {
    const result = await api<{ post: SocialPostView }>('/social/posts', { method: 'POST', body: { image: image.value, text: caption.value, isPublic: isPublic.value, acceptTerms: acceptTerms.value, termsVersion: termsVersion.value } });
    closeComposer();toast(t('social.published'));
    if (postId.value) location.hash = '#/social';else posts.value.unshift(result.post);
  } catch (caught) { error.value = errorMessage(caught); }
  finally { publishing.value = false; }
}
</script>
<template>
  <div class="social-layout">
    <header class="social-intro"><div><p class="social-eyebrow">{{ t('social.community') }}</p><h1>{{ t('social.title') }}</h1><p class="muted">{{ t('social.intro') }}</p></div><button v-if="session.user" type="button" class="btn" @click="composer = !composer">＋ {{ t('social.newPost') }}</button><a v-else class="btn" href="#/">{{ t('auth.loginBtn') }}</a></header>
    <p v-if="!session.user" class="social-public-note">{{ t('social.publicRead') }}</p>
    <a v-if="postId" href="#/social" class="btn small ghost social-back">← {{ t('social.backToFeed') }}</a>
    <form v-if="composer && session.user" class="card stack social-composer" @submit.prevent="publish">
      <h2>{{ t('social.newPost') }}</h2><label class="terms-consent"><input v-model="isPublic" type="checkbox" :disabled="publishing" /><span>{{ t('social.publicChoice') }}</span></label><p class="compat-box warn">{{ t(isPublic ? 'social.publicNotice' : 'social.internalNotice') }}</p>
      <label>{{ t('social.choosePhoto') }}<input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" :disabled="publishing || processing" @change="chooseImage" /></label>
      <p class="muted">{{ t('social.imageLimits') }}</p><p v-if="processing" role="status">{{ t('common.loading') }}</p>
      <img v-if="image" :src="image" class="social-preview" :alt="t('social.preview')" />
      <label>{{ t('social.caption') }}<textarea v-model="caption" rows="4" maxlength="2200" :disabled="publishing" /></label><span class="muted">{{ caption.length }}/2200</span>
      <label class="terms-consent"><input v-model="acceptTerms" type="checkbox" required :disabled="publishing" /><span>{{ t("terms.postConsent") }} <a href="#/agb" target="_blank" rel="noopener">{{ t("terms.link") }}</a></span></label>
      <div class="row"><button class="btn" :disabled="publishing || processing || !image || !acceptTerms || !termsVersion">{{ t('social.publish') }}</button><button type="button" class="btn ghost" :disabled="publishing" @click="closeComposer">{{ t('common.cancel') }}</button></div>
    </form>
    <p v-if="error" class="error card" role="alert">{{ error }} <button type="button" class="btn small ghost" @click="load()">{{ t('social.retry') }}</button></p>
    <div class="social-feed"><SocialPostCard v-for="post in posts" :key="post.id" :post="post" @deleted="posts = posts.filter(item => item.id !== $event)" /></div>
    <p v-if="loading" role="status" class="social-empty">{{ t('common.loading') }}</p>
    <div v-else-if="!posts.length && !error" class="card social-empty"><h2>{{ t('social.emptyTitle') }}</h2><p>{{ t('social.emptyText') }}</p></div>
    <button v-if="next && !postId" type="button" class="btn ghost social-more" :disabled="loading" @click="load(true)">{{ t('social.more') }}</button>
  </div>
</template>
