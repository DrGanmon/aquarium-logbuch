'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./helpers/env');
const { buildAquariumSystemPrompt, testOpenAiConnection } = require('../src/services/ai-chat-service');

test('KI-Chat Service: System-Prompt Generierung mit Beckendaten, Besatz und 10 Messwerten', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('ai_tester', 'password123', 'ai@example.com');

  // Aquarium anlegen
  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Amazonas Biotop 240',
      volume_l: 240,
      water_type: 'fresh',
      motto: 'Schwarzwasser Südamerika',
      description: 'Dicht bepflanzt mit Wurzeln und Sandboden.',
      notes: 'CO2-Anlage aktiv mit 20 Blasen/min.',
    },
  });
  assert.strictEqual(aqRes.status, 200);
  const aqId = aqRes.data.id;

  // Besatz hinzufügen
  await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      species: 'Roter Neon',
      count: 15,
      profile: 'amazonas',
    },
  });

  await env.request(`/api/aquariums/${aqId}/stock`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      species: 'Marmorierter Panzerwels',
      count: 6,
      profile: 'allgemein',
    },
  });

  // 12 Messungen hinzufügen (es sollen genau die letzten 10 im Prompt auftauchen)
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.now() - (12 - i) * 86400000).toISOString();
    await env.request(`/api/aquariums/${aqId}/measurements`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        measured_at: d,
        values: {
          ph: 6.8 + (i % 2 === 0 ? 0.2 : 0.0),
          temp: 25.5,
          no2: i === 12 ? 0.02 : 0.0,
          no3: 15 + i,
        },
        note: `Messung Tag ${i}`,
      },
    });
  }

  // Wartungsarbeit hinzufügen
  await env.request(`/api/aquariums/${aqId}/maintenance`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      logged_at: new Date().toISOString(),
      type: 'water_change',
      percentage: 30,
      details: 'Wasserwechsel mit temperiertem Osmosewasser',
    },
  });

  // System-Prompt bauen und prüfen
  const db = require('../src/db');
  const promptData = await buildAquariumSystemPrompt(aqId, db);
  assert.ok(promptData.systemPrompt);
  assert.strictEqual(promptData.aquarium.name, 'Amazonas Biotop 240');
  assert.strictEqual(promptData.stockCount, 2);
  assert.strictEqual(promptData.measurementsCount, 10);

  const prompt = promptData.systemPrompt;
  // Beckendaten
  assert.ok(prompt.includes('Amazonas Biotop 240'));
  assert.ok(prompt.includes('240 Liter'));
  assert.ok(prompt.includes('Süßwasser'));
  assert.ok(prompt.includes('Schwarzwasser Südamerika'));
  assert.ok(prompt.includes('Dicht bepflanzt mit Wurzeln'));
  assert.ok(prompt.includes('CO2-Anlage aktiv'));

  // Besatz
  assert.ok(prompt.includes('Roter Neon'));
  assert.ok(prompt.includes('15x'));
  assert.ok(prompt.includes('Marmorierter Panzerwels'));
  assert.ok(prompt.includes('6x'));

  // Letzte 10 Messwerte
  assert.ok(prompt.includes('DIE LETZTEN 10 MESSUNGEN'));
  assert.ok(prompt.includes('Messung #1'));
  assert.ok(prompt.includes('Messung #10'));
  assert.ok(!prompt.includes('Messung #11')); // Max 10 Messungen
  assert.ok(prompt.includes('pH-Wert:'));
  assert.ok(prompt.includes('Temperatur:'));
  assert.ok(prompt.includes('Nitrit (NO2):'));

  // Wartung
  assert.ok(prompt.includes('Wasserwechsel'));
  assert.ok(prompt.includes('30 %'));
});

