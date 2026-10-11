'use strict';

import { h, mount, toast } from '../dom.js';
import { api } from '../api.js';
import {
  CONFIG,
  ME,
  setMe,
  setConfig,
  GRAPH_RANGE_STORAGE_KEY,
  RANGE,
  setRange,
} from '../state.js';
import { getThemeSetting, applyTheme } from '../theme.js';
import { pushNotificationManager, notificationsCard } from '../notifications.js';
import { fmtDate, mmss } from '../utils.js';
import { updateTopbarUser, route } from '../router.js';
import { processImageInWorker } from '../worker-client.js';
import { t, getLanguage, setLanguage } from '../i18n.js';

export async function viewProfile() {
  const meData = await api('/me');
  setMe(meData);
  updateTopbarUser();

  const currentMe = ME;
  const initials = (
    currentMe.firstName
      ? currentMe.firstName[0]
      : currentMe.username
      ? currentMe.username[0]
      : '?'
  ).toUpperCase();

  // Avatar-Sektion
  const avatarErr = h('p', { class: 'error', role: 'alert' });
  const avatarImg = currentMe.hasAvatar
    ? h('img', {
        class: 'avatar-large',
        src: `api/me/avatar?t=${Date.now()}`,
        alt: currentMe.username,
      })
    : h('div', { class: 'avatar-placeholder' }, initials);

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    style: 'display:none',
  });
  const btnSelectImg = h(
    'button',
    { class: 'btn small', type: 'button', onclick: () => fileInput.click() },
    'Neues Bild hochladen'
  );
  const btnDeleteImg = currentMe.hasAvatar
    ? h(
        'button',
        {
          class: 'btn small ghost danger',
          type: 'button',
          onclick: async () => {
            if (!confirm('Möchtest du dein Profilbild wirklich entfernen?')) return;
            try {
              await api('/me/avatar', { method: 'DELETE' });
              toast('Profilbild entfernt.');
              await viewProfile();
            } catch (ex) {
              avatarErr.textContent = ex.message;
            }
          },
        },
        'Bild entfernen'
      )
    : null;

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      avatarErr.textContent = 'Das ausgewählte Bild ist größer als 5 MB.';
      fileInput.value = '';
      return;
    }
    avatarErr.textContent = '';
    try {
      // Bildkomprimierung und Skalierung im Web Worker (Multithreading)
      const processed = await processImageInWorker(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.88,
        mimeType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      });
      await api('/me/avatar', { method: 'POST', body: { image: processed.dataUrl } });
      toast('Profilbild aktualisiert.');
      await viewProfile();
    } catch (ex) {
      avatarErr.textContent = ex.message;
    }
  });

  const avatarCard = h(
    'div',
    { class: 'card stack' },
    h('h2', {}, 'Profilbild'),
    h(
      'div',
      { class: 'profile-avatar-row' },
      avatarImg,
      h(
        'div',
        { class: 'stack', style: 'gap:.5rem' },
        h('div', { class: 'row' }, btnSelectImg, btnDeleteImg),
        h(
          'p',
          { class: 'muted', style: 'margin:0' },
          'Erlaubt sind JPG, PNG, WebP und GIF bis max. 5 MB.'
        ),
        fileInput,
        avatarErr
      )
    )
  );

  // Formular: Persönliche Daten
  const profileErr = h('p', { class: 'error', role: 'alert' });
  const fUsername = h('input', { required: true, maxlength: '40', value: currentMe.username });
  const fFirstName = h('input', {
    maxlength: '100',
    value: currentMe.firstName || '',
    placeholder: 'z. B. Max',
  });
  const fLastName = h('input', {
    maxlength: '100',
    value: currentMe.lastName || '',
    placeholder: 'z. B. Mustermann',
  });
  const fBio = h(
    'textarea',
    {
      maxlength: '1000',
      placeholder: 'Erzähle etwas über deine Aquarien oder dein Hobby...',
    },
    currentMe.bio || ''
  );
  const fEmail = h('input', {
    type: 'email',
    maxlength: '120',
    value: currentMe.email || '',
    placeholder: 'z. B. max@example.com',
  });

  const profileForm = h(
    'form',
    {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        profileErr.textContent = '';
        const body = {
          username: fUsername.value.trim(),
          firstName: fFirstName.value.trim() || '',
          lastName: fLastName.value.trim() || '',
          bio: fBio.value.trim() || '',
          email: fEmail.value.trim() || null,
        };
        try {
          const res = await api('/me', { method: 'PUT', body });
          setMe(res.user);
          updateTopbarUser();
          toast('Profil erfolgreich gespeichert.');
          await viewProfile();
        } catch (ex) {
          profileErr.textContent = ex.message;
        }
      },
    },
    h('h2', {}, 'Persönliche Daten'),
    h('div', { class: 'field' }, h('label', {}, 'Benutzername'), fUsername),
    h(
      'div',
      { class: 'grid2' },
      h('div', { class: 'field' }, h('label', {}, 'Vorname'), fFirstName),
      h('div', { class: 'field' }, h('label', {}, 'Nachname'), fLastName)
    ),
    h('div', { class: 'field' }, h('label', {}, 'Über mich'), fBio),
    h('div', { class: 'field' }, h('label', {}, 'E-Mail-Adresse'), fEmail),
    profileErr,
    h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Profil speichern'))
  );

  // Passwort-Sektion
  let passwordCard = null;
  if (currentMe.hasPassword) {
    const pwErr = h('p', { class: 'error', role: 'alert' });
    const fCurPw = h('input', {
      type: 'password',
      autocomplete: 'current-password',
      required: true,
    });
    const fNewPw = h('input', {
      type: 'password',
      autocomplete: 'new-password',
      required: true,
      minlength: '8',
    });
    const pwForm = h(
      'form',
      {
        class: 'card stack',
        onsubmit: async (e) => {
          e.preventDefault();
          pwErr.textContent = '';
          try {
            await api('/password', {
              method: 'POST',
              body: { current: fCurPw.value, next: fNewPw.value },
            });
            fCurPw.value = '';
            fNewPw.value = '';
            toast('Passwort erfolgreich geändert.');
          } catch (ex) {
            pwErr.textContent = ex.message;
          }
        },
      },
      h('h2', {}, 'Passwort ändern'),
      h('div', { class: 'field' }, h('label', {}, 'Aktuelles Passwort'), fCurPw),
      h(
        'div',
        { class: 'field' },
        h('label', {}, 'Neues Passwort (mindestens 8 Zeichen)'),
        fNewPw
      ),
      pwErr,
      h('div', {}, h('button', { class: 'btn', type: 'submit' }, 'Passwort ändern'))
    );
    passwordCard = pwForm;
  }

  // OIDC-Sektion
  let oidcCard = null;
  if (currentMe.oidcEnabled) {
    const oidcErr = h('p', { class: 'error', role: 'alert' });
    const providerName = currentMe.oidcProviderName || 'Pocket ID';
    let oidcBody;
    if (currentMe.hasOidc) {
      oidcBody = h(
        'div',
        { class: 'stack', style: 'gap:.75rem' },
        h(
          'p',
          {},
          `Dieses Konto ist erfolgreich mit `,
          h('strong', {}, providerName),
          ` verknüpft.`
        ),
        currentMe.hasPassword
          ? h(
              'div',
              {},
              h(
                'button',
                {
                  class: 'btn small ghost danger',
                  type: 'button',
                  onclick: async () => {
                    if (
                      !confirm(
                        `Möchtest du die Verknüpfung mit ${providerName} wirklich aufheben?`
                      )
                    )
                      return;
                    try {
                      await api('/me/unlink-oidc', { method: 'POST' });
                      toast(`Verknüpfung mit ${providerName} aufgehoben.`);
                      await viewProfile();
                    } catch (ex) {
                      oidcErr.textContent = ex.message;
                    }
                  },
                },
                'Verknüpfung trennen'
              )
            )
          : h(
              'p',
              { class: 'muted' },
              'Da für dieses Konto kein lokales Passwort existiert, kann die Verknüpfung nicht getrennt werden.'
            )
      );
    } else {
      oidcBody = h(
        'div',
        { class: 'stack', style: 'gap:.75rem' },
        h(
          'p',
          {},
          `Dieses Konto ist noch nicht mit `,
          h('strong', {}, providerName),
          ` verknüpft. Du kannst es jetzt verbinden, um dich künftig per Single Sign-On anzumelden.`
        ),
        h('div', {}, h('a', { class: 'btn', href: 'auth/link' }, `Mit ${providerName} verknüpfen`))
      );
    }

    oidcCard = h(
      'div',
      { class: 'card stack' },
      h('h2', {}, `${providerName} / OIDC-Verknüpfung`),
      oidcBody,
      oidcErr
    );
  }

  // KI-Assistent & Sprachmodelle Sektion (OpenAI, Gemini, Claude)
  const aiErr = h('p', { class: 'error', role: 'alert' });
  const aiSuccess = h('div', { class: 'compat-box ok', style: 'display:none; margin-top:.5rem;' });

  // 1. Aktiver Anbieter Selector
  const activeAiProviderSelect = h(
    'select',
    {},
    h(
      'option',
      { value: 'openai', selected: (currentMe.aiProvider || 'openai') === 'openai' },
      'OpenAI / ChatGPT' + (currentMe.hasOpenaiKey ? ' (Schlüssel hinterlegt)' : '')
    ),
    h(
      'option',
      { value: 'gemini', selected: currentMe.aiProvider === 'gemini' },
      'Google Gemini' + (currentMe.hasGeminiKey ? ' (Schlüssel hinterlegt)' : '')
    ),
    h(
      'option',
      { value: 'claude', selected: currentMe.aiProvider === 'claude' },
      'Anthropic Claude' + (currentMe.hasClaudeKey ? ' (Schlüssel hinterlegt)' : '')
    )
  );

  activeAiProviderSelect.addEventListener('change', async (e) => {
    aiErr.textContent = '';
    aiSuccess.style.display = 'none';
    try {
      const res = await api('/me/ai', { method: 'PUT', body: { provider: e.target.value } });
      setMe(res.user);
      toast(
        `Aktiver KI-Anbieter auf ${e.target.selectedOptions[0].text.split(' (')[0]} gesetzt.`
      );
      viewProfile();
    } catch (ex) {
      aiErr.textContent = ex.message;
    }
  });

  // 2. Provider-Sektionen aufbauen
  function makeProviderBox({
    id,
    title,
    badge,
    description,
    keyPlaceholder,
    keyMasked,
    keySet,
    hasKey,
    serverHasKey,
    modelVal,
    models,
    keyUrl,
    keyUrlText,
    saveEndpoint,
    deleteEndpoint,
    testEndpoint,
  }) {
    const fKey = h('input', {
      type: 'password',
      placeholder: keySet
        ? `Gespeichert (${keyMasked})`
        : serverHasKey
        ? 'Server-Standard aktiv'
        : keyPlaceholder,
      autocomplete: 'off',
      style: 'font-family: monospace;',
    });

    const hasCustomVal = modelVal && !models.some((m) => m.value === modelVal);
    const options = models.map((m) =>
      h('option', { value: m.value, selected: modelVal === m.value }, m.label)
    );
    if (hasCustomVal) {
      options.unshift(h('option', { value: modelVal, selected: true }, `${modelVal} (Benutzerdefiniert)`));
    }

    const fMod = h('select', {}, options);

    const boxErr = h('p', { class: 'error', role: 'alert' });
    const boxSuccess = h('div', { class: 'compat-box ok', style: 'display:none; margin-top:.5rem;' });

    const btnTest = h(
      'button',
      {
        class: 'btn small ghost',
        type: 'button',
        onclick: async () => {
          boxErr.textContent = '';
          boxSuccess.style.display = 'none';
          const keyVal = fKey.value.trim();
          if (!keyVal && !hasKey) {
            boxErr.textContent = `Bitte gib zuerst einen ${title} API-Schlüssel ein.`;
            return;
          }
          btnTest.disabled = true;
          btnTest.textContent = '⏳ Teste...';
          try {
            const res = await api(testEndpoint, {
              method: 'POST',
              body: { apiKey: keyVal || undefined, model: fMod.value },
            });
            boxSuccess.textContent = '✅ ' + (res.message || 'Verbindung erfolgreich!');
            boxSuccess.style.display = 'block';
          } catch (ex) {
            boxErr.textContent = ex.message;
          } finally {
            btnTest.disabled = false;
            btnTest.textContent = '🧪 Verbindung testen';
          }
        },
      },
      '🧪 Verbindung testen'
    );

    const btnDelete = keySet
      ? h(
          'button',
          {
            class: 'btn small ghost danger',
            type: 'button',
            onclick: async () => {
              if (
                !confirm(
                  `Möchtest du deinen hinterlegten ${title} API-Schlüssel wirklich entfernen?`
                )
              )
                return;
              boxErr.textContent = '';
              try {
                const res = await api(deleteEndpoint, { method: 'DELETE' });
                setMe(res.user);
                toast(`${title} API-Schlüssel entfernt.`);
                viewProfile();
              } catch (ex) {
                boxErr.textContent = ex.message;
              }
            },
          },
          'Schlüssel entfernen'
        )
      : null;

    const btnSave = h('button', { class: 'btn small', type: 'submit' }, 'Speichern');

    const form = h(
      'form',
      {
        class: 'stack',
        style:
          'padding: 1rem; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); gap: .75rem;',
        onsubmit: async (e) => {
          e.preventDefault();
          boxErr.textContent = '';
          boxSuccess.style.display = 'none';
          try {
            const keyVal = fKey.value.trim();
            const body = { model: fMod.value };
            if (keyVal) body.apiKey = keyVal;
            const res = await api(saveEndpoint, { method: 'PUT', body });
            setMe(res.user);
            toast(`${title} Einstellungen gespeichert.`);
            viewProfile();
          } catch (ex) {
            boxErr.textContent = ex.message;
          }
        },
      },
      h(
        'div',
        { class: 'row between', style: 'align-items:center; flex-wrap:wrap; gap:.4rem;' },
        h('h3', { style: 'margin:0; font-size:1.05rem;' }, title),
        badge
      ),
      h('p', { class: 'muted', style: 'margin:0; font-size:.88rem;' }, description),
      h(
        'div',
        { class: 'field' },
        h('label', {}, `${title} API-Schlüssel`),
        fKey,
        h(
          'span',
          { class: 'muted', style: 'font-size:.82rem; margin-top:.2rem;' },
          'Schlüssel erstellen auf ',
          h('a', { href: keyUrl, target: '_blank', rel: 'noopener noreferrer' }, keyUrlText)
        )
      ),
      h('div', { class: 'field' }, h('label', {}, 'Modell'), fMod),
      boxErr,
      boxSuccess,
      h('div', { class: 'row', style: 'gap:.4rem; flex-wrap:wrap;' }, btnSave, btnTest, btnDelete)
    );

    return form;
  }

  // Badges
  const openAiBadge = currentMe.openaiKeySet
    ? h('span', { class: 'tag ok' }, `Aktiv: ${currentMe.openaiKeyMasked}`)
    : currentMe.serverHasOpenaiKey
    ? h('span', { class: 'tag info' }, 'Server-Standard')
    : h('span', { class: 'tag warn' }, 'Kein Key');

  const geminiBadge = currentMe.geminiKeySet
    ? h('span', { class: 'tag ok' }, `Aktiv: ${currentMe.geminiKeyMasked}`)
    : currentMe.serverHasGeminiKey
    ? h('span', { class: 'tag info' }, 'Server-Standard')
    : h('span', { class: 'tag warn' }, 'Kein Key');

  const claudeBadge = currentMe.claudeKeySet
    ? h('span', { class: 'tag ok' }, `Aktiv: ${currentMe.claudeKeyMasked}`)
    : currentMe.serverHasClaudeKey
    ? h('span', { class: 'tag info' }, 'Server-Standard')
    : h('span', { class: 'tag warn' }, 'Kein Key');

  // OpenAI Box
  const openaiBox = makeProviderBox({
    id: 'openai',
    title: '🟢 OpenAI / ChatGPT',
    badge: openAiBadge,
    description: 'Unterstützt GPT-6, GPT-6-mini, GPT-5, GPT-4o, GPT-4o-mini, o3-mini, o1 und frühere OpenAI-Modelle.',
    keyPlaceholder: 'sk-proj-...',
    keyMasked: currentMe.openaiKeyMasked,
    keySet: currentMe.openaiKeySet,
    hasKey: currentMe.hasOpenaiKey,
    serverHasKey: currentMe.serverHasOpenaiKey,
    modelVal: currentMe.openaiModel || 'gpt-4o-mini',
    models: [
      { value: 'gpt-6', label: 'gpt-6 (Next-Gen Flaggschiff-Modell: Maximale Intelligenz & Präzision)' },
      { value: 'gpt-6-mini', label: 'gpt-6-mini (Next-Gen: Ultra-Schnell & Kosteneffizient)' },
      { value: 'gpt-5', label: 'gpt-5 (Next-Gen High-End-Modell)' },
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini (Empfohlen: Schnell & Kostengünstig)' },
      { value: 'gpt-4o', label: 'gpt-4o (Leistungsstarkes Allround-Modell)' },
      { value: 'o3-mini', label: 'o3-mini (Reasoning-Modell für komplexe Analysen)' },
      { value: 'o1', label: 'o1 (Erweitertes Reasoning-Modell)' },
      { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
      { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    ],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlText: 'platform.openai.com/api-keys',
    saveEndpoint: '/me/openai',
    deleteEndpoint: '/me/openai',
    testEndpoint: '/me/openai/test',
  });

  // Google Gemini Box
  const geminiBox = makeProviderBox({
    id: 'gemini',
    title: '🔵 Google Gemini',
    badge: geminiBadge,
    description:
      'Unterstützt Gemini 2.5 Flash, 2.0 Flash, 1.5 Flash und 1.5 Pro über Google AI Studio.',
    keyPlaceholder: 'AIzaSy...',
    keyMasked: currentMe.geminiKeyMasked,
    keySet: currentMe.geminiKeySet,
    hasKey: currentMe.hasGeminiKey,
    serverHasKey: currentMe.serverHasGeminiKey,
    modelVal: currentMe.geminiModel || 'gemini-2.5-flash',
    models: [
      {
        value: 'gemini-2.5-flash',
        label: 'gemini-2.5-flash (Empfohlen: Neuestes & extrem schnelles Flash-Modell)',
      },
      { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Sehr schnell & kostengünstig)' },
      { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Bewährtes Multimodal-Modell)' },
      { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro (Höchste Argumentationstiefe)' },
    ],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyUrlText: 'aistudio.google.com/app/apikey',
    saveEndpoint: '/me/gemini',
    deleteEndpoint: '/me/gemini',
    testEndpoint: '/me/gemini/test',
  });

  // Anthropic Claude Box
  const claudeBox = makeProviderBox({
    id: 'claude',
    title: '🟣 Anthropic Claude',
    badge: claudeBadge,
    description:
      'Unterstützt Claude 3.5 Haiku, Claude 3.5 Sonnet und Claude 3 Opus über Anthropic Console.',
    keyPlaceholder: 'sk-ant-...',
    keyMasked: currentMe.claudeKeyMasked,
    keySet: currentMe.claudeKeySet,
    hasKey: currentMe.hasClaudeKey,
    serverHasKey: currentMe.serverHasClaudeKey,
    modelVal: currentMe.claudeModel || 'claude-3-5-haiku-20241022',
    models: [
      {
        value: 'claude-3-5-haiku-20241022',
        label: 'claude-3-5-haiku (Empfohlen: Schnell, kostengünstig & intelligent)',
      },
      {
        value: 'claude-3-5-sonnet-20241022',
        label:
          'claude-3-5-sonnet (Modernstes Spitzenmodell mit maximaler Analysefähigkeit)',
      },
      { value: 'claude-3-haiku-20240307', label: 'claude-3-haiku' },
      { value: 'claude-3-opus-20240229', label: 'claude-3-opus' },
    ],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlText: 'console.anthropic.com/settings/keys',
    saveEndpoint: '/me/claude',
    deleteEndpoint: '/me/claude',
    testEndpoint: '/me/claude/test',
  });

  const aiCard = h(
    'div',
    { class: 'card stack', style: 'gap:1.25rem;' },
    h(
      'div',
      { class: 'row between', style: 'align-items:center; flex-wrap:wrap; gap:.5rem;' },
      h('h2', { style: 'margin:0;' }, '🤖 KI-Assistent & Sprachmodelle'),
      currentMe.hasAnyAiKey || currentMe.hasAiKey
        ? h(
            'span',
            { class: 'tag ok' },
            `Aktiver Anbieter: ${
              activeAiProviderSelect.options[activeAiProviderSelect.selectedIndex]?.text.split(
                ' ('
              )[0] || 'OpenAI'
            }`
          )
        : h('span', { class: 'tag warn' }, 'Kein aktiver Schlüssel')
    ),
    h(
      'p',
      { class: 'muted', style: 'margin:0;' },
      'Hinterlege deinen persönlichen API-Schlüssel für OpenAI (ChatGPT), Google Gemini oder Anthropic Claude, um direkt in der App mit deinen Aquarien zu chatten. Der KI-Assistent erhält bei jeder Frage den gesamten Beckenkontext (Größe, Besatz, Grenzwerte und die letzten 10 Messungen).'
    ),
    h('div', { class: 'field' }, h('label', {}, 'Aktiver KI-Anbieter für Aquarium-Chat'), activeAiProviderSelect),
    aiErr,
    aiSuccess,
    h('div', { class: 'stack', style: 'gap:1rem;' }, openaiBox, geminiBox, claudeBox)
  );

  // Testsuite & Wassertests Sektion
  const suites = CONFIG?.suites || [];
  let userSuiteId = currentMe.selectedSuite || CONFIG?.defaultSuiteId || 'jbl-pro';
  let curSuite =
    suites.find((s) => s.id === userSuiteId) || CONFIG?.currentSuite || suites[0];
  let userTests = Array.isArray(currentMe.selectedTests)
    ? [...currentMe.selectedTests]
    : curSuite.tests.map((t) => t.key);

  const testsSuiteSelect = h(
    'select',
    {},
    suites.map((s) => h('option', { value: s.id, selected: s.id === curSuite.id }, s.name))
  );

  const testListDiv = h('div', { class: 'stack', style: 'gap:.5rem; margin-top:.5rem' });

  const renderSuiteTests = () => {
    testListDiv.replaceChildren(
      h('p', { class: 'muted', style: 'margin:0' }, curSuite.description),
      h(
        'div',
        { class: 'picker', style: 'margin-top:.4rem' },
        curSuite.tests.map((t) =>
          h(
            'label',
            {},
            h('input', {
              type: 'checkbox',
              checked: userTests.includes(t.key),
              onchange: (e) => {
                userTests = e.target.checked
                  ? [...new Set([...userTests, t.key])]
                  : userTests.filter((k) => k !== t.key);
              },
            }),
            t.name + (t.wait ? ` (${mmss(t.wait)})` : '')
          )
        )
      )
    );
  };

  testsSuiteSelect.addEventListener('change', (e) => {
    const found = suites.find((s) => s.id === e.target.value);
    if (!found) return;
    curSuite = found;
    userSuiteId = found.id;
    userTests = found.tests.map((t) => t.key);
    renderSuiteTests();
  });

  const testSaveErr = h('p', { class: 'error', role: 'alert' });
  const testSuiteCard = h(
    'form',
    {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        testSaveErr.textContent = '';
        try {
          const res = await api('/me/tests', {
            method: 'PUT',
            body: { selectedSuite: curSuite.id, selectedTests: userTests },
          });
          currentMe.selectedSuite = res.selectedSuite;
          currentMe.selectedTests = res.selectedTests;
          localStorage.setItem(`tests:${currentMe.id}`, JSON.stringify(res.selectedTests));
          const updatedConfig = await api('/config');
          setConfig(updatedConfig);
          toast('Testsuite und Wassertests gespeichert.');
        } catch (ex) {
          testSaveErr.textContent = ex.message;
        }
      },
    },
    h('h2', {}, 'Wassertests & Testsuite'),
    h(
      'p',
      { class: 'muted', style: 'margin:0' },
      'Wähle deine bevorzugte Testsuite (Standard: JBL Pro Tröpfchentest) und hake die Tests an, die du besitzt oder routinemäßig messen möchtest.'
    ),
    h('div', { class: 'field' }, h('label', {}, 'Aktive Testsuite'), testsSuiteSelect),
    testListDiv,
    testSaveErr,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', type: 'submit' }, 'Testauswahl speichern'),
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => {
            userTests = curSuite.tests.map((t) => t.key);
            renderSuiteTests();
          },
        },
        'Alle Tests auswählen'
      ),
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => {
            userTests = [];
            renderSuiteTests();
          },
        },
        'Keine auswählen'
      )
    )
  );
  renderSuiteTests();

  // Farbschema / Theme Sektion
  const currentTheme = getThemeSetting();
  const themeOptions = [
    {
      key: 'system',
      icon: '💻',
      title: 'Systemstandard',
      desc: 'Passt sich automatisch deinen Betriebssystem-Einstellungen an.',
    },
    {
      key: 'light',
      icon: '☀️',
      title: 'Heller Modus',
      desc: 'Helles, klares Farbschema für den Tag.',
    },
    {
      key: 'dark',
      icon: '🌙',
      title: 'Dunkler Modus',
      desc: 'Augenschonendes, kontrastreiches dunkles Farbschema.',
    },
  ];

  const themeOptionElements = [];
  const themeOptionsContainer = h(
    'div',
    { class: 'theme-options' },
    themeOptions.map((opt) => {
      const card = h(
        'div',
        {
          class: `theme-option ${currentTheme === opt.key ? 'active' : ''}`,
          role: 'button',
          tabindex: '0',
          onclick: () => {
            applyTheme(opt.key, true);
            themeOptionElements.forEach(({ el, key }) => {
              el.classList.toggle('active', key === opt.key);
            });
          },
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              card.click();
            }
          },
        },
        h(
          'div',
          { class: 'theme-option-head' },
          h('span', { class: 'theme-option-icon' }, opt.icon),
          h('span', {}, opt.title)
        ),
        h('p', { class: 'theme-option-desc' }, opt.desc)
      );
      themeOptionElements.push({ el: card, key: opt.key });
      return card;
    })
  );

  // Erscheinungsbild / Farbschema
  const themeCard = h(
    'div',
    { class: 'card stack' },
    h('h2', {}, t('profile.themeTitle') || 'Erscheinungsbild / Farbschema'),
    h(
      'p',
      { class: 'muted', style: 'margin:0' },
      'Wähle dein bevorzugtes Design oder nutze den automatischen Modus entsprechend deinen Systemeinstellungen.'
    ),
    themeOptionsContainer
  );

  // Sprache / Language Sektion
  const currentLang = getLanguage();
  const langOptions = [
    {
      key: 'de',
      flag: '🇩🇪',
      title: 'Deutsch',
      desc: 'Deutsche Benutzeroberfläche und Zahlen-/Datumsformate.',
    },
    {
      key: 'en',
      flag: '🇬🇧',
      title: 'English',
      desc: 'English user interface and formatting.',
    },
  ];

  const langOptionElements = [];
  const langOptionsContainer = h(
    'div',
    { class: 'theme-options' },
    langOptions.map((opt) => {
      const card = h(
        'div',
        {
          class: `theme-option ${currentLang === opt.key ? 'active' : ''}`,
          role: 'button',
          tabindex: '0',
          onclick: async () => {
            setLanguage(opt.key);
            langOptionElements.forEach(({ el, key }) => {
              el.classList.toggle('active', key === opt.key);
            });
            try {
              await api('/me', { method: 'PUT', body: { language: opt.key } });
              currentMe.language = opt.key;
            } catch (e) {
              /* ignore */
            }
            viewProfile();
          },
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              card.click();
            }
          },
        },
        h(
          'div',
          { class: 'theme-option-head' },
          h('span', { class: 'theme-option-icon' }, opt.flag),
          h('span', {}, opt.title)
        ),
        h('p', { class: 'theme-option-desc' }, opt.desc)
      );
      langOptionElements.push({ el: card, key: opt.key });
      return card;
    })
  );

  const languageCard = h(
    'div',
    { class: 'card stack' },
    h('h2', {}, t('profile.languageTitle')),
    h('p', { class: 'muted', style: 'margin:0' }, t('profile.languageDesc')),
    langOptionsContainer
  );

  // Standard-Zeitraum für Graphen & Messverlauf
  const defaultRangeOptions = [
    { key: '7', label: '7 Tage (1 Woche)' },
    { key: '14', label: '14 Tage (2 Wochen)' },
    { key: '30', label: '30 Tage (1 Monat)' },
    { key: '90', label: '90 Tage (3 Monate – Standard)' },
    { key: '180', label: '180 Tage (6 Monate)' },
    { key: '365', label: '365 Tage (1 Jahr)' },
    { key: '3650', label: 'Alles (Gesamte Historie)' },
  ];

  const currentDefaultRange = String(currentMe.defaultGraphRange || '90');
  const graphRangeSelect = h(
    'select',
    {},
    defaultRangeOptions.map((opt) =>
      h('option', { value: opt.key, selected: opt.key === currentDefaultRange }, opt.label)
    )
  );
  const graphRangeSaveErr = h('p', { class: 'error', role: 'alert' });

  const graphRangeCard = h(
    'form',
    {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        graphRangeSaveErr.textContent = '';
        try {
          const selectedRange = graphRangeSelect.value;
          const res = await api('/me', {
            method: 'PUT',
            body: { defaultGraphRange: selectedRange },
          });
          setMe(res.user);
          setRange(selectedRange);
          localStorage.setItem(GRAPH_RANGE_STORAGE_KEY, selectedRange);
          toast('Standard-Zeitraum für Graphen gespeichert.');
        } catch (ex) {
          graphRangeSaveErr.textContent = ex.message;
        }
      },
    },
    h('h2', {}, 'Standard-Zeitraum für Graphen & Messverlauf'),
    h(
      'p',
      { class: 'muted', style: 'margin:0' },
      'Lege fest, welcher Zeitraum beim Öffnen eines Aquariums standardmäßig in den Verlaufsgraphen und Messwert-Tabellen angezeigt werden soll (Standard: 3 Monate).'
    ),
    h('div', { class: 'field' }, h('label', {}, 'Bevorzugter Standard-Zeitraum'), graphRangeSelect),
    graphRangeSaveErr,
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Standard-Zeitraum speichern'))
  );

  // Push-Benachrichtigungen & Timer
  const pushCard = notificationsCard(() => viewProfile());

  // Einladungs-Sektion (für Benutzer, wenn Modus "Einladung (Offen)" aktiv oder Admin)
  let invitationCard = null;
  if (currentMe.canInvite) {
    const invErr = h('p', { class: 'error', role: 'alert' });
    const maxDays = Number(currentMe.userCodeMaxDays) || 7;

    const inpCodeDays = h(
      'select',
      { style: 'max-width:160px;' },
      h('option', { value: String(maxDays), selected: true }, `${maxDays} Tage (Standard)`),
      maxDays > 3 ? h('option', { value: '3' }, '3 Tage') : null,
      maxDays > 1 ? h('option', { value: '1' }, '1 Tag') : null
    );
    const inpCodeNote = h('input', {
      placeholder: 'Optionale Notiz (z. B. Für Alex)',
      maxlength: '200',
      style: 'max-width:240px;',
    });

    const inpMailTo = h('input', {
      type: 'email',
      placeholder: 'freund@example.com',
      maxlength: '120',
      style: 'max-width:260px;',
    });
    const inpMailNote = h('input', {
      placeholder: 'Optionale Notiz',
      maxlength: '200',
      style: 'max-width:200px;',
    });

    const invTableBody = h('tbody');
    const loadUserInvitations = async () => {
      try {
        const res = await api('/me/invitations');
        const list = res.invitations || [];
        if (!list.length) {
          invTableBody.replaceChildren(
            h(
              'tr',
              {},
              h(
                'td',
                { colspan: '6', class: 'muted', style: 'text-align:center; padding:1.2rem;' },
                'Du hast noch keine Einladungen erstellt.'
              )
            )
          );
          return;
        }

        const baseUrl = location.origin + location.pathname;
        const rows = list.map((inv) => {
          let statusBadge = h('span', { class: 'chip ok' }, '✓ Aktiv');
          if (inv.status === 'exhausted')
            statusBadge = h('span', { class: 'chip none' }, 'Eingelöst');
          else if (inv.status === 'expired')
            statusBadge = h('span', { class: 'chip warn' }, 'Abgelaufen');

          const inviteLink = `${baseUrl}#/register?invite=${encodeURIComponent(inv.code)}${
            inv.email ? `&email=${encodeURIComponent(inv.email)}` : ''
          }`;

          const btnCopy = h(
            'button',
            {
              class: 'btn small ghost',
              type: 'button',
              title: 'Einladungslink kopieren',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink);
                  toast('Einladungslink in Zwischenablage kopiert!');
                } catch (e) {
                  prompt('Einladungslink kopieren:', inviteLink);
                }
              },
            },
            '📋 Link kopieren'
          );

          const btnDel = h(
            'button',
            {
              class: 'btn small danger',
              type: 'button',
              onclick: async () => {
                if (!confirm('Diese Einladung wirklich löschen/widerrufen?')) return;
                try {
                  await api(`/me/invitations/${inv.id}`, { method: 'DELETE' });
                  toast('Einladung gelöscht.');
                  await loadUserInvitations();
                } catch (ex) {
                  toast(ex.message);
                }
              },
            },
            'Löschen'
          );

          return h(
            'tr',
            {},
            h(
              'td',
              {},
              h('strong', { style: 'font-family:monospace; font-size:1.05rem;' }, inv.code),
              inv.email
                ? h('div', { class: 'muted', style: 'font-size:.82rem;' }, `E-Mail: ${inv.email}`)
                : null
            ),
            h('td', {}, inv.type === 'mail' ? 'E-Mail' : 'Code'),
            h('td', {}, `${inv.usedCount} / ${inv.maxUses || 1}`),
            h('td', {}, fmtDate(inv.expiresAt)),
            h('td', {}, statusBadge),
            h('td', {}, h('div', { class: 'row', style: 'gap:.35rem;' }, btnCopy, btnDel))
          );
        });
        invTableBody.replaceChildren(...rows);
      } catch (e) {
        invTableBody.replaceChildren(
          h('tr', {}, h('td', { colspan: '6', class: 'error' }, e.message))
        );
      }
    };

    const btnCreateCode = h(
      'button',
      {
        class: 'btn small',
        type: 'button',
        onclick: async () => {
          invErr.textContent = '';
          try {
            const res = await api('/me/invitations', {
              method: 'POST',
              body: {
                type: 'code',
                days: Number(inpCodeDays.value) || maxDays,
                note: inpCodeNote.value.trim() || undefined,
              },
            });
            inpCodeNote.value = '';
            toast(res.message || 'Einladungscode erstellt!');
            await loadUserInvitations();
          } catch (ex) {
            invErr.textContent = ex.message;
          }
        },
      },
      '➕ Code generieren'
    );

    const btnSendMail = h(
      'button',
      {
        class: 'btn small',
        type: 'button',
        onclick: async () => {
          invErr.textContent = '';
          if (!inpMailTo.value.trim()) {
            invErr.textContent = 'Bitte gib eine Empfänger-E-Mail-Adresse ein.';
            return;
          }
          try {
            const res = await api('/me/invitations', {
              method: 'POST',
              body: {
                type: 'mail',
                email: inpMailTo.value.trim(),
                days: 14,
                note: inpMailNote.value.trim() || undefined,
              },
            });
            inpMailTo.value = '';
            inpMailNote.value = '';
            toast(res.message || 'Einladungs-E-Mail versendet!');
            await loadUserInvitations();
          } catch (ex) {
            invErr.textContent = ex.message;
          }
        },
      },
      '✉️ Einladungs-Mail senden'
    );

    loadUserInvitations();

    invitationCard = h(
      'div',
      { class: 'card stack' },
      h('h2', {}, '💌 Freunde einladen'),
      h(
        'p',
        { class: 'muted', style: 'margin:0;' },
        'Erstelle einen Registrierungscode oder versende eine Einladungs-E-Mail, um Freunde zum Aquarium-Logbuch einzuladen.'
      ),
      h(
        'div',
        { class: 'grid2', style: 'gap:1rem; align-items:start;' },
        h(
          'div',
          {
            class: 'card stack',
            style: 'background:var(--paper); border:1px solid var(--line);',
          },
          h('h3', { style: 'margin:0 0 .25rem 0;' }, '🔑 Registrierungscode erstellen'),
          h(
            'p',
            { class: 'muted', style: 'margin:0; font-size:.85rem;' },
            `Gültig für maximal ${maxDays} Tage. Kann 1-mal eingelöst werden.`
          ),
          h('div', { class: 'field' }, h('label', {}, 'Gültigkeitsdauer'), inpCodeDays),
          h('div', { class: 'field' }, h('label', {}, 'Notiz (optional)'), inpCodeNote),
          h('div', {}, btnCreateCode)
        ),
        h(
          'div',
          {
            class: 'card stack',
            style: 'background:var(--paper); border:1px solid var(--line);',
          },
          h('h3', { style: 'margin:0 0 .25rem 0;' }, '✉️ Per E-Mail einladen'),
          h(
            'p',
            { class: 'muted', style: 'margin:0; font-size:.85rem;' },
            'Versendet eine E-Mail mit Registrierungslink. Gültig für maximal 14 Tage.'
          ),
          h('div', { class: 'field' }, h('label', {}, 'Empfänger-E-Mail'), inpMailTo),
          h('div', { class: 'field' }, h('label', {}, 'Notiz (optional)'), inpMailNote),
          h('div', {}, btnSendMail)
        )
      ),
      invErr,
      h('h3', { style: 'margin:.5rem 0 0 0;' }, 'Meine erstellten Einladungen'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          {},
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, 'Code / Empfänger'),
              h('th', {}, 'Typ'),
              h('th', {}, 'Verwendung'),
              h('th', {}, 'Gültig bis'),
              h('th', {}, 'Status'),
              h('th', {}, 'Aktionen')
            )
          ),
          invTableBody
        )
      )
    );
  }

  // Gefahrenbereich: Konto löschen
  let deleteAccountCard = null;
  if (!currentMe.isAdmin) {
    const btnDeleteAccount = h(
      'button',
      {
        class: 'btn danger',
        type: 'button',
        onclick: () => confirmDeleteAccountDialog(currentMe),
      },
      '🗑️ Konto löschen...'
    );

    deleteAccountCard = h(
      'div',
      { class: 'card stack danger-zone' },
      h('h2', { style: 'color: var(--coral); margin:0;' }, 'Gefahrenbereich / Konto löschen'),
      h(
        'p',
        { style: 'margin:0;' },
        'Möchtest du dein Benutzerkonto löschen? Dabei werden alle deine Aquarien, Messreihen, Fotos, Alarme, Pflegemaßnahmen und Freigaben unwiderruflich und dauerhaft entfernt.'
      ),
      h(
        'p',
        { class: 'muted', style: 'margin:0; font-size:.9rem;' },
        'Aus Sicherheitsgründen musst du die Löschung hier bestätigen und erhältst anschließend eine Bestätigungs-E-Mail mit einem Freigabelink.'
      ),
      h('div', { class: 'row' }, btnDeleteAccount)
    );
  }

  mount(
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row between' },
        h(
          'div',
          {},
          h('a', { href: '#/', class: 'muted' }, '‹ Zurück zur Übersicht'),
          h('h1', { style: 'margin-top:.3rem' }, 'Mein Profil')
        )
      ),
      avatarCard,
      profileForm,
      languageCard,
      themeCard,
      aiCard,
      graphRangeCard,
      invitationCard,
      pushCard,
      testSuiteCard,
      passwordCard,
      oidcCard,
      deleteAccountCard
    )
  );
}

