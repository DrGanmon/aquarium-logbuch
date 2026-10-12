<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import Modal from "./Modal.vue";
import MarkdownText from "./MarkdownText.vue";
import { api } from "../api";
import { t, errorMessage, session } from "../state";
import type { ChatMessage } from "../types";
const props = defineProps<{ id: string; name: string; readonly: boolean }>();
const emit = defineEmits<{ close: [] }>();
const messages = ref<ChatMessage[]>([]);
const input = ref("");
const busy = ref(false);
const error = ref("");
const container = ref<HTMLElement>();
const context = ref("");
const provider = ref(session.user?.aiProvider || "openai");
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
  window.visualViewport?.removeEventListener("resize", updateViewport);
  window.visualViewport?.removeEventListener("scroll", updateViewport);
});
onMounted(async () => {
  try {
    messages.value = (
      await api<{ messages: ChatMessage[] }>(
        `/aquariums/${props.id}/chat/history`,
      )
    ).messages;
    await scroll();
  } catch (e) {
    error.value = errorMessage(e);
  }
});
async function scroll() {
  await nextTick();
  container.value?.scrollTo({
    top: container.value.scrollHeight,
    behavior: "smooth",
  });
}
async function send(prompt = input.value) {
  if (busy.value || !prompt.trim()) return;
  busy.value = true;
  error.value = "";
  input.value = "";
  try {
    const result = await api<{ reply: string }>(`/aquariums/${props.id}/chat`, {
      method: "POST",
      body: { message: prompt, provider: provider.value, saveHistory: true },
    });
    messages.value.push(
      { role: "user", content: prompt },
      { role: "assistant", content: result.reply },
    );
    await scroll();
  } catch (e) {
    error.value = errorMessage(e);
    input.value = prompt;
  } finally {
    busy.value = false;
  }
}
async function loadContext() {
  try {
    context.value = (
      await api<{ systemPrompt: string }>(`/aquariums/${props.id}/chat/context`)
    ).systemPrompt;
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function clear() {
  if (!confirm("Chat-Verlauf löschen?")) return;
  try {
    await api(`/aquariums/${props.id}/chat/history`, { method: "DELETE" });
    messages.value = [];
  } catch (e) {
    error.value = errorMessage(e);
  }
}
</script>
<template>
  <Modal :title="`🤖 Aquarium-Assistent · ${name}`" wide dialog-class="aquarium-chat-modal" :dialog-style="viewportStyle" @close="emit('close')"
    ><div class="stack chat-dialog">
      <div class="row between chat-toolbar">
        <select v-model="provider">
          <option v-if="session.user?.hasOpenaiKey" value="openai">
            OpenAI
          </option>
          <option v-if="session.user?.hasGeminiKey" value="gemini">
            Gemini
          </option>
          <option v-if="session.user?.hasClaudeKey" value="claude">
            Claude
          </option></select
        ><button v-if="!readonly" class="btn small ghost danger" @click="clear">
          {{ t("common.delete") }}
        </button>
      </div>
      <details
        class="chat-context-details"
        @toggle="
          (event) => {
            if ((event.target as HTMLDetailsElement).open && !context)
              loadContext();
          }
        "
      >
        <summary>Beckenkontext</summary>
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
              src="api/me/avatar"
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
        <p v-if="busy" class="muted" role="status">{{ t("common.loading") }}</p>
      </div>
      <div class="chat-quick-prompts">
        <button
          v-for="prompt in [
            'Bewerte meine Wasserwerte',
            'Passen neue Fische dazu?',
            'Tipps gegen Algen',
          ]"
          :key="prompt"
          class="btn small ghost chat-prompt-chip"
          :disabled="busy"
          @click="send(prompt)"
        >
          {{ prompt }}
        </button>
      </div>
      <form class="row chat-input-form" @submit.prevent="send()">
        <textarea
          v-model="input"
          rows="2"
          aria-label="Nachricht"
          required
          @keydown.enter.exact.prevent="send()"
        /><button class="btn" :disabled="busy">Senden</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p class="muted chat-disclaimer" style="font-size: 0.8rem">
        KI-Antworten können Fehler enthalten. Beim Senden werden Beckendaten an
        den ausgewählten Anbieter übermittelt.
      </p>
    </div></Modal
  >
</template>
