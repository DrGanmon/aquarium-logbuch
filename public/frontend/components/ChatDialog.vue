<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import Modal from "./Modal.vue";
import MarkdownText from "./MarkdownText.vue";
import { api, chatRequest } from "../api";
import { t, errorMessage, session } from "../state";
import type { AnswerInput } from '../health-types';
import type { ChatMessage } from "../types";
const props = defineProps<{
  id: string; name: string; readonly: boolean;
  diagnosis?: { stockId: number; answers: AnswerInput[]; provider: string; model: string; context: string };
}>();
const emit = defineEmits<{ close: [] }>();
const messages = ref<ChatMessage[]>([]);
const input = ref("");
const busy = ref(false);
const answering = ref(false);
const progressStages = ref<string[]>([]);
const historyLoading = ref(true);
const lifecycle = new AbortController();
const error = ref("");
const container = ref<HTMLElement>();
const context = ref(props.diagnosis?.context || "");
const provider = ref(props.diagnosis?.provider || session.user?.aiProvider || "openai");
const viewportStyle = ref<Record<string, string>>({});
function updateViewport() {
  const viewport = window.visualViewport;
  if (viewport) viewportStyle.value = {
    "--chat-viewport-height": `${viewport.height}px`,
    "--chat-viewport-top": `${viewport.offsetTop}px`,
  };
}
onMounted(() => {
  updateViewport();
  window.visualViewport?.addEventListener("resize", updateViewport);
  window.visualViewport?.addEventListener("scroll", updateViewport);
});
onBeforeUnmount(() => {
  lifecycle.abort();
  window.visualViewport?.removeEventListener("resize", updateViewport);
  window.visualViewport?.removeEventListener("scroll", updateViewport);
});
onMounted(async () => {
  if (props.diagnosis) { historyLoading.value = false; return; }
  try {
    messages.value = (
      await api<{ messages: ChatMessage[] }>(
        `/aquariums/${props.id}/chat/history`,
        { signal: lifecycle.signal },
      )
    ).messages;
    await scroll();
  } catch (e) {
    if (!lifecycle.signal.aborted) error.value = errorMessage(e);
  } finally { historyLoading.value = false; }
});
async function scroll() {
  await nextTick();
  container.value?.scrollTo({
    top: container.value.scrollHeight,
    behavior: "smooth",
  });
}
function temporaryHistory() {
  const history: { role: ChatMessage['role']; content: string }[] = [];
  let remaining = 40000;
  for (const item of messages.value.slice(-100).reverse()) {
    const content = item.content.slice(0, Math.min(8000, remaining));
    if (!content) break;
    history.unshift({ role: item.role, content });
    remaining -= content.length;
  }
  return history;
}
async function send(prompt = input.value) {
  if (busy.value || historyLoading.value || lifecycle.signal.aborted || !prompt.trim()) return;
  busy.value = true;
  error.value = "";
  input.value = "";
  const history = props.diagnosis ? temporaryHistory() : [];
  const pendingIndex = messages.value.length;
  messages.value.push({ role: "user", content: prompt });
  answering.value = true;
  progressStages.value = ["sending"];
  void scroll();
  try {
    const result = await chatRequest(props.diagnosis ? `/health/aquariums/${props.id}/diagnosis/chat` : `/aquariums/${props.id}/chat`, props.diagnosis ? {
        stockId: props.diagnosis.stockId, answers: props.diagnosis.answers, message: prompt,
        messages: history, progress: true,
      } : { message: prompt, provider: provider.value, saveHistory: true, progress: true }, lifecycle.signal, (stage) => {
      if (!progressStages.value.includes(stage)) progressStages.value.push(stage);
      void scroll();
    });
    if (lifecycle.signal.aborted) return;
    messages.value.push(
      { role: "assistant", content: result.reply },
    );
    if (props.diagnosis && messages.value.length > 100) messages.value = messages.value.slice(-100);
    await scroll();
  } catch (e) {
    if (lifecycle.signal.aborted) return;
    messages.value.splice(pendingIndex, 1);
    error.value = errorMessage(e);
    input.value = prompt;
  } finally {
    answering.value = false;
    busy.value = false;
  }
}
function toggleContext(event: Event) {
  if (!props.diagnosis && (event.target as HTMLDetailsElement).open && !context.value) void loadContext();
}
async function loadContext() {
  try {
    context.value = (
      await api<{ systemPrompt: string }>(`/aquariums/${props.id}/chat/context`, { signal: lifecycle.signal })
    ).systemPrompt;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function clear() {
  if (props.diagnosis || busy.value || historyLoading.value || !confirm("Chat-Verlauf löschen?")) return;
  busy.value = true;
  try {
    await api(`/aquariums/${props.id}/chat/history`, { method: "DELETE", signal: lifecycle.signal });
    messages.value = [];
  } catch (e) {
    if (!lifecycle.signal.aborted) error.value = errorMessage(e);
  } finally { busy.value = false; }
}
</script>
<template>
  <Modal :title="diagnosis ? `${t('health.aiChat')} · ${name}` : `🤖 Aquarium-Assistent · ${name}`" wide dialog-class="aquarium-chat-modal" :dialog-style="viewportStyle" @close="emit('close')"
    ><div class="stack chat-dialog">
      <div class="row between chat-toolbar">
        <span v-if="diagnosis" class="muted">{{ diagnosis.provider }} · {{ diagnosis.model }}</span>
        <select v-else v-model="provider" :disabled="busy">
          <option v-if="session.user?.hasOpenaiKey" value="openai">
            OpenAI
          </option>
          <option v-if="session.user?.hasGeminiKey" value="gemini">
            Gemini
          </option>
          <option v-if="session.user?.hasClaudeKey" value="claude">
            Claude
          </option></select
        ><button v-if="!readonly && !diagnosis" class="btn small ghost danger" :disabled="busy || historyLoading" @click="clear">
          {{ t("common.delete") }}
        </button>
      </div>
      <p v-if="diagnosis" class="compat-box warn chat-disclaimer">{{ t("health.chatNotSaved") }}</p>
      <details
        class="chat-context-details"
        @toggle="toggleContext"
      >
        <summary>{{ diagnosis ? t("health.chatContext") : "Beckenkontext" }}</summary>
        <pre class="chat-context-body" style="white-space: pre-wrap">{{
          context
        }}</pre>
      </details>
      <div ref="container" class="chat-messages-container stack">
        <div
          v-for="(message, index) in messages"
          :key="message.id || index"
          class="chat-message"
          :class="message.role"
        >
          <div
            class="chat-avatar"
            :class="{ 'user-avatar': message.role === 'user' }"
          >
            <img
              v-if="message.role === 'user' && session.user?.hasAvatar"
              class="chat-avatar-img"
              :src="'api/me/avatar'"
              alt="Avatar"
            /><template v-else>
              {{ message.role === "user" ? "👤" : "🤖" }}</template
            >
          </div>
          <div class="chat-bubble-content">
            <div class="chat-bubble-header">
              <span class="chat-author">{{
                message.role === "user" ? "Du" : "Aquarium-Assistent"
              }}</span>
            </div>
            <MarkdownText
              v-if="message.role === 'assistant'"
              class="chat-text"
              :text="message.content"
            />
            <div v-else class="chat-text" style="white-space: pre-wrap">
              {{ message.content }}
            </div>
          </div>
        </div>
        <div v-if="answering" class="chat-message assistant" role="status" aria-live="polite" aria-atomic="true">
          <div class="chat-avatar" aria-hidden="true">🤖</div>
          <div class="chat-bubble-content">
            <strong>{{ t('chat.progressTitle') }}</strong>
            <ol class="chat-progress-steps">
              <li v-for="(stage, index) in progressStages" :key="stage" :class="{ muted: index < progressStages.length - 1 }">
                <span aria-hidden="true">{{ index < progressStages.length - 1 ? '✓' : '⏳' }}</span> {{ t(`chat.${stage}`) }}
              </li>
            </ol>
          </div>
        </div>
        <p v-else-if="busy" class="muted" role="status">{{ t("common.loading") }}</p>
      </div>
      <div class="chat-quick-prompts">
        <button
          v-for="prompt in diagnosis ? [t('health.chatPrompt')] : [
            'Bewerte meine Wasserwerte',
            'Passen neue Fische dazu?',
            'Tipps gegen Algen',
          ]"
          :key="prompt"
          class="btn small ghost chat-prompt-chip"
          :disabled="busy || historyLoading"
          @click="send(prompt)"
        >
          {{ prompt }}
        </button>
      </div>
      <form class="row chat-input-form" @submit.prevent="send()">
        <textarea
          v-model="input"
          rows="2"
          :aria-label="diagnosis ? t('health.chatMessage') : 'Nachricht'"
          required
          @keydown.enter.exact.prevent="send()"
        /><button class="btn" :disabled="busy || historyLoading">{{ diagnosis ? t("health.chatSend") : "Senden" }}</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p class="muted chat-disclaimer" style="font-size: 0.8rem">
        KI-Antworten können Fehler enthalten. Beim Senden werden Beckendaten an
        den ausgewählten Anbieter übermittelt.
      </p>
    </div></Modal
  >
</template>