export function confirmDeleteAccountDialog(me) {
  const dlg = h('dialog', { class: 'stack' });
  const err = h('p', { class: 'error', role: 'alert' });
  const statusMsg = h('div', { class: 'compat-box ok', style: 'display:none;' });

  let passInput = null;
  if (me.hasPassword) {
    passInput = h('input', {
      type: 'password',
      required: true,
      placeholder: 'Aktuelles Passwort eingeben',
    });
  }

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          const body = {};
          if (passInput) body.password = passInput.value;
          const res = await api('/me/delete-request', { method: 'POST', body });
          form.style.display = 'none';
          statusMsg.style.display = 'block';
          statusMsg.replaceChildren(
            h('h3', { style: 'margin:0 0 .5rem 0;' }, '✉️ Bestätigungs-E-Mail versendet!'),
            h('p', { style: 'margin:0;' }, res.message),
            h(
              'div',
              { class: 'row', style: 'margin-top:1rem;' },
              h(
                'button',
                {
                  class: 'btn',
                  type: 'button',
                  onclick: () => {
                    dlg.close();
                  },
                },
                'Verstanden'
              )
            )
          );
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
    h('h2', { style: 'color: var(--coral); margin:0;' }, 'Konto wirklich löschen?'),
    h(
      'div',
      { class: 'compat-box danger' },
      h('p', { style: 'margin:0; font-weight:600;' }, '⚠️ Diese Aktion kann nicht rückgängig gemacht werden!'),
      h(
        'ul',
        { style: 'margin:.5rem 0 0 1.2rem; padding:0; font-size:.9rem; line-height:1.5;' },
        h('li', {}, 'Dein Benutzerkonto wird dauerhaft gelöscht.'),
        h(
          'li',
          {},
          'Alle deine Aquarien, Messwerte, Alarme und Pflegemaßnahmen werden entfernt.'
        ),
        h('li', {}, 'Alle hochgeladenen Fotos werden von den Servern gelöscht.'),
        h('li', {}, 'Bestehende Freigaben für andere Benutzer werden aufgelöst.')
      )
    ),
    h(
      'p',
      {},
      `Um die Löschung zu starten, senden wir eine Bestätigungs-E-Mail an `,
      h('strong', {}, me.email || 'deine E-Mail-Adresse'),
      `.`
    ),
    passInput
      ? h(
          'div',
          { class: 'field' },
          h('label', {}, 'Zur Bestätigung bitte dein aktuelles Passwort eingeben:'),
          passInput
        )
      : null,
    err,
    h(
      'div',
      { class: 'row between', style: 'margin-top:.5rem;' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
      h('button', { class: 'btn danger', type: 'submit' }, 'Bestätigungs-E-Mail anfordern')
    )
  );

  dlg.replaceChildren(form, statusMsg);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (passInput) passInput.focus();
}
