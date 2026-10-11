'use strict';

import { h, toast, renderSimpleMarkdown } from '../dom.js';
import { api } from '../api.js';
import { ME, setMe } from '../state.js';
import { t } from '../i18n.js';

export function renderAiChatFab(aq) {
  if (
    ME?.hasAiKey ||
    ME?.hasAnyAiKey ||
    ME?.hasOpenaiKey ||
    ME?.hasGeminiKey ||
    ME?.hasClaudeKey
  ) {
    return h(
      'button',
      {
        class: 'chat-fab',
        type: 'button',
        title: t('aiChat.fabTooltip'),
        'aria-label': t('aiChat.fabTooltip'),
        onclick: () => showAquariumChatModal(aq),
      },
      '🤖',
      h('span', { class: 'chat-fab-badge' }, 'KI')
    );
  }
  return null;
}

export async function showAquariumChatModal(aq) {
  const dlg = h('dialog', {
    class: 'wide stack chat-dialog',
    style:
      'max-width: 820px; width: 95vw; height: 85vh; max-height: 850px; display: flex; flex-direction: column;',
  });
  const close = () => {
    dlg.close();
    dlg.remove();
  };

  const storageKey = `aquarium_chat_${aq.id}`;
  let chatHistory = [];
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) chatHistory = JSON.parse(saved);
  } catch (e) {
    chatHistory = [];
  }

  const errBanner = h('p', {
    class: 'error',
    role: 'alert',
    style: 'margin: 0; padding: .4rem .6rem;',
  });

  // Systemkontext-Bereich (aufklappbar)
  const contextDetails = h(
    'details',
    { class: 'chat-context-details', style: 'margin: 0 0 .5rem 0;' },
    h(
      'summary',
      {
        style:
          'cursor:pointer; font-size:.85rem; color:var(--ink-soft); font-weight:600;',
      },
      '📋 Auszug aus dem Systemkontext (Becken, Besatz & 10 Messwerte anzeigen)'
    ),
    h(
      'div',
      {
        class: 'chat-context-body stack',
        style:
          'margin-top:.4rem; font-size:.8rem; background:var(--table-hover); padding:.6rem; border-radius:6px; max-height:160px; overflow-y:auto; font-family:monospace; white-space:pre-wrap;',
      },
      'Lade Kontext...'
    )
  );

  let contextLoaded = false;
  contextDetails.addEventListener('toggle', async () => {
    if (contextDetails.open && !contextLoaded) {
      try {
        const res = await api(`/aquariums/${aq.id}/chat/context`);
        const bodyEl = contextDetails.querySelector('.chat-context-body');
        if (bodyEl) {
          bodyEl.textContent = res.systemPrompt;
          contextLoaded = true;
        }
      } catch (ex) {
        const bodyEl = contextDetails.querySelector('.chat-context-body');
        if (bodyEl) bodyEl.textContent = 'Fehler beim Laden des Kontexts: ' + ex.message;
      }
    }
  });

  // Aktiven Anbieter & Modell ermitteln
  let activeProvider = (ME?.aiProvider || 'openai').toLowerCase();
  const getProviderInfo = (prov) => {
    if (prov === 'gemini') {
      return {
        id: 'gemini',
        name: 'Google Gemini',
        model: ME?.geminiModel || 'gemini-2.5-flash',
        hasKey: Boolean(ME?.hasGeminiKey),
        link: 'https://aistudio.google.com/app/apikey',
      };
    }
    if (prov === 'claude') {
      return {
        id: 'claude',
        name: 'Anthropic Claude',
        model: ME?.claudeModel || 'claude-3-5-haiku-20241022',
        hasKey: Boolean(ME?.hasClaudeKey),
        link: 'https://console.anthropic.com/settings/keys',
      };
    }
    return {
      id: 'openai',
      name: 'OpenAI / ChatGPT',
      model: ME?.openaiModel || 'gpt-4o-mini',
      hasKey: Boolean(ME?.hasOpenaiKey),
      link: 'https://platform.openai.com/api-keys',
    };
  };

  let curInfo = getProviderInfo(activeProvider);

  // API Key Hinweis / Schnelleingabe wenn kein Key für den aktiven Anbieter vorhanden
  const apiKeyBox = h('div', {
    class: 'compat-box warn',
    style: !curInfo.hasKey ? 'display:block;' : 'display:none;',
  });
  const quickKeyInput = h('input', {
    type: 'password',
    placeholder: 'API-Schlüssel eingeben...',
    style: 'max-width: 280px; font-family: monospace;',
  });
  const quickKeySaveBtn = h('button', { class: 'btn small', type: 'button' }, 'Schlüssel speichern');
  const quickKeyLink = h(
    'a',
    {
      class: 'btn small ghost',
      href: curInfo.link,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    'Schlüssel erstellen ↗'
  );

  const updateApiKeyBoxContent = () => {
    curInfo = getProviderInfo(activeProvider);
    quickKeyLink.href = curInfo.link;
    apiKeyBox.replaceChildren(
      h('strong', {}, `🔑 Kein ${curInfo.name} API-Schlüssel hinterlegt`),
      h(
        'p',
        { style: 'margin: .2rem 0 .5rem; font-size:.88rem;' },
        `Um mit deinem Aquarium zu chatten, hinterlege bitte deinen persönlichen ${curInfo.name} API-Schlüssel. Du kannst ihn direkt hier eingeben oder im Profil unter „KI-Assistent & Sprachmodelle“ verwalten.`
      ),
      h(
        'div',
        { class: 'row', style: 'gap:.4rem; flex-wrap:wrap; align-items:center;' },
        quickKeyInput,
        quickKeySaveBtn,
        quickKeyLink
      )
    );
  };

  quickKeySaveBtn.addEventListener('click', async () => {
    const val = quickKeyInput.value.trim();
    if (!val) {
      toast('Bitte gib einen API-Schlüssel ein.');
      return;
    }
    quickKeySaveBtn.disabled = true;
    quickKeySaveBtn.textContent = 'Speichere...';
    try {
      const endpoint =
        activeProvider === 'gemini'
          ? '/me/gemini'
          : activeProvider === 'claude'
          ? '/me/claude'
          : '/me/openai';
      const res = await api(endpoint, {
        method: 'PUT',
        body: { apiKey: val, setAsActive: true },
      });
      setMe(res.user);
      apiKeyBox.style.display = 'none';
      toast(`${curInfo.name} API-Schlüssel gespeichert!`);
    } catch (ex) {
      toast(ex.message);
    } finally {
      quickKeySaveBtn.disabled = false;
      quickKeySaveBtn.textContent = 'Schlüssel speichern';
    }
  });

  updateApiKeyBoxContent();

  // Chat-Verlauf Container
  const messagesWrap = h('div', {
    class: 'chat-messages-container stack',
    style:
      'flex: 1; overflow-y: auto; padding: .75rem; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); gap: .75rem;',
  });

  function appendMessageUI(role, content, time = new Date()) {
    const isUser = role === 'user';
    const timeStr =
      typeof time === 'string'
        ? new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    let avatarEl;
    if (isUser) {
      if (ME?.hasAvatar) {
        avatarEl = h(
          'div',
          { class: 'chat-avatar user-avatar' },
          h('img', {
            src: `api/me/avatar?t=${Date.now()}`,
            alt: ME.username || 'User',
            class: 'chat-avatar-img',
            onerror: (e) => {
              if (e.currentTarget?.parentElement) {
                e.currentTarget.parentElement.textContent = '👤';
              }
            },
          })
        );
      } else {
        avatarEl = h('div', { class: 'chat-avatar' }, '👤');
      }
    } else {
      avatarEl = h('div', { class: 'chat-avatar' }, '🤖');
    }

    const msgBubble = h(
      'div',
      { class: `chat-message ${isUser ? 'user' : 'assistant'}` },
      avatarEl,
      h(
        'div',
        { class: 'chat-bubble-content' },
        h(
          'div',
          { class: 'chat-bubble-header' },
          h('span', { class: 'chat-author' }, isUser ? 'Du' : `Aquarium-Assistent (${aq.name})`),
          h('span', { class: 'chat-time' }, timeStr)
        ),
        isUser
          ? h('div', { class: 'chat-text' }, content)
          : (() => {
              const el = h('div', { class: 'chat-text markdown-body' });
              el.innerHTML = renderSimpleMarkdown(content);
              return el;
            })()
      )
    );

    messagesWrap.appendChild(msgBubble);
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  }

  function renderHistory() {
    messagesWrap.replaceChildren();
    if (chatHistory.length === 0) {
      appendMessageUI(
        'assistant',
        `Hallo! Ich bin dein persönlicher Aquaristik-Assistent für **${aq.name}**.\n\nIch habe deine Beckengröße (${aq.volume_l ? aq.volume_l + 'l ' : ''}${aq.water_type === 'salt' ? 'Meerwasser' : 'Süßwasser'}), deinen Besatz sowie deine letzten **10 Messungen** im Blick.\n\nStelle mir gerne beliebige Fragen zu Wasserwerten, Fischverhalten, Düngung, Algen oder Pflegetipps!`,
        new Date()
      );
    } else {
      chatHistory.forEach((m) => appendMessageUI(m.role, m.content, m.time || m.created_at));
    }
  }

  renderHistory();

  // Chat-Historie vom Server laden (persistent über Sitzungen und Geräte hinweg)
  async function loadHistoryFromServer() {
    try {
      const res = await api(`/aquariums/${aq.id}/chat/history`);
      if (res && Array.isArray(res.messages)) {
        if (res.messages.length > 0) {
          chatHistory = res.messages.map((m) => ({
            role: m.role,
            content: m.content,
            time: m.created_at,
            provider: m.provider,
            model: m.model,
          }));
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(chatHistory));
          } catch (e) {}
          renderHistory();
        }
      }
    } catch (e) {
      // Ignoriere Netzwerkfehler beim Laden der Historie
    }
  }

  loadHistoryFromServer();

  // Schnellstart-Fragen
  const quickPrompts = [
    t('aiChat.qWater'),
    t('aiChat.qStock'),
    t('aiChat.qAlgae'),
    t('aiChat.qCare'),
  ];

  const quickPromptsRow = h(
    'div',
    {
      class: 'chat-quick-prompts',
      style: 'display: flex; gap: .4rem; overflow-x: auto; padding: .2rem 0;',
    },
    quickPrompts.map((qp) =>
      h(
        'button',
        {
          class: 'btn small ghost chat-prompt-chip',
          type: 'button',
          onclick: () => {
            inputField.value = qp;
            sendMessage();
          },
        },
        qp
      )
    )
  );

  // Eingabebereich
  const inputField = h('textarea', {
    placeholder: t('aiChat.inputPlaceholder'),
    rows: '2',
    style:
      'flex: 1; resize: none; font-size: .95rem; border-radius: 8px; padding: .5rem .75rem;',
  });

  const sendBtn = h(
    'button',
    { class: 'btn', type: 'button', style: 'align-self: flex-end;' },
    `➤ ${t('aiChat.send')}`
  );
  const clearBtn = h(
    'button',
    {
      class: 'btn small ghost',
      type: 'button',
      title: t('aiChat.clearChat'),
      onclick: async () => {
        if (chatHistory.length === 0) return;
        if (!confirm(t('aiChat.clearChat') + '?')) return;
        try {
          await api(`/aquariums/${aq.id}/chat/history`, { method: 'DELETE' });
        } catch (e) {
          // Ignorieren falls Serverfehler
        }
        chatHistory = [];
        try {
          sessionStorage.removeItem(storageKey);
        } catch (e) {}
        renderHistory();
        toast('Chat-Verlauf geleert.');
      },
    },
    `🗑️ ${t('aiChat.clearChat')}`
  );

  let isSending = false;

  async function sendMessage() {
    const text = inputField.value.trim();
    if (!text || isSending) return;

    errBanner.textContent = '';
    isSending = true;
    sendBtn.disabled = true;
    inputField.disabled = true;

    // Nachricht zur UI und History hinzufügen
    const userMsg = { role: 'user', content: text, time: new Date().toISOString() };
    chatHistory.push(userMsg);
    appendMessageUI('user', text, new Date());
    inputField.value = '';

    // Lade-Indikator
    const typingIndicator = h(
      'div',
      { class: 'chat-message assistant typing-indicator-msg' },
      h('div', { class: 'chat-avatar' }, '🤖'),
      h(
        'div',
        { class: 'chat-bubble-content' },
        h(
          'div',
          { class: 'chat-typing-dots' },
          h('span', {}, '•'),
          h('span', {}, '•'),
          h('span', {}, '•')
        )
      )
    );
    messagesWrap.appendChild(typingIndicator);
    messagesWrap.scrollTop = messagesWrap.scrollHeight;

    try {
      const apiMessages = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      const res = await api(`/aquariums/${aq.id}/chat`, {
        method: 'POST',
        body: { messages: apiMessages, message: text, provider: activeProvider },
      });

      typingIndicator.remove();
      const assistantMsg = {
        role: 'assistant',
        content: res.reply,
        time: new Date().toISOString(),
      };
      chatHistory.push(assistantMsg);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(chatHistory));
      } catch (e) {}

      appendMessageUI('assistant', res.reply, new Date());
    } catch (ex) {
      typingIndicator.remove();
      errBanner.textContent = ex.message;
      if (ex.message.includes('API-Schlüssel') || ex.code === 'NO_API_KEY') {
        apiKeyBox.style.display = 'block';
      }
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      inputField.disabled = false;
      inputField.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  const headerRow = h(
    'div',
    { class: 'row between', style: 'align-items: center;' },
    h(
      'div',
      { style: 'display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;' },
      h('h2', { style: 'margin:0;' }, `🤖 KI-Assistent: ${aq.name}`),
      h('span', { class: 'tag info', style: 'font-size: .8rem;' }, `${curInfo.name}: ${curInfo.model}`)
    ),
    h(
      'div',
      { class: 'row', style: 'gap: .4rem; align-items: center;' },
      clearBtn,
      h('button', { class: 'btn small ghost', type: 'button', onclick: close, 'aria-label': 'Schließen' }, '✕')
    )
  );

  const inputRow = h(
    'div',
    { class: 'row', style: 'gap: .5rem; align-items: flex-end;' },
    inputField,
    sendBtn
  );

  dlg.replaceChildren(
    headerRow,
    contextDetails,
    apiKeyBox,
    messagesWrap,
    quickPromptsRow,
    errBanner,
    inputRow
  );

  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  inputField.focus();
}