test('OpenAI API-Key Profilverwaltung: Speichern, Maskieren, Testen und Löschen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('key_user', 'password123', 'key@example.com');

  // 1. Initialer Zustand
  const meInit = await env.request('/api/me', { headers: { Cookie: user.cookie } });
  assert.strictEqual(meInit.status, 200);
  assert.strictEqual(meInit.data.openaiKeySet, false);
  assert.strictEqual(meInit.data.openaiKeyMasked, null);
  assert.strictEqual(meInit.data.openaiModel, 'gpt-4o-mini');

  // 2. Key und Modell (gpt-6) speichern
  const saveRes = await env.request('/api/me/openai', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      apiKey: 'sk-proj-1234567890abcdefghijklmnopqr',
      model: 'gpt-6',
    },
  });
  assert.strictEqual(saveRes.status, 200);
  assert.strictEqual(saveRes.data.ok, true);
  assert.strictEqual(saveRes.data.user.openaiKeySet, true);
  assert.strictEqual(saveRes.data.user.hasOpenaiKey, true);
  assert.ok(saveRes.data.user.openaiKeyMasked.startsWith('sk-'));
  assert.ok(saveRes.data.user.openaiKeyMasked.endsWith('opqr'));
  assert.strictEqual(saveRes.data.user.openaiModel, 'gpt-6');

  // 3. GET /api/me prüft Persistenz
  const meSaved = await env.request('/api/me', { headers: { Cookie: user.cookie } });
  assert.strictEqual(meSaved.status, 200);
  assert.strictEqual(meSaved.data.openaiKeySet, true);
  assert.strictEqual(meSaved.data.openaiModel, 'gpt-6');

  // 3b. Modell auf gpt-6-mini aktualisieren
  const updateModelRes = await env.request('/api/me/openai', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      model: 'gpt-6-mini',
    },
  });
  assert.strictEqual(updateModelRes.status, 200);
  assert.strictEqual(updateModelRes.data.user.openaiModel, 'gpt-6-mini');

  // 4. Key löschen
  const delRes = await env.request('/api/me/openai', {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delRes.status, 200);
  assert.strictEqual(delRes.data.user.openaiKeySet, false);

  const meDeleted = await env.request('/api/me', { headers: { Cookie: user.cookie } });
  assert.strictEqual(meDeleted.status, 200);
  assert.strictEqual(meDeleted.data.openaiKeySet, false);
  assert.strictEqual(meDeleted.data.openaiKeyMasked, null);
});

