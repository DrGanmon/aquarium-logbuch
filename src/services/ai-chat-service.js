'use strict';
const db = require('../db');
const cfg = require('../../config');
const { OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL } = require('../config/env');

const DEFAULT_MODEL = OPENAI_MODEL || 'gpt-4o-mini';
const BASE_URL = (OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

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
 * Führt einen Chat-Request gegen die OpenAI / ChatGPT API aus.
 */
async function chatWithAquarium({
  aquariumId,
  user,
  messages = [],
  message = null,
  stream = false,
  customDb = null,
}) {
  const database = customDb || db;
  const dbUser = user?.id ? await database.users.findById(user.id) : null;

  // API-Key auflösen: User-Key hat Vorrang, sonst Server-Key
  const apiKey = (dbUser?.openai_api_key || OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Kein OpenAI/ChatGPT API-Schlüssel hinterlegt. Bitte hinterlege deinen persönlichen API-Key im Benutzerprofil unter „Mein Profil -> ChatGPT & KI-Assistent“.');
    err.code = 'NO_API_KEY';
    err.status = 400;
    throw err;
  }

  const model = (dbUser?.openai_model || OPENAI_MODEL || DEFAULT_MODEL).trim();

  // System-Prompt und Beckenkontext generieren
  const { systemPrompt } = await buildAquariumSystemPrompt(aquariumId, database);

  // Nachrichtenliste aufbauen
  const chatMessages = [{ role: 'system', content: systemPrompt }];

  if (Array.isArray(messages) && messages.length > 0) {
    for (const m of messages) {
      if (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) {
        chatMessages.push({
          role: m.role,
          content: m.content.slice(0, 8000), // Begrenzung gegen überlange Payloads
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

  // Sicherstellen, dass mindestens eine User-Nachricht existiert
  const hasUserMsg = chatMessages.some((m) => m.role === 'user');
  if (!hasUserMsg) {
    throw new Error('Keine Benutzernachricht übergeben.');
  }

  const payload = {
    model,
    messages: chatMessages,
    temperature: 0.7,
    max_tokens: 1500,
    stream: Boolean(stream),
  };

  const url = `${BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000), // 60s Timeout
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {
      // ignore
    }

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
    err.openAiError = errorData;
    throw err;
  }

  if (stream) {
    return {
      stream: response.body,
      model,
    };
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || '';

  return {
    reply,
    model: data.model || model,
    usage: data.usage || null,
  };
}

/**
 * Prüft die Gültigkeit eines API-Keys mit einer minimalen Testanfrage.
 */
async function testOpenAiConnection(apiKey, model = DEFAULT_MODEL) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Bitte gib einen API-Schlüssel ein.');
  }

  const url = `${BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
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
      throw new Error('Ungültiger API-Schlüssel. Bitte überprüfe deine Eingabe.');
    }
    if (response.status === 429) {
      throw new Error('API-Schlüssel ist gültig, aber das Kontingent ist erschöpft (Quota Exceeded / Rate Limit).');
    }
    throw new Error(`OpenAI Verbindungstest fehlgeschlagen (${response.status}): ${openAiError}`);
  }

  const data = await response.json();
  return {
    ok: true,
    model: data.model || model,
    message: 'Verbindung zu OpenAI erfolgreich hergestellt!',
  };
}

module.exports = {
  buildAquariumSystemPrompt,
  chatWithAquarium,
  testOpenAiConnection,
  DEFAULT_MODEL,
};
