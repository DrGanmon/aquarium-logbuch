/**
 * Aquarium-Logbuch - Frontend Worker Client
 * Verwaltet den Web Worker Threadpool / RPC-Kommunikation mit transparentem Fallback.
 */
'use strict';

let workerInstance = null;
let workerInitPromise = null;
let requestId = 0;
const pendingRequests = new Map();

/**
 * Prüft, ob Web Worker in der aktuellen Browserumgebung unterstützt werden.
 */
export function isWorkerSupported() {
  return typeof window !== 'undefined' && typeof window.Worker !== 'undefined';
}

/**
 * Ermittelt den Pfad zur Worker-Datei basierend auf dem geladenen Script / Bundle.
 */
function getWorkerScriptUrl() {
  if (typeof document !== 'undefined') {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      const src = s.getAttribute('src') || '';
      if (src.includes('dist/app.min.js')) {
        return 'dist/worker.min.js';
      }
      if (src.includes('dist/app.js')) {
        return 'dist/worker.js';
      }
    }
  }
  return 'worker.js';
}

/**
 * Initialisiert den Web Worker lazy bei Bedarf.
 */
export async function getWorker() {
  if (!isWorkerSupported()) return null;
  if (workerInstance) return workerInstance;

  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = new Promise((resolve) => {
    try {
      const workerUrl = getWorkerScriptUrl();
      const w = new Worker(workerUrl);

      w.onmessage = (event) => {
        const { id, success, result, error } = event.data || {};
        const p = pendingRequests.get(id);
        if (p) {
          pendingRequests.delete(id);
          if (success) {
            p.resolve(result);
          } else {
            p.reject(new Error(error || 'Worker execution failed'));
          }
        }
      };

      w.onerror = (err) => {
        console.warn('⚠️ Web Worker Fehler, verwende Haupt-Thread Fallback:', err);
        // Bei Fehler verbleibende Requests mit Fehler beenden
        for (const [, p] of pendingRequests) {
          p.reject(err);
        }
        pendingRequests.clear();
        workerInstance = null;
      };

      workerInstance = w;
      resolve(workerInstance);
    } catch (e) {
      console.warn('⚠️ Web Worker konnte nicht gestartet werden, verwende Fallback:', e);
      workerInstance = null;
      resolve(null);
    }
  });

  return workerInitPromise;
}

/**
 * Führt einen Task im Worker-Thread aus.
 * Falls Worker nicht verfügbar ist oder fehlschlägt, wird der Fallback auf dem Haupt-Thread ausgeführt.
 */
export async function runWorkerTask(type, payload = {}, transfer = []) {
  const reqId = ++requestId;
  const worker = await getWorker();

  if (worker) {
    try {
      const resultPromise = new Promise((resolve, reject) => {
        // Timeout-Schutz nach 15 Sekunden
        const timeout = setTimeout(() => {
          if (pendingRequests.has(reqId)) {
            pendingRequests.delete(reqId);
            reject(new Error(`Worker Task ${type} Timeout`));
          }
        }, 15000);

        pendingRequests.set(reqId, {
          resolve: (val) => {
            clearTimeout(timeout);
            resolve(val);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });
      });

      worker.postMessage({ id: reqId, type, payload }, transfer);
      return await resultPromise;
    } catch (e) {
      console.warn(`Worker-Task ${type} fehlgeschlagen, führe Fallback aus:`, e);
    }
  }

  // Fallback direkt auf dem Haupt-Thread
  return executeTaskFallback(type, payload);
}

// -------------------------------------------------------------
// Fallback-Implementierungen auf dem Hauptthread
// -------------------------------------------------------------

function executeTaskFallback(type, payload) {
  switch (type) {
    case 'PARSE_CSV':
      return fallbackParseCsv(payload);
    case 'PARSE_FULL_CSV':
      return fallbackParseFullCsv(payload);
    case 'SEARCH_SPECIES':
      return fallbackSearchSpecies(payload);
    case 'CHECK_COMPATIBILITY':
      return fallbackCheckCompatibility(payload);
    case 'COMPUTE_STATS':
      return fallbackComputeStats(payload);
    case 'PROCESS_IMAGE':
      return fallbackProcessImage(payload);
    case 'PING':
      return { status: 'ok', fallback: true, timestamp: Date.now() };
    default:
      throw new Error(`Unbekannter Task: ${type}`);
  }
}

function detectDelimiter(text) {
  const firstLines = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = {
    ';': (firstLines.match(/;/g) || []).length,
    ',': (firstLines.match(/,/g) || []).length,
    '\t': (firstLines.match(/\t/g) || []).length,
    '|': (firstLines.match(/\|/g) || []).length,
  };
  let best = ';';
  let max = -1;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = delim;
    }
  }
  return max > 0 ? best : ';';
}