test('Google Gemini und Anthropic Claude Profilverwaltung: Speichern, Maskieren und Löschen', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('gemini_claude_user', 'password123', 'gc@example.com');

  // 1. Initialer Zustand
  const meInit = await env.request('/api/me', { headers: { Cookie: user.cookie } });
  assert.strictEqual(meInit.status, 200);
  assert.strictEqual(meInit.data.geminiKeySet, false);
  assert.strictEqual(meInit.data.geminiKeyMasked, null);
  assert.strictEqual(meInit.data.claudeKeySet, false);
  assert.strictEqual(meInit.data.claudeKeyMasked, null);

  // 2. Google Gemini Key und Modell speichern
  const saveGeminiRes = await env.request('/api/me/gemini', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      apiKey: 'AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123456',
      model: 'gemini-2.5-flash',
      setAsActive: true,
    },
  });
  assert.strictEqual(saveGeminiRes.status, 200);
  assert.strictEqual(saveGeminiRes.data.user.geminiKeySet, true);
  assert.strictEqual(saveGeminiRes.data.user.hasGeminiKey, true);
  assert.strictEqual(saveGeminiRes.data.user.aiProvider, 'gemini');
  assert.ok(saveGeminiRes.data.user.geminiKeyMasked.startsWith('AIz'));
  assert.ok(saveGeminiRes.data.user.geminiKeyMasked.endsWith('3456'));

  // 3. Anthropic Claude Key und Modell speichern
  const saveClaudeRes = await env.request('/api/me/claude', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      apiKey: 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz',
      model: 'claude-3-5-sonnet-20241022',
      setAsActive: true,
    },
  });
  assert.strictEqual(saveClaudeRes.status, 200);
  assert.strictEqual(saveClaudeRes.data.user.claudeKeySet, true);
  assert.strictEqual(saveClaudeRes.data.user.hasClaudeKey, true);
  assert.strictEqual(saveClaudeRes.data.user.aiProvider, 'claude');
  assert.strictEqual(saveClaudeRes.data.user.claudeModel, 'claude-3-5-sonnet-20241022');
  assert.ok(saveClaudeRes.data.user.claudeKeyMasked.startsWith('sk-'));

  // 4. Multi-Provider PUT /api/me/ai für Provider-Wechsel
  const switchRes = await env.request('/api/me/ai', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      provider: 'gemini',
    },
  });
  assert.strictEqual(switchRes.status, 200);
  assert.strictEqual(switchRes.data.user.aiProvider, 'gemini');

  // 5. Löschen von Gemini- und Claude-Keys
  const delGemini = await env.request('/api/me/gemini', {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delGemini.status, 200);
  assert.strictEqual(delGemini.data.user.geminiKeySet, false);

  const delClaude = await env.request('/api/me/claude', {
    method: 'DELETE',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(delClaude.status, 200);
  assert.strictEqual(delClaude.data.user.claudeKeySet, false);
});

test('Anthropic Claude Chat Service: Nachrichten-Normalisierung, System-Prompt und API-Header', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('claude_chat_tester', 'password123', 'claude@example.com');

  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Claude Testbecken',
      volume_l: 120,
      water_type: 'fresh',
    },
  });
  const aqId = aqRes.data.id;

  // Claude API-Key speichern
  await env.request('/api/me/claude', {
    method: 'PUT',
    headers: { Cookie: user.cookie },
    body: {
      apiKey: 'sk-ant-test-key-1234567890',
      model: 'claude-3-7-sonnet-20250219',
      setAsActive: true,
    },
  });

  // Mock global.fetch abfangen
  const originalFetch = global.fetch;
  let interceptedRequest = null;

  global.fetch = async (url, options) => {
    if (String(url).includes('api.anthropic.com')) {
      interceptedRequest = {
        url,
        options,
        body: JSON.parse(options.body),
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-7-sonnet-20250219',
          content: [{ type: 'text', text: 'Wasserwerte sehen gut aus!' }],
          usage: { input_tokens: 150, output_tokens: 20 },
        }),
      };
    }
    return originalFetch(url, options);
  };

  try {
    const chatRes = await env.request(`/api/aquariums/${aqId}/chat`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: {
        message: 'Wie sind meine Wasserwerte?',
        messages: [
          { role: 'assistant', content: 'Willkommen!' },
          { role: 'user', content: 'Erste Frage' },
          { role: 'user', content: 'Zusatzfrage' },
        ],
      },
    });

    assert.strictEqual(chatRes.status, 200);
    assert.strictEqual(chatRes.data.ok, true);
    assert.strictEqual(chatRes.data.provider, 'claude');
    assert.strictEqual(chatRes.data.reply, 'Wasserwerte sehen gut aus!');

    // Prüfen, ob Anthropic Vorgaben exakt eingehalten wurden
    assert.ok(interceptedRequest);
    assert.strictEqual(interceptedRequest.options.headers['x-api-key'], 'sk-ant-test-key-1234567890');
    assert.strictEqual(interceptedRequest.options.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(interceptedRequest.body.model, 'claude-3-7-sonnet-20250219');
    assert.ok(interceptedRequest.body.system.includes('Claude Testbecken'));

    // Anthropic-Validierung: Erste Nachricht muss Rolle 'user' sein
    assert.strictEqual(interceptedRequest.body.messages[0].role, 'user');

    // Keine zwei gleichen Rollen hintereinander
    for (let i = 1; i < interceptedRequest.body.messages.length; i++) {
      assert.notStrictEqual(
        interceptedRequest.body.messages[i].role,
        interceptedRequest.body.messages[i - 1].role,
        'Anthropic verbietet aufeinanderfolgende gleiche Rollen'
      );
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('Aquarium Chat API Endpunkte: Kontext-Abruf und Fehler ohne API-Key', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('chat_user', 'password123', 'chat@example.com');

  const aqRes = await env.request('/api/aquariums', {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      name: 'Nano Cube 30',
      volume_l: 30,
      water_type: 'fresh',
    },
  });
  const aqId = aqRes.data.id;

  // 1. Kontext-Endpunkt abrufen
  const ctxRes = await env.request(`/api/aquariums/${aqId}/chat/context`, {
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(ctxRes.status, 200);
  assert.strictEqual(ctxRes.data.ok, true);
  assert.strictEqual(ctxRes.data.aquariumName, 'Nano Cube 30');
  assert.ok(ctxRes.data.systemPrompt.includes('Nano Cube 30'));

  // 2. Chat-Anfrage ohne hinterlegten API-Key schlägt mit 400 fehl
  const chatNoKeyRes = await env.request(`/api/aquariums/${aqId}/chat`, {
    method: 'POST',
    headers: { Cookie: user.cookie },
    body: {
      message: 'Wie geht es meinem Becken?',
    },
  });
  assert.strictEqual(chatNoKeyRes.status, 400);
  assert.strictEqual(chatNoKeyRes.data.code, 'NO_API_KEY');
  assert.ok(chatNoKeyRes.data.error.includes('API-Schlüssel'));
});

test('Dynamische Modellabfrage: Endpunkte für OpenAI, Gemini, Claude und /me/ai/models', async (t) => {
  const env = createTestEnvironment();
  t.after(async () => await env.cleanup());

  const user = await env.createUserAndLogin('model_fetcher', 'password123', 'models@example.com');

  // 1. Ohne Key schlägt der Abruf mit 400 fehl
  const noKeyOpenAi = await env.request('/api/me/openai/models', {
    method: 'POST',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(noKeyOpenAi.status, 400);

  const noKeyGemini = await env.request('/api/me/gemini/models', {
    method: 'POST',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(noKeyGemini.status, 400);

  const noKeyClaude = await env.request('/api/me/claude/models', {
    method: 'POST',
    headers: { Cookie: user.cookie },
  });
  assert.strictEqual(noKeyClaude.status, 400);

  // 2. Mocking für alle drei Provider-Endpunkte
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    const sUrl = String(url);
    if (sUrl.includes('api.openai.com/v1/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          object: 'list',
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-mini', object: 'model' },
            { id: 'gpt-6', object: 'model' },
            { id: 'gpt-6-mini', object: 'model' },
            { id: 'o3-mini', object: 'model' },
            { id: 'text-embedding-3-small', object: 'model' },
            { id: 'dall-e-3', object: 'model' },
          ],
        }),
      };
    }
    if (sUrl.includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            {
              name: 'models/gemini-2.5-flash',
              displayName: 'Gemini 2.5 Flash',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
            },
            {
              name: 'models/gemini-2.5-pro',
              displayName: 'Gemini 2.5 Pro',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/embedding-001',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
      };
    }
    if (sUrl.includes('api.anthropic.com/v1/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'claude-3-7-sonnet-20250219', display_name: 'Claude 3.7 Sonnet', type: 'model' },
            { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', type: 'model' },
            { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku', type: 'model' },
          ],
        }),
      };
    }
    return originalFetch(url, options);
  };

  try {
    // OpenAI Models abrufen
    const openAiRes = await env.request('/api/me/openai/models', {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { apiKey: 'sk-proj-test123456789' },
    });
    assert.strictEqual(openAiRes.status, 200);
    assert.strictEqual(openAiRes.data.ok, true);
    assert.strictEqual(openAiRes.data.provider, 'openai');
    assert.ok(Array.isArray(openAiRes.data.models));
    const openAiModelIds = openAiRes.data.models.map((m) => m.value);
    assert.ok(openAiModelIds.includes('gpt-6'));
    assert.ok(openAiModelIds.includes('gpt-4o'));
    assert.ok(openAiModelIds.includes('o3-mini'));
    // Nicht-Chat-Modelle müssen herausgefiltert worden sein
    assert.ok(!openAiModelIds.includes('text-embedding-3-small'));
    assert.ok(!openAiModelIds.includes('dall-e-3'));

    // Google Gemini Models abrufen
    const geminiRes = await env.request('/api/me/gemini/models', {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { apiKey: 'AIzaSyTest123456789' },
    });
    assert.strictEqual(geminiRes.status, 200);
    assert.strictEqual(geminiRes.data.ok, true);
    assert.strictEqual(geminiRes.data.provider, 'gemini');
    assert.ok(Array.isArray(geminiRes.data.models));
    const geminiModelIds = geminiRes.data.models.map((m) => m.value);
    assert.ok(geminiModelIds.includes('gemini-2.5-flash'));
    assert.ok(geminiModelIds.includes('gemini-2.5-pro'));
    assert.ok(!geminiModelIds.includes('embedding-001'));

    // Anthropic Claude Models abrufen
    const claudeRes = await env.request('/api/me/claude/models', {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { apiKey: 'sk-ant-test123456789' },
    });
    assert.strictEqual(claudeRes.status, 200);
    assert.strictEqual(claudeRes.data.ok, true);
    assert.strictEqual(claudeRes.data.provider, 'claude');
    assert.ok(Array.isArray(claudeRes.data.models));
    const claudeModelIds = claudeRes.data.models.map((m) => m.value);
    assert.ok(claudeModelIds.includes('claude-3-7-sonnet-20250219'));
    assert.ok(claudeModelIds.includes('claude-3-5-haiku-20241022'));

    // Universal /me/ai/models Endpunkt testen
    const aiUnifiedRes = await env.request('/api/me/ai/models', {
      method: 'POST',
      headers: { Cookie: user.cookie },
      body: { provider: 'claude', apiKey: 'sk-ant-test123456789' },
    });
    assert.strictEqual(aiUnifiedRes.status, 200);
    assert.strictEqual(aiUnifiedRes.data.ok, true);
    assert.strictEqual(aiUnifiedRes.data.provider, 'claude');
    assert.strictEqual(aiUnifiedRes.data.models.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});
