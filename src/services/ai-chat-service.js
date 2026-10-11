'use strict';
const db = require('../db');
const cfg = require('../../config');
const {
  DEFAULT_AI_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_BASE_URL,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  CLAUDE_API_KEY,
  CLAUDE_MODEL,
} = require('../config/env');

const DEFAULT_OPENAI_MODEL = OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = GEMINI_MODEL || 'gemini-2.5-flash';
const DEFAULT_CLAUDE_MODEL = CLAUDE_MODEL || 'claude-3-5-haiku-20241022';
const OPENAI_URL_BASE = (OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  CLAUDE: 'claude',
};

function formatValue(p, val) {
  if (val == null || Number.isNaN(val)) return '–';
  const decimals = p?.decimals != null ? p.decimals : 1;
  return Number(val).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Erstellt den strukturierten Kontext und System-Prompt für ein Aquarium.
 */
async function buildAquariumSystemPrompt(aquariumId, customDb = null) {
  const database = customDb || db;
  const aq = await database.aquariums.findById(aquariumId);
  if (!aq) {
    throw new Error('Aquarium nicht gefunden.');
  }

  // Besatz abrufen
  const stockRows = await database.stock.listForAquarium(aquariumId);
  const stockDetails = stockRows.map((s) => {
    const sp = cfg.speciesService.findSpeciesByName(s.species) || cfg.speciesService.getSpeciesById(s.species);
    return {
      name: s.name || s.species,
      species: s.species,
      scientificName: sp?.scientificName || null,
      category: sp?.category || 'Allgemein',
      count: s.count || 1,
      profile: s.profile || 'allgemein',
      temp: sp?.temp || null,
      ph: sp?.ph || null,
      gh: sp?.gh || null,
      kh: sp?.kh || null,
      minVolumeL: sp?.minVolumeL || null,
      socialType: sp?.socialType || null,
      minGroupCount: sp?.minGroupCount || 1,
      territorial: sp?.territorial || null,
      tags: sp?.tags || [],
      decorHints: sp?.decorHints || null,
      behaviorNotes: sp?.behaviorNotes || null,
    };
  });

  // Besatz-Verträglichkeitsanalyse
  let compatibility = null;
  try {
    compatibility = cfg.speciesService.analyzeStockCompatibility(aq, stockRows);
  } catch (e) {
    compatibility = null;
  }

  // Profile und Grenzwerte berechnen
  const profileKeys = stockRows.map((s) => s.profile || 'allgemein');
  const { thresholds } = cfg.thresholdsFor(aq.water_type, profileKeys);

  // Letzte 10 Messungen abrufen
  const measurements = await database.measurements.listForAquarium(aquariumId, { all: true, limit: 10 });

  // Letzte Wartungsarbeiten (letzte 60 Tage)
  let maintenanceLogs = [];
  try {
    maintenanceLogs = await database.maintenance.listForAquarium(aquariumId, { days: 60 });
  } catch (e) {
    maintenanceLogs = [];
  }

  // Parameter-Definitionen
  const allParams = cfg.suiteService ? cfg.suiteService.getAllKnownParameters() : cfg.PARAMETERS;
  const paramMap = new Map((allParams || []).map((p) => [p.key, p]));

  // 1. Beckendaten-Text
  let contextText = `Du bist ein erfahrener, hochkompetenter Aquaristik-Experte und persönlicher KI-Assistent für das Aquarium „${aq.name}“.\n`;
  contextText += `Deine Aufgabe ist es, Fragen zum Becken, den Bewohnern, der Wasserchemie, Technik, Pflege, Düngung und Fütterung präzise, fundiert und praxisnah zu beantworten.\n`;
  contextText += `Beziehe dich bei allen Antworten immer direkt auf die tatsächlichen Gegebenheiten, Werte und Tiere dieses spezifischen Aquariums.\n\n`;

  contextText += `=== 1. BECKENDATEN ===\n`;
  contextText += `- Name: ${aq.name}\n`;
  contextText += `- Beckentyp: ${aq.water_type === 'salt' ? 'Meerwasser' : 'Süßwasser'}\n`;
  contextText += `- Volumen: ${aq.volume_l ? `${aq.volume_l} Liter` : 'Nicht angegeben'}\n`;
  if (aq.motto) contextText += `- Motto / Biotop-Stil: ${aq.motto}\n`;
  if (aq.description) contextText += `- Beschreibung / Einrichtung: ${aq.description}\n`;
  if (aq.notes) contextText += `- Notizen: ${aq.notes}\n`;
  if (aq.measure_cycle_interval) {
    contextText += `- Messintervall: Alle ${aq.measure_cycle_interval} ${aq.measure_cycle_unit === 'weeks' ? 'Wochen' : 'Tage'}\n`;
  }
  if (aq.fertilize_cycle_interval) {
    contextText += `- Düngeintervall: Alle ${aq.fertilize_cycle_interval} ${aq.fertilize_cycle_unit === 'weeks' ? 'Wochen' : 'Tage'}\n`;
  }

  // 2. Besatz
  contextText += `\n=== 2. BESATZ & BEWOHNER (${stockDetails.reduce((a, b) => a + b.count, 0)} Individuen in ${stockDetails.length} Arten/Gruppen) ===\n`;
  if (stockDetails.length === 0) {
    contextText += `Noch kein Besatz eingetragen.\n`;
  } else {
    for (const s of stockDetails) {
      let line = `- ${s.count}x ${s.name}`;
      if (s.scientificName) line += ` (${s.scientificName})`;
      line += ` [Kategorie: ${s.category}, Profil: ${s.profile}]`;
      const reqs = [];
      if (s.temp?.min != null) reqs.push(`Temp: ${s.temp.min}–${s.temp.max}°C`);
      if (s.ph?.min != null) reqs.push(`pH: ${s.ph.min}–${s.ph.max}`);
      if (s.gh?.min != null) reqs.push(`GH: ${s.gh.min}–${s.gh.max}°dH`);
      if (s.kh?.min != null) reqs.push(`KH: ${s.kh.min}–${s.kh.max}°dH`);
      if (reqs.length) line += ` (Bedarf: ${reqs.join(', ')})`;
      contextText += `${line}\n`;
    }
  }

  if (compatibility) {
    if (compatibility.issues && compatibility.issues.length > 0) {
      contextText += `\n[Bekannte Besatzkonflikte / Unverträglichkeiten]:\n`;
      for (const iss of compatibility.issues) {
        contextText += `⚠️ [KRITISCH] ${iss.title}: ${iss.message}\n`;
      }
    }
    if (compatibility.warnings && compatibility.warnings.length > 0) {
      contextText += `\n[Besatz-Warnhinweise]:\n`;
      for (const w of compatibility.warnings) {
        contextText += `⚡ [WARNUNG] ${w.title}: ${w.message}\n`;
      }
    }
    if (compatibility.decorHints && compatibility.decorHints.length > 0) {
      contextText += `\n[Besondere Einrichtungsanforderungen der Bewohner]:\n`;
      for (const d of compatibility.decorHints) {
        contextText += `💡 ${d}\n`;
      }
    }
  }

  // 3. Letzte 10 Messwerte
  contextText += `\n=== 3. DIE LETZTEN 10 MESSUNGEN (Vom neuesten zum ältesten) ===\n`;
  if (measurements.length === 0) {
    contextText += `Noch keine Messungen im System protokolliert.\n`;
  } else {
    measurements.forEach((m, idx) => {
      const dt = new Date(m.measured_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
      const valEntries = Object.entries(m.values || {});
      const formattedVals = valEntries.map(([k, v]) => {
        const p = paramMap.get(k) || { key: k, name: k, unit: '', decimals: 1 };
        const range = thresholds ? thresholds[k] : null;
        const status = cfg.evaluate(range, v);
        const statusMark = status === 'crit' ? ' ❌ [KRITISCH]' : (status === 'warn' ? ' ⚠️ [AUFFÄLLIG]' : ' ✓ [OK]');
        return `${p.name}: ${formatValue(p, v)} ${p.unit}${statusMark}`;
      });

      contextText += `\nMessung #${idx + 1} (${dt}):\n`;
      if (formattedVals.length > 0) {
        contextText += `  Werte: ${formattedVals.join(' | ')}\n`;
      } else {
        contextText += `  (Keine Parameter gemessen)\n`;
      }
      if (m.note) {
        contextText += `  Notiz: ${m.note}\n`;
      }
    });
  }

  // 4. Letzte Wartungsarbeiten
  if (maintenanceLogs.length > 0) {
    contextText += `\n=== 4. LETZTE WARTUNGSMASSNAHMEN (Letzte 60 Tage) ===\n`;
    maintenanceLogs.slice(0, 8).forEach((ml) => {
      const dt = new Date(ml.logged_at).toLocaleDateString('de-DE');
      let line = `- ${dt}: ${ml.type}`;
      if (ml.percentage) line += ` (${ml.percentage} %)`;
      if (ml.details) line += ` - ${ml.details}`;
      if (ml.note) line += ` (Notiz: ${ml.note})`;
      contextText += `${line}\n`;
    });
  }

  // 5. Verhaltensregeln
  contextText += `\n=== 5. ANWEISUNGEN FÜR DEINE ANTWORTEN ===\n`;
  contextText += `1. Antworte auf Deutsch, freundlich, empathisch und lösungsorientiert.\n`;
  contextText += `2. Analysiere bei Fragen zu Wasserwerten, Algen oder Fischgesundheit stets die Messwerte (vor allem pH, Temperatur, KH/GH, NO2, NO3, PO4, NH4) und weise proaktiv auf Ausreißer oder Gefahren hin.\n`;
  contextText += `3. Gib konkrete Handlungsempfehlungen (z. B. Wasserwechsel-Menge, Temperaturkorrektur, Filtereinstellung, Fütterungsanpassung).\n`;
  contextText += `4. Verwende saubere Markdown-Formatierung (Absätze, Fettschrift, Aufzählungslisten).\n`;
  contextText += `5. Wenn der Benutzer allgemeine Aquaristikfragen stellt, beziehe die Antwort dennoch passend auf sein Beckenvolumen und seinen Besatz.\n`;

  return {
    systemPrompt: contextText,
    aquarium: aq,
    stockCount: stockDetails.length,
    measurementsCount: measurements.length,
  };
}

/**
 * OpenAI / ChatGPT Aufruf
 */
async function callOpenAi({ apiKey, model, systemPrompt, messages = [], message = null, stream = false }) {
  const chatMessages = [{ role: 'system', content: systemPrompt }];

  if (Array.isArray(messages) && messages.length > 0) {
    for (const m of messages) {
      if (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) {
        chatMessages.push({
          role: m.role,
          content: m.content.slice(0, 8000),
        });
      }
    }
  }

  if (message && typeof message === 'string' && message.trim()) {
    chatMessages.push({
      role: 'user',
      content: message.trim().slice(0, 8000),
    });
  }

  const payload = {
    model: model || DEFAULT_OPENAI_MODEL,
    messages: chatMessages,
    temperature: 0.7,
    max_tokens: 1500,
    stream: Boolean(stream),
  };

  const url = `${OPENAI_URL_BASE}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const openAiError = errorData?.error?.message || response.statusText;
    let friendlyMessage = `OpenAI API Fehler (${response.status}): ${openAiError}`;

    if (response.status === 401) {
      friendlyMessage = 'Der hinterlegte OpenAI API-Schlüssel ist ungültig oder abgelaufen. Bitte prüfe den Schlüssel in deinem Profil.';
    } else if (response.status === 429) {
      friendlyMessage = 'OpenAI Rate-Limit oder Kontingentlimit erreicht. Bitte prüfe dein OpenAI-Guthaben oder versuche es in wenigen Momenten erneut.';
    } else if (response.status === 404) {
      friendlyMessage = `Das ausgewählte Modell „${model}“ wurde nicht gefunden oder ist für diesen API-Schlüssel nicht freigeschaltet.`;
    }

    const err = new Error(friendlyMessage);
    err.status = response.status;
    err.apiError = errorData;
    throw err;
  }

  if (stream) {
    return { stream: response.body, model: model || DEFAULT_OPENAI_MODEL, provider: 'openai' };
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || '';

  return {
    reply,
    model: data.model || model || DEFAULT_OPENAI_MODEL,
    provider: 'openai',
    usage: data.usage || null,
  };
}

/**
 * Google Gemini Aufruf (Google AI Studio API)
 */
async function callGemini({ apiKey, model, systemPrompt, messages = [], message = null }) {
  const chosenModel = model || DEFAULT_GEMINI_MODEL;
  const contents = [];

  if (Array.isArray(messages) && messages.length > 0) {
    for (const m of messages) {
      if (m && typeof m.content === 'string') {
        const role = m.role === 'assistant' ? 'model' : 'user';
        contents.push({
          role,
          parts: [{ text: m.content.slice(0, 8000) }],
        });
      }
    }
  }

  if (message && typeof message === 'string' && message.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: message.trim().slice(0, 8000) }],
    });
  }

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const geminiError = errorData?.error?.message || response.statusText;
    let friendlyMessage = `Google Gemini API Fehler (${response.status}): ${geminiError}`;

    if (response.status === 400 && String(geminiError).toLowerCase().includes('api key')) {
      friendlyMessage = 'Der hinterlegte Gemini API-Schlüssel ist ungültig. Bitte prüfe den Schlüssel in deinem Profil.';
    } else if (response.status === 403) {
      friendlyMessage = 'Zugriff verweigert. Bitte prüfe die Berechtigungen deines Google Gemini API-Keys.';
    } else if (response.status === 429) {
      friendlyMessage = 'Google Gemini Rate-Limit oder Kontingentlimit erreicht. Bitte versuche es in wenigen Momenten erneut.';
    } else if (response.status === 404) {
      friendlyMessage = `Das ausgewählte Gemini-Modell „${chosenModel}“ wurde nicht gefunden oder ist nicht verfügbar.`;
    }

    const err = new Error(friendlyMessage);
    err.status = response.status;
    err.apiError = errorData;
    throw err;
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const reply = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

  return {
    reply,
    model: chosenModel,
    provider: 'gemini',
    usage: data.usageMetadata || null,
  };
}

/**
 * Anthropic Claude Aufruf
 */
async function callClaude({ apiKey, model, systemPrompt, messages = [], message = null }) {
  const chosenModel = model || DEFAULT_CLAUDE_MODEL;
  const chatMessages = [];

  if (Array.isArray(messages) && messages.length > 0) {
    for (const m of messages) {
      if (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) {
        chatMessages.push({
          role: m.role,
          content: m.content.slice(0, 8000),
        });
      }
    }
  }

  if (message && typeof message === 'string' && message.trim()) {
    chatMessages.push({
      role: 'user',
      content: message.trim().slice(0, 8000),
    });
  }

  const payload = {
    model: chosenModel,
    system: systemPrompt,
    messages: chatMessages,
    max_tokens: 1500,
    temperature: 0.7,
  };

  const url = 'https://api.anthropic.com/v1/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const claudeError = errorData?.error?.message || response.statusText;
    let friendlyMessage = `Anthropic Claude API Fehler (${response.status}): ${claudeError}`;

    if (response.status === 401) {
      friendlyMessage = 'Der hinterlegte Anthropic Claude API-Schlüssel ist ungültig oder abgelaufen. Bitte prüfe den Schlüssel in deinem Profil.';
    } else if (response.status === 429) {
      friendlyMessage = 'Claude Rate-Limit erreicht. Bitte prüfe dein Anthropic-Guthaben oder versuche es in wenigen Momenten erneut.';
    } else if (response.status === 404) {
      friendlyMessage = `Das ausgewählte Claude-Modell „${chosenModel}“ wurde nicht gefunden oder ist nicht freigeschaltet.`;
    }

    const err = new Error(friendlyMessage);
    err.status = response.status;
    err.apiError = errorData;
    throw err;
  }

  const data = await response.json();
  const reply = data.content?.map((c) => c.text || '').join('') || '';

  return {
    reply,
    model: data.model || chosenModel,
    provider: 'claude',
    usage: data.usage || null,
  };
}

/**
 * Löst den aktiven Provider, Key und Modell für den Chat auf.
 */
function resolveProviderAndConfig(user, requestedProvider = null) {
  let provider = (requestedProvider || user?.ai_provider || '').toLowerCase().trim();

  // Wenn kein Provider gewählt ist, anhand vorhandener Keys automatisch bestimmen
  if (!provider || !['openai', 'gemini', 'claude'].includes(provider)) {
    if (user?.openai_api_key || (!user?.gemini_api_key && !user?.claude_api_key && OPENAI_API_KEY)) {
      provider = 'openai';
    } else if (user?.gemini_api_key || (!user?.claude_api_key && GEMINI_API_KEY)) {
      provider = 'gemini';
    } else if (user?.claude_api_key || CLAUDE_API_KEY) {
      provider = 'claude';
    } else {
      provider = DEFAULT_AI_PROVIDER || 'openai';
    }
  }

  let apiKey = '';
  let model = '';

  if (provider === 'gemini') {
    apiKey = (user?.gemini_api_key || GEMINI_API_KEY || '').trim();
    model = (user?.gemini_model || GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  } else if (provider === 'claude') {
    apiKey = (user?.claude_api_key || CLAUDE_API_KEY || '').trim();
    model = (user?.claude_model || CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL).trim();
  } else {
    provider = 'openai';
    apiKey = (user?.openai_api_key || OPENAI_API_KEY || '').trim();
    model = (user?.openai_model || OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();
  }

  return { provider, apiKey, model };
}

/**
 * Führt einen Chat-Request gegen den konfigurierten KI-Anbieter (OpenAI, Gemini, Claude) aus.
 */
async function chatWithAquarium({
  aquariumId,
  user,
  messages = [],
  message = null,
  provider = null,
  stream = false,
  customDb = null,
}) {
  const database = customDb || db;
  const dbUser = user?.id ? await database.users.findById(user.id) : null;

  const resolved = resolveProviderAndConfig(dbUser, provider);
  const activeProvider = resolved.provider;
  const apiKey = resolved.apiKey;
  const model = resolved.model;

  if (!apiKey) {
    const providerNames = {
      openai: 'OpenAI / ChatGPT',
      gemini: 'Google Gemini',
      claude: 'Anthropic Claude',
    };
    const pName = providerNames[activeProvider] || activeProvider;
    const err = new Error(`Kein API-Schlüssel für ${pName} hinterlegt. Bitte hinterlege deinen persönlichen API-Key im Benutzerprofil unter „Mein Profil -> KI-Assistent & Sprachmodelle“.`);
    err.code = 'NO_API_KEY';
    err.provider = activeProvider;
    err.status = 400;
    throw err;
  }

  // System-Prompt und Beckenkontext generieren
  const { systemPrompt } = await buildAquariumSystemPrompt(aquariumId, database);

  // Sicherstellen, dass mindestens eine User-Nachricht existiert
  const hasUserMsg = (message && typeof message === 'string' && message.trim()) ||
    (Array.isArray(messages) && messages.some((m) => m && m.role === 'user' && m.content && m.content.trim()));

  if (!hasUserMsg) {
    throw new Error('Keine Benutzernachricht übergeben.');
  }

  if (activeProvider === 'gemini') {
    return await callGemini({ apiKey, model, systemPrompt, messages, message });
  } else if (activeProvider === 'claude') {
    return await callClaude({ apiKey, model, systemPrompt, messages, message });
  } else {
    return await callOpenAi({ apiKey, model, systemPrompt, messages, message, stream });
  }
}

/**
 * Prüft die Gültigkeit eines OpenAI API-Keys mit einer minimalen Testanfrage.
 */
async function testOpenAiConnection(apiKey, model = DEFAULT_OPENAI_MODEL) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen OpenAI API-Schlüssel ein.');
  }

  const url = `${OPENAI_URL_BASE}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_MODEL,
      messages: [{ role: 'user', content: 'Antworte nur mit dem Wort OK.' }],
      max_tokens: 5,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const openAiError = errorData?.error?.message || response.statusText;
    if (response.status === 401) {
      throw new Error('Ungültiger OpenAI API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    if (response.status === 429) {
      throw new Error('OpenAI API-Schlüssel ist gültig, aber das Kontingent ist erschöpft (Quota Exceeded / Rate Limit).');
    }
    throw new Error(`OpenAI Verbindungstest fehlgeschlagen (${response.status}): ${openAiError}`);
  }

  const data = await response.json();
  return {
    ok: true,
    provider: 'openai',
    model: data.model || model,
    message: 'Verbindung zu OpenAI erfolgreich hergestellt!',
  };
}

/**
 * Prüft die Gültigkeit eines Google Gemini API-Keys mit einer Testanfrage.
 */
async function testGeminiConnection(apiKey, model = DEFAULT_GEMINI_MODEL) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen Google Gemini API-Schlüssel ein.');
  }

  const chosenModel = model || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Antworte nur mit dem Wort OK.' }] }],
      generationConfig: { maxOutputTokens: 5 },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const geminiError = errorData?.error?.message || response.statusText;
    if (response.status === 400 && String(geminiError).toLowerCase().includes('api key')) {
      throw new Error('Ungültiger Google Gemini API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    if (response.status === 429) {
      throw new Error('Gemini Rate-Limit erreicht. Bitte versuche es in wenigen Momenten erneut.');
    }
    throw new Error(`Google Gemini Verbindungstest fehlgeschlagen (${response.status}): ${geminiError}`);
  }

  return {
    ok: true,
    provider: 'gemini',
    model: chosenModel,
    message: 'Verbindung zu Google Gemini erfolgreich hergestellt!',
  };
}

