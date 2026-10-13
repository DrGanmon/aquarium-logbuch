<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { session, t, fmtDate, errorMessage, toast } from '../state';
import type { SocialPostView, SocialCommentView } from '../../../src/types/social';
import Modal from './Modal.vue';
const props = defineProps<{ post: SocialPostView }>();
const emit = defineEmits<{ deleted: [id: number] }>();
const post = ref({ ...props.post });
watch(() => props.post, value => { post.value = { ...value }; });
const comments = ref<SocialCommentView[]>([]), commentsOpen = ref(false), commentsLoaded = ref(false);
const nextComment = ref<number | null>(null), text = ref(''), error = ref('');
const busy = ref(false), commentsBusy = ref(false), shareOpen = ref(false);
const shareUrl = computed(() => new URL(`#/social/${post.value.id}`, document.baseURI).href);
async function like() {
  if (!session.user || busy.value) return;
  busy.value = true;error.value = '';
  try { Object.assign(post.value, await api(`/social/posts/${post.value.id}/like`, { method: 'PUT', body: { liked: !post.value.liked } })); }
  catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
async function loadComments(older = false) {
  if (commentsBusy.value) return;
  commentsBusy.value = true;error.value = '';
  try {
    const query = older && nextComment.value ? `?before=${nextComment.value}` : '';
    const result = await api<{ comments: SocialCommentView[]; next: number | null }>(`/social/posts/${post.value.id}/comments${query}`);
    comments.value = older ? [...result.comments, ...comments.value] : result.comments;
    nextComment.value = result.next;commentsLoaded.value = true;
  } catch (caught) { error.value = errorMessage(caught); }
  finally { commentsBusy.value = false; }
}
function toggleComments() { commentsOpen.value = !commentsOpen.value;if (commentsOpen.value && !commentsLoaded.value) void loadComments(); }
async function comment() {
  if (!session.user || !text.value.trim() || commentsBusy.value) return;
  commentsBusy.value = true;error.value = '';
  try {
    const result = await api<{ comment: SocialCommentView }>(`/social/posts/${post.value.id}/comments`, { method: 'POST', body: { text: text.value } });
    comments.value.push(result.comment);post.value.commentCount++;text.value = '';
  } catch (caught) { error.value = errorMessage(caught); }
  finally { commentsBusy.value = false; }
}
async function removeComment(item: SocialCommentView) {
  if (commentsBusy.value || !confirm(t('social.deleteCommentConfirm'))) return;
  commentsBusy.value = true;error.value = '';
  try { await api(`/social/comments/${item.id}`, { method: 'DELETE' });comments.value = comments.value.filter(comment => comment.id !== item.id);post.value.commentCount--; }
  catch (caught) { error.value = errorMessage(caught); }
  finally { commentsBusy.value = false; }
}
async function remove() {
  if (busy.value || !confirm(t('social.deletePostConfirm'))) return;
  busy.value = true;error.value = '';
  try { await api(`/social/posts/${post.value.id}`, { method: 'DELETE' });emit('deleted', post.value.id); }
  catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
async function share() {
  if (navigator.share) {
    try { await navigator.share({ title: t('social.shareTitle', { username: post.value.author.username }), url: shareUrl.value });return; }
    catch (caught) { if (caught instanceof Error && caught.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(shareUrl.value);toast(t('social.linkCopied')); }
  catch { shareOpen.value = true; }
}
</script>
<template>
  <article class="social-post">
    <header class="social-post-header">
      <div class="social-author"><img v-if="post.author.avatarUrl" :src="post.author.avatarUrl" class="social-avatar" :alt="t('social.avatar', { username: post.author.username })" /><span v-else class="social-avatar social-avatar-placeholder" aria-hidden="true">{{ post.author.username.slice(0, 1).toUpperCase() }}</span><div><strong>{{ post.author.username }}</strong><time :datetime="post.created_at">{{ fmtDate(post.created_at) }}</time><span class="muted">{{ t(post.is_public ? 'social.publicBadge' : 'social.internalBadge') }}</span></div></div>
      <button v-if="post.canDelete" type="button" class="btn small ghost" :disabled="busy" @click="remove">{{ t('social.delete') }}</button>
    </header>
    <a :href="`#/social/${post.id}`" class="social-image-link"><img :src="post.imageUrl" :alt="post.text || t('social.photoBy', { username: post.author.username })" :width="post.width" :height="post.height" class="social-photo" loading="lazy" decoding="async" /></a>
    <div class="social-post-content stack">
      <div class="social-actions">
        <button type="button" class="btn ghost social-like" :class="{ liked: post.liked }" :disabled="!session.user || busy" :aria-pressed="post.liked" :aria-label="t(post.liked ? 'social.unlike' : 'social.like')" @click="like"><span aria-hidden="true">{{ post.liked ? '♥' : '♡' }}</span> {{ post.likeCount }}</button>
        <button type="button" class="btn ghost" :aria-expanded="commentsOpen" @click="toggleComments">{{ t('social.comments', { count: post.commentCount }) }}</button>
        <button type="button" class="btn ghost social-share" @click="share">↗ {{ t('social.share') }}</button>
      </div>
      <p v-if="post.text" class="social-caption"><strong>{{ post.author.username }}</strong> {{ post.text }}</p>
      <section v-if="commentsOpen" class="social-comments stack" :aria-label="t('social.comments', { count: post.commentCount })">
        <button v-if="nextComment" type="button" class="btn small ghost" :disabled="commentsBusy" @click="loadComments(true)">{{ t('social.olderComments') }}</button>
        <p v-if="commentsBusy" role="status">{{ t('common.loading') }}</p>
        <p v-else-if="!comments.length && commentsLoaded" class="muted">{{ t('social.noComments') }}</p>
        <div v-for="item in comments" :key="item.id" class="social-comment">
          <img v-if="item.author.avatarUrl" :src="item.author.avatarUrl" class="social-avatar" :alt="t('social.avatar', { username: item.author.username })" loading="lazy" /><span v-else class="social-avatar social-avatar-placeholder" aria-hidden="true">{{ item.author.username.slice(0, 1).toUpperCase() }}</span>
          <div class="social-comment-body"><p><strong>{{ item.author.username }}</strong> {{ item.text }}</p><time :datetime="item.created_at">{{ fmtDate(item.created_at) }}</time></div>
          <button v-if="item.canDelete" type="button" class="btn small ghost" :disabled="commentsBusy" :aria-label="t('social.deleteComment')" @click="removeComment(item)">✕</button>
        </div>
        <form v-if="session.user" class="social-comment-form" @submit.prevent="comment"><label class="social-comment-input">{{ t('social.writeComment') }}<textarea v-model="text" maxlength="1000" rows="2" required /></label><button class="btn small" :disabled="commentsBusy || !text.trim()">{{ t('social.send') }}</button></form>
        <p v-else class="muted"><a href="#/">{{ t('social.loginToInteract') }}</a></p>
      </section>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </article>
  <Modal v-if="shareOpen" :title="t('social.share')" @close="shareOpen = false"><label>{{ t(post.is_public ? 'social.shareLink' : 'social.internalShareLink') }}<input :value="shareUrl" readonly @focus="($event.target as HTMLInputElement).select()" /></label></Modal>
</template>
