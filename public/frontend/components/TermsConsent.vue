<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import Modal from './Modal.vue';
import { api } from '../api';
import { session, language, t, errorMessage } from '../state';
import { logout } from '../router';
import type { User } from '../types';
const version = ref(''), terms = ref<Record<string, string>>({}), accepted = ref(false), busy = ref(false), error = ref('');
let generation = 0;
onBeforeUnmount(() => { generation++; });
async function loadTerms(value = language.value) {
  const current = ++generation;version.value = '';accepted.value = false;error.value = '';
  try {
    const result = await api<{ version: string; terms: Record<string, string> }>(`/terms?language=${value}`);
    if (current === generation) { version.value = result.version;terms.value = result.terms; }
  } catch (caught) { if (current === generation) error.value = errorMessage(caught); }
}
watch(language, value => { void loadTerms(value); }, { immediate: true });
async function confirm() {
  if (busy.value || !accepted.value || !version.value) return;
  busy.value = true;error.value = '';
  const userId = session.user?.id;
  try {
    const result = await api<{ user: User }>('/me/terms', { method: 'POST', body: { acceptTerms: true, termsVersion: version.value } });
    if (session.user?.id === userId) session.user = result.user;
  } catch (caught) { error.value = errorMessage(caught); }
  finally { busy.value = false; }
}
</script>
<template>
  <Modal :title="t('terms.title')" persistent wide>
    <p>{{ t('terms.existingNotice') }}</p>
    <p v-if="!version" role="status">{{ t('common.loading') }}</p>
    <div v-else class="stack" style="max-height: 50vh; overflow-y: auto" tabindex="0">
      <p>{{ t('terms.version') }}: {{ version }}</p>
      <section v-for="key in ['scope', 'account', 'content', 'license', 'visibility', 'deletion', 'moderation', 'liability']" :key="key">
        <h3>{{ terms[key + 'Title'] }}</h3><p>{{ terms[key + 'Text'] }}</p>
      </section>
      <a href="#/datenschutz" target="_blank" rel="noopener">{{ t('footer.privacy') }}</a>
    </div>
    <form class="stack" @submit.prevent="confirm">
      <label class="terms-consent"><input v-model="accepted" type="checkbox" :disabled="busy || !version" /><span>{{ t('terms.acceptPrefix') }} {{ t('terms.link') }}{{ t('terms.acceptSuffix') }}</span></label>
      <p v-if="error" class="error" role="alert">{{ error }} <button v-if="!version" type="button" class="btn small ghost" @click="loadTerms()">{{ t('social.retry') }}</button></p>
      <div class="row"><button class="btn" :disabled="busy || !accepted || !version">{{ t('terms.confirm') }}</button><button class="btn ghost" type="button" :disabled="busy" @click="logout">{{ t('terms.signOut') }}</button></div>
    </form>
  </Modal>
</template>