/**
 * Prüft die Gültigkeit eines Anthropic Claude API-Keys mit einer Testanfrage.
 */
async function testClaudeConnection(apiKey, model = DEFAULT_CLAUDE_MODEL) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen Anthropic Claude API-Schlüssel ein.');
  }

  const chosenModel = model || DEFAULT_CLAUDE_MODEL;
  const url = 'https://api.anthropic.com/v1/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [{ role: 'user', content: 'Antworte nur mit dem Wort OK.' }],
      max_tokens: 5,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const claudeError = errorData?.error?.message || response.statusText;
    if (response.status === 401) {
      throw new Error('Ungültiger Anthropic Claude API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    if (response.status === 429) {
      throw new Error('Anthropic Claude Rate-Limit oder Guthabenlimit erreicht.');
    }
    throw new Error(`Anthropic Claude Verbindungstest fehlgeschlagen (${response.status}): ${claudeError}`);
  }

  const data = await response.json();
  return {
    ok: true,
    provider: 'claude',
    model: data.model || chosenModel,
    message: 'Verbindung zu Anthropic Claude erfolgreich hergestellt!',
  };
}

/**
 * Universeller KI-Verbindungstest
 */
async function testAiConnection({ provider, apiKey, model }) {
  const p = (provider || 'openai').toLowerCase().trim();
  if (p === 'gemini') {
    return await testGeminiConnection(apiKey, model);
  } else if (p === 'claude') {
    return await testClaudeConnection(apiKey, model);
  } else {
    return await testOpenAiConnection(apiKey, model);
  }
}

module.exports = {
  buildAquariumSystemPrompt,
  chatWithAquarium,
  testOpenAiConnection,
  testGeminiConnection,
  testClaudeConnection,
  testAiConnection,
  resolveProviderAndConfig,
  AI_PROVIDERS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_CLAUDE_MODEL,
};