function parseCsvRows(text, delimiter = ';') {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentVal.trim());
        if (currentRow.some((c) => c !== '')) rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal.trim());
        if (currentRow.some((c) => c !== '')) rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  if (currentVal || currentRow.length) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((c) => c !== '')) rows.push(currentRow);
  }

  return rows;
}

const PARAM_KEYWORDS = {
  date: ['datum', 'date', 'tag', 'messdatum', 'zeitpunkt', 'timestamp', 'zeitstempel'],
  time: ['uhrzeit', 'time', 'zeit', 'stunde', 'uhr'],
  note: ['notiz', 'note', 'bemerkung', 'kommentar', 'hinweis', 'beschreibung'],
  temp: ['temp', 'temperatur', 'temperature', 'celsius', '°c', 'grad'],
  ph: ['ph', 'ph-wert', 'ph wert', 'phwert', 'acidity'],
  kh: ['kh', 'karbonathärte', 'karbonat', 'carbonathärte', 'dkh', 'alcalinity', 'alkalinität'],
  gh: ['gh', 'gesamthärte', 'gesamthaerte', 'general hardness', 'dgh'],
  no2: ['no2', 'nitrit', 'nitrite', 'no2-n'],
  no3: ['no3', 'nitrat', 'nitrate', 'no3-n'],
  nh4: ['nh4', 'ammonium', 'ammonia', 'nh3', 'ammoniak'],
  po4: ['po4', 'phosphat', 'phosphate'],
  fe: ['fe', 'eisen', 'iron'],
  k: ['k', 'kalium', 'potassium'],
  mg: ['mg', 'magnesium'],
  ca: ['ca', 'calcium', 'kalzium'],
  cu: ['cu', 'kupfer', 'copper'],
  sio2: ['sio2', 'silikat', 'silicate', 'kieselsäure'],
  o2: ['o2', 'sauerstoff', 'oxygen'],
  co2: ['co2', 'kohlendioxid', 'carbon dioxide'],
  salinity: ['salinität', 'salinity', 'dichte', 'leitwert', 'tds', 'ec', 'salzgehalt'],
};

function autoMapHeaders(headers) {
  const mapping = {};
  const usedKeys = new Set();
  headers.forEach((header, colIdx) => {
    const cleanHeader = header.toLowerCase().replace(/[^a-z0-9äöüß]/gi, '');
    for (const [targetKey, synonyms] of Object.entries(PARAM_KEYWORDS)) {
      if (usedKeys.has(targetKey)) continue;
      const match = synonyms.some(
        (syn) => cleanHeader === syn || cleanHeader.includes(syn) || syn.includes(cleanHeader)
      );
      if (match) {
        mapping[colIdx] = targetKey;
        usedKeys.add(targetKey);
        break;
      }
    }
  });
  return mapping;
}

