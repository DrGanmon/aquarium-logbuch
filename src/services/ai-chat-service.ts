'use strict';
import db = require('../db');
import cfg = require('../../config');
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

const AI_PROVIDERS: Record<string, any> = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  CLAUDE: 'claude',
};

function formatValue(p?: any, val?: any) {
  if (val == null || Number.isNaN(val)) return '–';
  const decimals = p?.decimals != null ? p.decimals : 1;
  return Number(val).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Erstellt den strukturierten Kontext und System-Prompt für ein Aquarium.
 */
async function buildAquariumSystemPrompt(aquariumId?: any, customDb: any = null) {
  const database = customDb || db;
  const aq = await database.aquariums.findById(aquariumId);
  if (!aq) {
    throw new Error('Aquarium nicht gefunden.');
  }

  // Besatz abrufen
  const stockRows = await database.stock.listForAquarium(aquariumId);
  const stockDetails = stockRows.map((s: any) => {
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
      salinity: sp?.salinity || null,
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
  const profileKeys = stockRows.map((s: any) => s.profile || 'allgemein');
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
  const paramMap = new Map((allParams || []).map((p: any) => [p.key, p]));

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
  contextText += `\n=== 2. BESATZ & BEWOHNER (${stockDetails.reduce((a?: any, b?: any) => a + b.count, 0)} Individuen in ${stockDetails.length} Arten/Gruppen) ===\n`;
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
    measurements.forEach((m?: any, idx?: any) => {
      const dt = new Date(m.measured_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
      const valEntries = Object.entries(m.values || {});
      const formattedVals = valEntries.map(([k, v]: any) => {
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
    maintenanceLogs.slice(0, 8).forEach((ml: any) => {
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

function isOpenAiReasoningModel(modelName?: any) {
  if (!modelName || typeof modelName !== 'string') return false;
  const m = modelName.trim().toLowerCase();
  return (
    /^(o[1-9]|chatgpt-reasoning|gpt-5|gpt-o)/i.test(m) ||
    /\bo[1-9](-|$)/i.test(m) ||
    m.includes('reasoning') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4')
  );
}

/**
 * OpenAI / ChatGPT Aufruf
 */
async function callOpenAi({ apiKey, model, systemPrompt, messages = [], message = null, stream = false }: any) {
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

  const chosenModel = model || DEFAULT_OPENAI_MODEL;
  const isReasoning = isOpenAiReasoningModel(chosenModel);
  const payload: Record<string, any> = {
    model: chosenModel,
    messages: chatMessages,
    stream: Boolean(stream),
    max_completion_tokens: 1500,
  };

  if (!isReasoning) {
    payload.temperature = 0.7;
  }

  const url = `${OPENAI_URL_BASE}/chat/completions`;
  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  // Fallback für modell- und proxy-spezifische Parameterinkompatibilitäten (z. B. temperature, max_completion_tokens)
  if (!response.ok && response.status === 400) {
    let errorData = null;
    try {
      errorData = await response.clone().json();
    } catch (e) {}
    const errMsg = String(errorData?.error?.message || '').toLowerCase();

    let retryPayload: Record<string, any> = { ...payload };
    let shouldRetry = false;

    if (
      errMsg.includes('temperature') &&
      (errMsg.includes('support') || errMsg.includes('unsupported') || errMsg.includes('default') || errMsg.includes('invalid') || errMsg.includes('parameter') || errMsg.includes('value'))
    ) {
      delete retryPayload.temperature;
      shouldRetry = true;
    }

    if (
      errMsg.includes('max_completion_tokens') &&
      (errMsg.includes('unsupported') || errMsg.includes('unknown') || errMsg.includes('extra fields') || errMsg.includes('parameter'))
    ) {
      delete retryPayload.max_completion_tokens;
      retryPayload.max_tokens = 1500;
      shouldRetry = true;
    }

    if (shouldRetry) {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(retryPayload),
        signal: AbortSignal.timeout(60000),
      });

      // Zweiter Fallback-Schritt bei kombinierten Inkompatibilitäten
      if (!response.ok && response.status === 400) {
        let secondErrorData = null;
        try {
          secondErrorData = await response.clone().json();
        } catch (e) {}
        const secondErrMsg = String(secondErrorData?.error?.message || '').toLowerCase();
        let secondRetry = false;

        if (
          secondErrMsg.includes('temperature') &&
          retryPayload.temperature !== undefined &&
          (secondErrMsg.includes('support') || secondErrMsg.includes('unsupported') || secondErrMsg.includes('default') || secondErrMsg.includes('invalid') || secondErrMsg.includes('parameter') || secondErrMsg.includes('value'))
        ) {
          delete retryPayload.temperature;
          secondRetry = true;
        }
        if (
          secondErrMsg.includes('max_completion_tokens') &&
          retryPayload.max_completion_tokens !== undefined &&
          (secondErrMsg.includes('unsupported') || secondErrMsg.includes('unknown') || secondErrMsg.includes('extra fields') || secondErrMsg.includes('parameter'))
        ) {
          delete retryPayload.max_completion_tokens;
          retryPayload.max_tokens = 1500;
          secondRetry = true;
        }

        if (secondRetry) {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(retryPayload),
            signal: AbortSignal.timeout(60000),
          });
        }
      }
    }
  }

  if (!response.ok) {
    let errorData: Record<string, any> = {};
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

    const err: Error & { status?: number; code?: string; provider?: string; apiError?: unknown } = new Error(friendlyMessage);
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
async function callGemini({ apiKey, model, systemPrompt, messages = [], message = null }: any) {
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

  const payload: Record<string, any> = {
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
    let errorData: Record<string, any> = {};
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

    const err: Error & { status?: number; code?: string; provider?: string; apiError?: unknown } = new Error(friendlyMessage);
    err.status = response.status;
    err.apiError = errorData;
    throw err;
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const reply = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';

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
async function callClaude({ apiKey, model, systemPrompt, messages = [], message = null }: any) {
  const chosenModel = model || DEFAULT_CLAUDE_MODEL;
  const rawChatMessages = [];

  if (Array.isArray(messages) && messages.length > 0) {
    for (const m of messages) {
      if (m && typeof m.content === 'string' && m.content.trim() && (m.role === 'user' || m.role === 'assistant')) {
        rawChatMessages.push({
          role: m.role,
          content: m.content.trim().slice(0, 8000),
        });
      }
    }
  }

  if (message && typeof message === 'string' && message.trim()) {
    rawChatMessages.push({
      role: 'user',
      content: message.trim().slice(0, 8000),
    });
  }

  // Anthropic Vorgaben für Nachrichten:
  // 1. Nachrichten müssen abwechselnd 'user' und 'assistant' sein (aufeinanderfolgende gleiche Rollen zusammenführen)
  // 2. Die erste Nachricht MUSS die Rolle 'user' haben
  // 3. Jede Nachricht muss nicht-leeren Content haben
  const chatMessages = [];
  for (const msg of rawChatMessages) {
    if (!msg.content) continue;
    if (chatMessages.length === 0) {
      if (msg.role === 'user') {
        chatMessages.push({ role: 'user', content: msg.content });
      } else {
        // Falls Historie mit Assistant beginnt, eine einleitende User-Nachricht voranstellen
        chatMessages.push({ role: 'user', content: 'Hallo' });
        chatMessages.push({ role: 'assistant', content: msg.content });
      }
    } else {
      const prev = chatMessages[chatMessages.length - 1];
      if (prev.role === msg.role) {
        // Gleiche Rolle: Inhalte zusammenführen
        prev.content += '\n\n' + msg.content;
      } else {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Falls keine Nachrichten übrig blieben, Standard-Nachricht einfügen
  if (chatMessages.length === 0) {
    chatMessages.push({ role: 'user', content: 'Hallo' });
  }

  const payload: Record<string, any> = {
    model: chosenModel,
    messages: chatMessages,
    max_tokens: 1500,
  };

  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
    payload.system = systemPrompt.trim();
  }

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
    let errorData: Record<string, any> = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const claudeError = errorData?.error?.message || errorData?.message || response.statusText;
    let friendlyMessage = `Anthropic Claude API Fehler (${response.status}): ${claudeError}`;

    if (response.status === 401) {
      friendlyMessage = 'Der hinterlegte Anthropic Claude API-Schlüssel ist ungültig oder abgelaufen. Bitte prüfe den Schlüssel in deinem Profil.';
    } else if (response.status === 403) {
      friendlyMessage = `Anthropic Claude Zugriff verweigert (403): ${claudeError}`;
    } else if (response.status === 429) {
      friendlyMessage = 'Anthropic Claude Rate-Limit oder Kontingentlimit erreicht. Bitte prüfe dein Anthropic-Guthaben (Credits) oder versuche es in wenigen Momenten erneut.';
    } else if (response.status === 404) {
      friendlyMessage = `Das ausgewählte Claude-Modell „${chosenModel}“ ist für diesen API-Schlüssel nicht freigeschaltet (HTTP 404). Dies tritt bei Anthropic auf, wenn in der Anthropic Console (console.anthropic.com -> Plans & Billing) noch kein Prepaid-Guthaben aufgeladen wurde (Tier 0). Bitte lade dort mindestens 5 $ Guthaben auf. (Hinweis: Ein normales Claude.ai Pro Web-Abo schaltet nicht automatisch die Entwickler-API frei).`;
    } else if (response.status === 529) {
      friendlyMessage = 'Anthropic Claude ist derzeit überlastet (529 Overloaded). Bitte versuche es in wenigen Momenten erneut.';
    } else if (response.status === 400) {
      if (String(claudeError).toLowerCase().includes('credit') || String(claudeError).toLowerCase().includes('balance') || String(claudeError).toLowerCase().includes('quota')) {
        friendlyMessage = `Anthropic Claude Guthaben aufgebraucht oder nicht aufgeladen: ${claudeError}`;
      }
    }

    const err: Error & { status?: number; code?: string; provider?: string; apiError?: unknown } = new Error(friendlyMessage);
    err.status = response.status;
    err.apiError = errorData;
    throw err;
  }

  const data = await response.json();
  const reply = Array.isArray(data.content)
    ? data.content.map((c: any) => (c.type === 'text' ? c.text : c.text || '')).join('')
    : (data.text || '');

  return {
    reply: reply || '',
    model: data.model || chosenModel,
    provider: 'claude',
    usage: data.usage || null,
  };
}

/**
 * Löst den aktiven Provider, Key und Modell für den Chat auf.
 */
function resolveProviderAndConfig(user?: any, requestedProvider: any = null) {
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
 * Komprimiert und optimiert den Chat-Verlauf für den KI-Kontext.
 * - Behält die letzten N Turns (Standard: 10) in voller Detailtiefe.
 * - Fasst ältere Gesprächsrunden zu einer kompakten, strukturierten Zusammenfassung zusammen,
 *   damit der Assistent weiß, was bereits besprochen/empfohlen wurde, ohne das Token-Limit zu sprengen.
 */
function compressChatHistory(messages: any = [], options: any = {}) {
  const maxRecent = options.maxRecent || 10;
  const maxTotalChars = options.maxTotalChars || 12000;
  const maxOldTurnChars = options.maxOldTurnChars || 220;

  if (!Array.isArray(messages) || messages.length === 0) return [];

  // Bereinigen & filtern
  const valid = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .map((m: any) => ({ role: m.role, content: m.content.trim() }));

  if (valid.length === 0) return [];

  // Wenn Historie klein genug ist, direkt zurückgeben
  const totalLength = valid.reduce((sum?: any, m?: any) => sum + m.content.length, 0);
  if (valid.length <= maxRecent && totalLength <= maxTotalChars) {
    return valid;
  }

  // Aufteilen in ältere und neuere Nachrichten
  const recentCount = Math.min(maxRecent, valid.length);
  const older = valid.slice(0, valid.length - recentCount);
  const recent = valid.slice(valid.length - recentCount);

  if (older.length === 0) {
    return recent;
  }

  // Ältere Nachrichten komprimieren zu einer kompakten Historien-Zusammenfassung
  const summaryLines = [];
  for (let i = 0; i < older.length; i++) {
    const msg = older[i];
    const roleLabel = msg.role === 'user' ? 'Nutzer' : 'Assistent';
    let text = msg.content.replace(/\s+/g, ' ').trim();
    if (text.length > maxOldTurnChars) {
      text = text.slice(0, maxOldTurnChars) + '…';
    }
    summaryLines.push(`- ${roleLabel}: "${text}"`);
  }

  const compressedSummary = [
    `[KOMPRIMIERTER VERLAUF FRÜHERER GESPRÄCHE ZU DIESEM AQUARIUM (Chronologisch ältere Einträge):`,
    summaryLines.join('\n'),
    `Beziehe dich bei Bedarf nahtlos auf diese früheren Diagnosen und Ratschläge.]`,
  ].join('\n');

  // Als initialen Kontext einbinden
  return [
    { role: 'user', content: compressedSummary },
    {
      role: 'assistant',
      content:
        'Verstanden. Ich kenne den bisherigen Verlauf und die besprochenen Themen unseres Aquariums und beziehe dieses Vorwissen in meine Antworten ein.',
    },
    ...recent,
  ];
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
  saveHistory = true,
  includeHistory = true,
}: any) {
  const database = customDb || db;
  const dbUser = user?.id ? await database.users.findById(user.id) : null;

  const resolved = resolveProviderAndConfig(dbUser, provider);
  const activeProvider = resolved.provider;
  const apiKey = resolved.apiKey;
  const model = resolved.model;

  if (!apiKey) {
    const providerNames: Record<string, any> = {
      openai: 'OpenAI / ChatGPT',
      gemini: 'Google Gemini',
      claude: 'Anthropic Claude',
    };
    const pName = providerNames[activeProvider] || activeProvider;
    const err: Error & { status?: number; code?: string; provider?: string; apiError?: unknown } = new Error(
      `Kein API-Schlüssel für ${pName} hinterlegt. Bitte hinterlege deinen persönlichen API-Key im Benutzerprofil unter „Mein Profil -> KI-Assistent & Sprachmodelle“.`
    );
    err.code = 'NO_API_KEY';
    err.provider = activeProvider;
    err.status = 400;
    throw err;
  }

  // System-Prompt und Beckenkontext generieren
  const { systemPrompt } = await buildAquariumSystemPrompt(aquariumId, database);

  // Bestimme die aktuelle Benutzereingabe
  let userMessageText = '';
  if (message && typeof message === 'string' && message.trim()) {
    userMessageText = message.trim();
  }

  let inputMessages = Array.isArray(messages) ? [...messages] : [];
  if (!userMessageText && inputMessages.length > 0) {
    const last = inputMessages[inputMessages.length - 1];
    if (last && last.role === 'user' && last.content) {
      userMessageText = String(last.content).trim();
    }
  }

  // Wenn keine oder wenige Nachrichten übergeben wurden und includeHistory aktiv ist,
  // laden wir den bisherigen persistenten Verlauf aus der Datenbank
  if (includeHistory && database.aquariumChats) {
    try {
      const dbChats = await database.aquariumChats.listForAquarium(aquariumId, { limit: 100 });
      if (Array.isArray(dbChats) && dbChats.length > 0) {
        if (inputMessages.length === 0) {
          inputMessages = dbChats.map((c: any) => ({ role: c.role, content: c.content }));
        } else {
          // Prüfen, ob inputMessages nur die aktuelle Nachricht ist
          const isOnlyCurrentMsg =
            inputMessages.length === 1 &&
            inputMessages[0].role === 'user' &&
            inputMessages[0].content === userMessageText;
          if (isOnlyCurrentMsg) {
            inputMessages = [
              ...dbChats.map((c: any) => ({ role: c.role, content: c.content })),
              { role: 'user', content: userMessageText },
            ];
          }
        }
      }
    } catch (e) {
      // Ignoriere DB-Fehler beim Laden der Historie
    }
  }

  // Sicherstellen, dass die aktuelle Nachricht am Ende steht
  if (userMessageText) {
    const lastMsg = inputMessages[inputMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userMessageText) {
      inputMessages.push({ role: 'user', content: userMessageText });
    }
  }

  // Mindestens eine User-Nachricht muss vorhanden sein
  const hasUserMsg = inputMessages.some(
    (m: any) => m && m.role === 'user' && m.content && String(m.content).trim()
  );
  if (!hasUserMsg) {
    throw new Error('Keine Benutzernachricht übergeben.');
  }

  // Kontext-Komprimierung anwenden
  const optimizedMessages = compressChatHistory(inputMessages);

  let result;
  if (activeProvider === 'gemini') {
    result = await callGemini({ apiKey, model, systemPrompt, messages: optimizedMessages });
  } else if (activeProvider === 'claude') {
    result = await callClaude({ apiKey, model, systemPrompt, messages: optimizedMessages });
  } else {
    result = await callOpenAi({ apiKey, model, systemPrompt, messages: optimizedMessages, stream });
  }

  // Wenn die Antwort erfolgreich war und Historie gespeichert werden soll
  if (saveHistory && result && result.reply && database.aquariumChats) {
    try {
      if (userMessageText) {
        await database.aquariumChats.create({
          aquariumId,
          userId: user?.id || null,
          role: 'user',
          content: userMessageText,
          provider: activeProvider,
          model,
        });
      }
      await database.aquariumChats.create({
        aquariumId,
        userId: user?.id || null,
        role: 'assistant',
        content: result.reply,
        provider: activeProvider,
        model: result.model || model,
      });
    } catch (dbErr) {
      // Speichern ignorieren falls Fehler
    }
  }

  return result;
}

/**
 * Ruft die verfügbaren Modelle von OpenAI ab.
 */
async function fetchOpenAiModels(apiKey?: any, baseUrl: any = OPENAI_URL_BASE) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen OpenAI API-Schlüssel ein.');
  }

  const url = `${baseUrl || OPENAI_URL_BASE}/models`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData: Record<string, any> = {};
    try {
      errorData = await response.json();
    } catch (e) {}
    const msg = errorData?.error?.message || response.statusText;
    if (response.status === 401) {
      throw new Error('Ungültiger OpenAI API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    throw new Error(`Fehler beim Abrufen der OpenAI-Modelle (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data.data) ? data.data : [];

  // Relevante Chat-/Reasoning-Modelle filtern (Audio, Whisper, Embeddings, DALL-E etc. ausschließen)
  const excludeRegex = /(tts|whisper|dall-e|embedding|moderation|realtime|transcription|audio)/i;
  const chatModels = rawList.filter((m: any) => {
    const id = m.id || '';
    if (excludeRegex.test(id)) return false;
    return /^(gpt|o1|o3|o4|chatgpt)/i.test(id);
  });

  const priority = [
    'gpt-6', 'gpt-6-mini', 'gpt-5',
    'gpt-4o', 'gpt-4o-mini', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06', 'gpt-4o-2024-05-13',
    'o3-mini', 'o1', 'o1-mini', 'o1-preview',
    'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-4',
    'gpt-3.5-turbo'
  ];

  chatModels.sort((a?: any, b?: any) => {
    const idA = a.id || '';
    const idB = b.id || '';
    const idxA = priority.indexOf(idA);
    const idxB = priority.indexOf(idB);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return idA.localeCompare(idB);
  });

  return chatModels.map((m: any) => ({
    value: m.id,
    label: m.id,
    created: m.created,
    ownedBy: m.owned_by,
  }));
}

/**
 * Ruft die verfügbaren Modelle von Google Gemini ab.
 */
async function fetchGeminiModels(apiKey?: any) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen Google Gemini API-Schlüssel ein.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData: Record<string, any> = {};
    try {
      errorData = await response.json();
    } catch (e) {}
    const msg = errorData?.error?.message || response.statusText;
    if (response.status === 400 && String(msg).toLowerCase().includes('api key')) {
      throw new Error('Ungültiger Google Gemini API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    throw new Error(`Fehler beim Abrufen der Gemini-Modelle (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data.models) ? data.models : [];

  const contentModels = rawList.filter((m: any) => {
    const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
    return methods.includes('generateContent');
  });

  const priority = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
  ];

  contentModels.sort((a?: any, b?: any) => {
    const idA = (a.name || '').replace(/^models\//, '');
    const idB = (b.name || '').replace(/^models\//, '');
    const idxA = priority.indexOf(idA);
    const idxB = priority.indexOf(idB);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return idA.localeCompare(idB);
  });

  return contentModels.map((m: any) => {
    const cleanId = (m.name || '').replace(/^models\//, '');
    const label = m.displayName && m.displayName !== cleanId
      ? `${cleanId} (${m.displayName})`
      : cleanId;
    return {
      value: cleanId,
      label,
      displayName: m.displayName || cleanId,
      description: m.description || '',
    };
  });
}

/**
 * Ruft die verfügbaren Modelle von Anthropic Claude ab.
 */
async function fetchClaudeModels(apiKey?: any) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen Anthropic Claude API-Schlüssel ein.');
  }

  const url = 'https://api.anthropic.com/v1/models';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData: Record<string, any> = {};
    try {
      errorData = await response.json();
    } catch (e) {}
    const msg = errorData?.error?.message || errorData?.message || response.statusText;
    if (response.status === 401) {
      throw new Error('Ungültiger Anthropic Claude API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    if (response.status === 404) {
      throw new Error('Modelle konnten nicht abgerufen werden (HTTP 404). Bitte prüfe dein Prepaid-Guthaben in der Anthropic Console.');
    }
    throw new Error(`Fehler beim Abrufen der Claude-Modelle (${response.status}): ${msg}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data.data) ? data.data : [];

  const priority = [
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ];

  rawList.sort((a?: any, b?: any) => {
    const idA = a.id || '';
    const idB = b.id || '';
    const idxA = priority.indexOf(idA);
    const idxB = priority.indexOf(idB);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return idA.localeCompare(idB);
  });

  return rawList.map((m: any) => {
    const id = m.id;
    const label = m.display_name ? `${id} (${m.display_name})` : id;
    return {
      value: id,
      label,
      displayName: m.display_name || id,
    };
  });
}

/**
 * Ruft dynamisch Modelle für den angegebenen Provider ab.
 */
async function fetchProviderModels({ provider, apiKey }: any) {
  const p = (provider || 'openai').toLowerCase().trim();
  if (p === 'gemini') {
    return await fetchGeminiModels(apiKey);
  } else if (p === 'claude') {
    return await fetchClaudeModels(apiKey);
  } else {
    return await fetchOpenAiModels(apiKey);
  }
}

/**
 * Prüft die Gültigkeit eines OpenAI API-Keys mit einer minimalen Testanfrage.
 */
async function testOpenAiConnection(apiKey?: any, model: any = DEFAULT_OPENAI_MODEL) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen OpenAI API-Schlüssel ein.');
  }

  const chosenModel = model || DEFAULT_OPENAI_MODEL;
  const isReasoning = isOpenAiReasoningModel(chosenModel);
  const testPayload: Record<string, any> = {
    model: chosenModel,
    messages: [{ role: 'user', content: 'Antworte nur mit dem Wort OK.' }],
    max_completion_tokens: 25,
  };
  if (!isReasoning) {
    testPayload.temperature = 0.7;
  }

  const url = `${OPENAI_URL_BASE}/chat/completions`;
  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(testPayload),
    signal: AbortSignal.timeout(15000),
  });

  // Fallback für modell- und proxy-spezifische Parameterinkompatibilitäten
  if (!response.ok && response.status === 400) {
    let errorData = null;
    try {
      errorData = await response.clone().json();
    } catch (e) {}
    const errMsg = String(errorData?.error?.message || '').toLowerCase();

    let retryPayload: Record<string, any> = { ...testPayload };
    let shouldRetry = false;

    if (
      errMsg.includes('temperature') &&
      (errMsg.includes('support') || errMsg.includes('unsupported') || errMsg.includes('default') || errMsg.includes('invalid') || errMsg.includes('parameter') || errMsg.includes('value'))
    ) {
      delete retryPayload.temperature;
      shouldRetry = true;
    }

    if (
      errMsg.includes('max_completion_tokens') &&
      (errMsg.includes('unsupported') || errMsg.includes('unknown') || errMsg.includes('extra fields') || errMsg.includes('parameter'))
    ) {
      delete retryPayload.max_completion_tokens;
      retryPayload.max_tokens = 25;
      shouldRetry = true;
    }

    if (shouldRetry) {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(retryPayload),
        signal: AbortSignal.timeout(15000),
      });

      // Zweiter Fallback-Schritt
      if (!response.ok && response.status === 400) {
        let secondErrorData = null;
        try {
          secondErrorData = await response.clone().json();
        } catch (e) {}
        const secondErrMsg = String(secondErrorData?.error?.message || '').toLowerCase();
        let secondRetry = false;

        if (
          secondErrMsg.includes('temperature') &&
          retryPayload.temperature !== undefined &&
          (secondErrMsg.includes('support') || secondErrMsg.includes('unsupported') || secondErrMsg.includes('default') || secondErrMsg.includes('invalid') || secondErrMsg.includes('parameter') || secondErrMsg.includes('value'))
        ) {
          delete retryPayload.temperature;
          secondRetry = true;
        }
        if (
          secondErrMsg.includes('max_completion_tokens') &&
          retryPayload.max_completion_tokens !== undefined &&
          (secondErrMsg.includes('unsupported') || secondErrMsg.includes('unknown') || secondErrMsg.includes('extra fields') || secondErrMsg.includes('parameter'))
        ) {
          delete retryPayload.max_completion_tokens;
          retryPayload.max_tokens = 25;
          secondRetry = true;
        }

        if (secondRetry) {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify(retryPayload),
            signal: AbortSignal.timeout(15000),
          });
        }
      }
    }
  }

  if (!response.ok) {
    let errorData: Record<string, any> = {};
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
async function testGeminiConnection(apiKey?: any, model: any = DEFAULT_GEMINI_MODEL) {
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
    let errorData: Record<string, any> = {};
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
async function testClaudeConnection(apiKey?: any, model: any = DEFAULT_CLAUDE_MODEL) {
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
      max_tokens: 25,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    let errorData: Record<string, any> = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const claudeError = errorData?.error?.message || errorData?.message || response.statusText;
    if (response.status === 401) {
      throw new Error('Ungültiger Anthropic Claude API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    if (response.status === 403) {
      throw new Error(`Anthropic Claude Zugriff verweigert (403): ${claudeError}`);
    }
    if (response.status === 429) {
      throw new Error('Anthropic Claude Rate-Limit oder Kontingentlimit erreicht. Bitte prüfe dein Guthaben.');
    }
    if (response.status === 404) {
      throw new Error(`Das ausgewählte Claude-Modell „${chosenModel}“ ist für diesen API-Schlüssel nicht freigeschaltet (HTTP 404). Dies tritt bei Anthropic auf, wenn in der Anthropic Console (console.anthropic.com -> Plans & Billing) noch kein Prepaid-Guthaben aufgeladen wurde (Tier 0). Bitte lade dort mindestens 5 $ Guthaben auf. (Hinweis: Ein normales Claude.ai Pro Web-Abo schaltet nicht automatisch die Entwickler-API frei).`);
    }
    if (response.status === 529) {
      throw new Error('Anthropic Claude ist derzeit überlastet (529 Overloaded). Bitte versuche es später erneut.');
    }
    if (response.status === 400 && (String(claudeError).toLowerCase().includes('credit') || String(claudeError).toLowerCase().includes('balance') || String(claudeError).toLowerCase().includes('quota'))) {
      throw new Error(`Anthropic Claude Guthaben aufgebraucht oder nicht aufgeladen: ${claudeError}`);
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
async function testAiConnection({ provider, apiKey, model }: any) {
  const p = (provider || 'openai').toLowerCase().trim();
  if (p === 'gemini') {
    return await testGeminiConnection(apiKey, model);
  } else if (p === 'claude') {
    return await testClaudeConnection(apiKey, model);
  } else {
    return await testOpenAiConnection(apiKey, model);
  }
}

export = {
  buildAquariumSystemPrompt,
  compressChatHistory,
  chatWithAquarium,
  fetchOpenAiModels,
  fetchGeminiModels,
  fetchClaudeModels,
  fetchProviderModels,
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