function parseGermanOrIsoDate(dateStr, timeStr = null) {
  if (!dateStr) return null;
  const cleanDate = dateStr.trim();
  const cleanTime = (timeStr || '').trim();

  const deMatch = cleanDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (deMatch) {
    const day = parseInt(deMatch[1], 10);
    const month = parseInt(deMatch[2], 10) - 1;
    let year = parseInt(deMatch[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    let hour = deMatch[4] ? parseInt(deMatch[4], 10) : 12;
    let min = deMatch[5] ? parseInt(deMatch[5], 10) : 0;
    let sec = deMatch[6] ? parseInt(deMatch[6], 10) : 0;
    if (cleanTime) {
      const tMatch = cleanTime.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (tMatch) {
        hour = parseInt(tMatch[1], 10);
        min = parseInt(tMatch[2], 10);
        sec = tMatch[3] ? parseInt(tMatch[3], 10) : 0;
      }
    }
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const isoMatch = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    let hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 12;
    let min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    let sec = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    if (cleanTime) {
      const tMatch = cleanTime.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (tMatch) {
        hour = parseInt(tMatch[1], 10);
        min = parseInt(tMatch[2], 10);
        sec = tMatch[3] ? parseInt(tMatch[3], 10) : 0;
      }
    }
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const fallbackDate = new Date(cleanDate + (cleanTime ? ' ' + cleanTime : ''));
  if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString();
  return null;
}

function parseNumberValue(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!str) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function fallbackParseCsv(data) {
  const { csvText, explicitDelimiter } = data;
  if (!csvText || !csvText.trim()) {
    return { headers: [], sampleRows: [], delimiter: ';', totalDataRows: 0, autoMapping: {} };
  }
  const delimiter = explicitDelimiter || detectDelimiter(csvText);
  const rows = parseCsvRows(csvText, delimiter);
  if (!rows.length) {
    return { headers: [], sampleRows: [], delimiter, totalDataRows: 0, autoMapping: {} };
  }
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const sampleRows = dataRows.slice(0, 5);
  const autoMapping = autoMapHeaders(headers);
  return {
    headers,
    sampleRows,
    delimiter,
    totalDataRows: dataRows.length,
    autoMapping,
  };
}

function fallbackParseFullCsv(data) {
  const { csvText, delimiter, mapping } = data;
  const rows = parseCsvRows(csvText, delimiter || ';');
  if (rows.length < 2) return { measurements: [], count: 0 };

  const dataRows = rows.slice(1);
  const measurements = [];

  for (const row of dataRows) {
    let dateStr = null;
    let timeStr = null;
    let noteStr = '';
    const values = {};

    for (const [colIdxStr, fieldKey] of Object.entries(mapping)) {
      const colIdx = parseInt(colIdxStr, 10);
      const cellVal = row[colIdx];
      if (cellVal == null || cellVal === '') continue;

      if (fieldKey === 'date') dateStr = cellVal;
      else if (fieldKey === 'time') timeStr = cellVal;
      else if (fieldKey === 'note') noteStr = cellVal;
      else if (fieldKey && fieldKey !== 'ignore') {
        const num = parseNumberValue(cellVal);
        if (num != null) values[fieldKey] = num;
      }
    }

    const measuredAt = parseGermanOrIsoDate(dateStr, timeStr) || new Date().toISOString();
    if (Object.keys(values).length > 0 || noteStr) {
      measurements.push({
        measured_at: measuredAt,
        values,
        note: noteStr || null,
      });
    }
  }

  return { measurements, count: measurements.length };
}

function fallbackSearchSpecies(data) {
  const { speciesList, searchTerm, waterType, category } = data;
  if (!Array.isArray(speciesList)) return { results: [] };

  let list = speciesList;
  if (waterType && waterType !== 'all') {
    list = list.filter((s) => s.waterType === waterType);
  }
  if (category && category !== 'Alle') {
    const catLower = category.toLowerCase();
    list = list.filter((s) => s.category && s.category.toLowerCase() === catLower);
  }

  if (searchTerm && searchTerm.trim()) {
    const query = searchTerm.trim().toLowerCase();
    const queryParts = query.split(/\s+/).filter(Boolean);
    const scored = [];

    for (const sp of list) {
      const name = (sp.name || '').toLowerCase();
      const sci = (sp.scientificName || '').toLowerCase();
      const cat = (sp.category || '').toLowerCase();
      const desc = (sp.description || '').toLowerCase();
      const beh = (sp.behaviorNotes || '').toLowerCase();
      const tags = Array.isArray(sp.tags) ? sp.tags.map((t) => t.toLowerCase()) : [];

      let score = 0;
      let matchedAll = true;

      for (const part of queryParts) {
        let partMatched = false;
        if (name === part) { score += 100; partMatched = true; }
        else if (name.startsWith(part)) { score += 50; partMatched = true; }
        else if (name.includes(part)) { score += 30; partMatched = true; }

        if (sci.startsWith(part)) { score += 40; partMatched = true; }
        else if (sci.includes(part)) { score += 20; partMatched = true; }

        if (cat.includes(part)) { score += 15; partMatched = true; }
        if (tags.some((t) => t.includes(part))) { score += 25; partMatched = true; }
        if (beh.includes(part)) { score += 10; partMatched = true; }
        if (desc.includes(part)) { score += 5; partMatched = true; }

        if (!partMatched) {
          matchedAll = false;
          break;
        }
      }

      if (matchedAll && score > 0) scored.push({ species: sp, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return { results: scored.map((s) => s.species) };
  }

  return { results: list };
}

function fallbackCheckCompatibility(data) {
  const { aquarium, speciesCatalog, stocking, lang = 'de' } = data;
  const isEn = String(lang).toLowerCase().startsWith('en');
  const issues = [];
  const warnings = [];
  const infos = [];
  if (!stocking || !stocking.length) return { issues, warnings, infos, overlaps: {} };

  const vol = aquarium?.volume_liters || 0;
  const catalogMap = new Map();
  if (Array.isArray(speciesCatalog)) {
    for (const sp of speciesCatalog) {
      if (sp.id) catalogMap.set(String(sp.id), sp);
      if (sp.name) catalogMap.set(sp.name.toLowerCase(), sp);
      if (sp.name_de) catalogMap.set(sp.name_de.toLowerCase(), sp);
      if (sp.name_en) catalogMap.set(sp.name_en.toLowerCase(), sp);
    }
  }

  const populated = stocking.map((st) => {
    const sp =
      (st.speciesId && catalogMap.get(String(st.speciesId))) ||
      (st.species && catalogMap.get(st.species.toLowerCase())) ||
      null;
    return { ...st, meta: sp, count: parseInt(st.count, 10) || 1 };
  });

  for (const st of populated) {
    if (st.meta && st.meta.minVolumeL && vol > 0 && vol < st.meta.minVolumeL) {
      const spName = isEn ? (st.meta.name_en || st.meta.name) : (st.meta.name_de || st.meta.name);
      warnings.push({
        type: 'min_volume',
        title: isEn ? `Tank size too small: ${spName}` : `Mindestbeckengröße unterschritten: ${spName}`,
        message: isEn
          ? `"${spName}" requires at least ${st.meta.minVolumeL} litres (tank has ${vol} L).`
          : `„${spName}“ benötigt mindestens ${st.meta.minVolumeL} Liter (Becken hat ${vol} L).`,
        species: spName,
      });
    }
    if (st.meta && st.meta.socialType === 'school' && st.meta.minGroupCount && st.count < st.meta.minGroupCount) {
      const spName = isEn ? (st.meta.name_en || st.meta.name) : (st.meta.name_de || st.meta.name);
      warnings.push({
        type: 'school_size',
        title: isEn ? `School size too small: ${spName}` : `Schwarmgröße zu klein: ${spName}`,
        message: isEn
          ? `"${spName}" is a schooling fish and should be kept with at least ${st.meta.minGroupCount} specimens (currently: ${st.count}).`
          : `„${spName}“ ist ein Schwarmfisch und sollte ab ${st.meta.minGroupCount} Tieren gehalten werden (aktuell: ${st.count}).`,
        species: spName,
      });
    }
  }

  const bettas = populated.filter((st) => st.meta?.tags?.includes('solitary_betta'));
  if (bettas.reduce((sum, b) => sum + b.count, 0) > 1) {
    issues.push({
      type: 'betta_solitary',
      title: isEn ? 'Critical Conflict: Multiple Fighting Fish' : 'Kritischer Konflikt: Mehrere Kampffische',
      message: isEn
        ? 'Siamese fighting fish (Betta splendens) must strictly be kept solitary!'
        : 'Siamesische Kampffische (Betta splendens) müssen strikt einzeln gehalten werden!',
    });
  }

  const nippers = populated.filter((st) => st.meta?.tags?.includes('fin_nipper'));
  const longFins = populated.filter((st) => st.meta?.tags?.includes('long_fins') || st.meta?.tags?.includes('solitary_betta'));
  if (nippers.length && longFins.length) {
    for (const nip of nippers) {
      for (const lf of longFins) {
        const nipName = isEn ? (nip.meta.name_en || nip.meta.name) : (nip.meta.name_de || nip.meta.name);
        const lfName = isEn ? (lf.meta.name_en || lf.meta.name) : (lf.meta.name_de || lf.meta.name);
        warnings.push({
          type: 'fin_nipping',
          title: isEn ? `Fin-nipping risk: ${nipName} vs. ${lfName}` : `Flossenbeißer-Gefahr: ${nipName} vs. ${lfName}`,
          message: isEn
            ? `"${nipName}" tends to nip fins of long-finned species like "${lfName}".`
            : `„${nipName}“ neigt zum Flossenbeißen bei langflossigen Arten wie „${lfName}“.`,
        });
      }
    }
  }

  const predators = populated.filter((st) => st.meta?.tags?.includes('predator_small_prey'));
  const shrimps = populated.filter((st) => st.meta?.tags?.includes('dwarf_shrimp'));
  if (predators.length && shrimps.length) {
    for (const pred of predators) {
      for (const sh of shrimps) {
        const predName = isEn ? (pred.meta.name_en || pred.meta.name) : (pred.meta.name_de || pred.meta.name);
        const shName = isEn ? (sh.meta.name_en || sh.meta.name) : (sh.meta.name_de || sh.meta.name);
        warnings.push({
          type: 'predator_prey',
          title: isEn ? `Predator warning: ${predName} vs. ${shName}` : `Fressfeind-Warnung: ${predName} vs. ${shName}`,
          message: isEn
            ? `"${predName}" considers dwarf shrimp ("${shName}") as live prey.`
            : `„${predName}“ betrachtet kleine Zwerggarnelen („${shName}“) als Lebendfutter.`,
        });
      }
    }
  }

  let tMin = -Infinity, tMax = Infinity;
  let phMin = -Infinity, phMax = Infinity;
  let hasValidMeta = false;

  for (const st of populated) {
    if (!st.meta) continue;
    hasValidMeta = true;
    if (st.meta.temp) {
      if (st.meta.temp.min != null) tMin = Math.max(tMin, st.meta.temp.min);
      if (st.meta.temp.max != null) tMax = Math.min(tMax, st.meta.temp.max);
    }
    if (st.meta.ph) {
      if (st.meta.ph.min != null) phMin = Math.max(phMin, st.meta.ph.min);
      if (st.meta.ph.max != null) phMax = Math.min(phMax, st.meta.ph.max);
    }
  }

  const overlaps = {};
  if (hasValidMeta) {
    if (tMin !== -Infinity && tMax !== Infinity) {
      overlaps.temp = { min: tMin, max: tMax, valid: tMin <= tMax };
      if (tMin > tMax) {
        issues.push({
          type: 'temp_mismatch',
          title: isEn ? 'Temperature Incompatibility' : 'Temperatur-Inkompatibilität',
          message: isEn
            ? `No common temperature range found (requires at least ${tMin} °C, but max ${tMax} °C).`
            : `Kein gemeinsamer Temperaturbereich vorhanden (benötigt mindestens ${tMin} °C, aber maximal ${tMax} °C).`,
        });
      }
    }
    if (phMin !== -Infinity && phMax !== Infinity) {
      overlaps.ph = { min: phMin, max: phMax, valid: phMin <= phMax };
      if (phMin > phMax) {
        issues.push({
          type: 'ph_mismatch',
          title: isEn ? 'pH Range Incompatibility' : 'pH-Wert-Inkompatibilität',
          message: isEn
            ? `No common pH range found (requires at least ${phMin}, but max ${phMax}).`
            : `Kein gemeinsamer pH-Bereich vorhanden (benötigt mindestens ${phMin}, aber maximal ${phMax}).`,
        });
      }
    }
  }

  return { issues, warnings, infos, overlaps };
}

function fallbackComputeStats(data) {
  const { measurements, parameters, thresholds } = data;
  if (!Array.isArray(measurements) || !measurements.length) return { stats: {}, series: {} };

  const sortedMeas = [...measurements].sort(
    (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
  );

  const stats = {};
  const series = {};
  const paramList = Array.isArray(parameters) ? parameters : [];

  for (const p of paramList) {
    const key = p.key;
    const points = [];
    const vals = [];

    for (const m of sortedMeas) {
      const v = m.values?.[key];
      if (v != null && !isNaN(v)) {
        points.push({ x: new Date(m.measured_at).getTime(), y: v });
        vals.push(v);
      }
    }

    if (!vals.length) continue;
    series[key] = points;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sortedVals = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sortedVals.length / 2);
    const median = sortedVals.length % 2 !== 0 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2;
    const variance = vals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / vals.length;
    const stdDev = Math.sqrt(variance);

    let trend = 'stable';
    let delta = 0;
    if (vals.length >= 2) {
      delta = vals[vals.length - 1] - vals[vals.length - 2];
      const thresholdEpsilon = (p.step || 0.1) * 0.5;
      if (delta > thresholdEpsilon) trend = 'rising';
      else if (delta < -thresholdEpsilon) trend = 'falling';
    }

    const th = thresholds?.[key] || {};
    let okCount = 0, warnCount = 0, critCount = 0;
    for (const v of vals) {
      if ((th.critMin != null && v < th.critMin) || (th.critMax != null && v > th.critMax)) critCount++;
      else if ((th.warnMin != null && v < th.warnMin) || (th.warnMax != null && v > th.warnMax)) warnCount++;
      else okCount++;
    }

    stats[key] = {
      count: vals.length,
      latest: vals[vals.length - 1],
      min,
      max,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      trend,
      delta: Math.round(delta * 100) / 100,
      critCount,
      warnCount,
      okCount,
    };
  }

  return { stats, series };
}

function fallbackProcessImage() {
  return { error: 'OFFSCREEN_CANVAS_FALLBACK' };
}

// -------------------------------------------------------------
// High-Level exportierte Worker-Funktionen
// -------------------------------------------------------------

/**
 * Parst CSV-Kopfzeile, Trennzeichen und Vorschau im Worker-Thread.
 */
export async function parseCsvInWorker(csvText, explicitDelimiter = null) {
  return runWorkerTask('PARSE_CSV', { csvText, explicitDelimiter });
}

/**
 * Parst alle CSV-Datenzeilen mit angegebener Spaltenzuordnung im Worker-Thread.
 */
export async function parseFullCsvInWorker(csvText, delimiter, mapping) {
  return runWorkerTask('PARSE_FULL_CSV', { csvText, delimiter, mapping });
}

/**
 * Filtert und durchsucht den Artenkatalog performant im Worker-Thread.
 */
export async function searchSpeciesInWorker(speciesList, searchTerm = '', waterType = 'all', category = 'Alle') {
  const res = await runWorkerTask('SEARCH_SPECIES', { speciesList, searchTerm, waterType, category });
  return res.results || [];
}

/**
 * Überprüft Beckenbesatz und Kompatibilität im Worker-Thread.
 */
export async function checkCompatibilityInWorker(aquarium, speciesCatalog, stocking, lang = 'de') {
  return runWorkerTask('CHECK_COMPATIBILITY', { aquarium, speciesCatalog, stocking, lang });
}

/**
 * Berechnet Zeitreihen und statistische Kennzahlen der Messungen im Worker-Thread.
 */
export async function computeStatsInWorker(measurements, parameters, thresholds) {
  return runWorkerTask('COMPUTE_STATS', { measurements, parameters, thresholds });
}

/**
 * Skaliert und komprimiert ein Bild (File/Blob) im Worker-Thread via OffscreenCanvas.
 */
export async function processImageInWorker(fileOrBlob, options = {}) {
  const { maxWidth = 1600, maxHeight = 1200, quality = 0.82, mimeType = 'image/jpeg' } = options;

  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(fileOrBlob);
      const res = await runWorkerTask(
        'PROCESS_IMAGE',
        { imageBitmap: bitmap, maxWidth, maxHeight, quality, mimeType },
        [bitmap]
      );

      if (res && res.arrayBuffer) {
        const blob = new Blob([res.arrayBuffer], { type: res.mimeType });
        return {
          blob,
          width: res.width,
          height: res.height,
          dataUrl: await blobToDataUrl(blob),
        };
      }
    } catch (e) {
      console.warn('Worker-Bildverarbeitung fehlgeschlagen, nutze Standard-FileReader:', e);
    }
  }

  // Fallback: Direkter DataURL-Reader
  return {
    blob: fileOrBlob,
    dataUrl: await fileToDataUrl(fileOrBlob),
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
