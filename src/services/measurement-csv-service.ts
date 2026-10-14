'use strict';

import cfg = require('../config/app-config');
import alert_serviceModule = require('./alert-service');
const { thresholdsOfAquarium, buildMessage } = alert_serviceModule;

/**
 * Erkennt automatisch das Trennzeichen einer CSV-Datei (;, ,, \t, |).
 */
function detectDelimiter(text?: any) {
  if (!text || typeof text !== 'string') return ';';
  const firstLine = text.split(/\r?\n/).find((l: any) => l.trim().length > 0) || '';
  const counts: Record<string, any> = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length,
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

/**
 * Parst CSV-Inhalt nach RFC 4180 mit Unterstützung für Anführungszeichen und Zeilenumbrüche.
 */
function parseCsv(text?: any, options: any = {}) {
  if (!text || typeof text !== 'string') return [];
  // BOM entfernen falls vorhanden
  let cleanText = text.replace(/^\uFEFF/, '');
  const delimiter = options.delimiter || detectDelimiter(cleanText);

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < cleanText.length) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaptes Anführungszeichen ("")
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Ende des Anführungszeichenbereichs
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((col: any) => col.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((col: any) => col.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((col: any) => col.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parst ein Datums- und optionales Uhrzeitfeld flexibel (ISO, Deutsch, Excel, etc.).
 */
function parseDate(rawDate?: any, rawTime: any = null) {
  if (!rawDate && rawDate !== 0) return null;
  let dStr = String(rawDate).trim();
  if (!dStr) return null;

  let tStr = rawTime != null ? String(rawTime).trim() : '';

  // Prüfe auf Excel Serial Date (z.B. 45200.5)
  if (/^\d{5}(\.\d+)?$/.test(dStr)) {
    const num = Number(dStr);
    if (!Number.isNaN(num) && num > 20000 && num < 80000) {
      // Excel base date: 1899-12-30
      const ms = (num - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  // Deutsches Format mit Punkten: TT.MM.JJJJ oder TT.MM.JJ oder TT.MM.JJJJ HH:mm[:ss]
  const germanMatch = dStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (germanMatch) {
    const day = parseInt(germanMatch[1], 10);
    const month = parseInt(germanMatch[2], 10) - 1;
    let year = parseInt(germanMatch[3], 10);
    if (year < 100) {
      year += year < 70 ? 2000 : 1900;
    }
    let hours = germanMatch[4] ? parseInt(germanMatch[4], 10) : 0;
    let minutes = germanMatch[5] ? parseInt(germanMatch[5], 10) : 0;
    let seconds = germanMatch[6] ? parseInt(germanMatch[6], 10) : 0;

    if (tStr) {
      const timeMatch = tStr.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      }
    }

    const res = new Date(year, month, day, hours, minutes, seconds);
    if (!Number.isNaN(res.getTime())) return res;
  }

  // ISO / Standardformat: YYYY-MM-DD oder YYYY/MM/DD oder YYYY-MM-DD HH:mm:ss
  const isoMatch = dStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    let hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
    let minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    let seconds = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;

    if (tStr) {
      const timeMatch = tStr.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      }
    }

    const res = new Date(year, month, day, hours, minutes, seconds);
    if (!Number.isNaN(res.getTime())) return res;
  }

  // US Format: MM/DD/YYYY
  const usMatch = dStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (usMatch) {
    const month = parseInt(usMatch[1], 10) - 1;
    const day = parseInt(usMatch[2], 10);
    const year = parseInt(usMatch[3], 10);
    let hours = usMatch[4] ? parseInt(usMatch[4], 10) : 0;
    let minutes = usMatch[5] ? parseInt(usMatch[5], 10) : 0;
    let seconds = usMatch[6] ? parseInt(usMatch[6], 10) : 0;

    if (tStr) {
      const timeMatch = tStr.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      }
    }

    const res = new Date(year, month, day, hours, minutes, seconds);
    if (!Number.isNaN(res.getTime())) return res;
  }

  // Fallback auf nativen Date-Parser
  let combined = dStr;
  if (tStr && !dStr.includes(':')) {
    combined = `${dStr} ${tStr}`;
  }
  const fallback = new Date(combined);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  return null;
}

/**
 * Parst einen Zahlenwert (unterstützt Komma als Dezimaltrenner, Maßeinheiten, etc.).
 */
function parseNumber(rawValue?: any) {
  if (rawValue == null) return null;
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : null;
  }
  let str = String(rawValue).trim();
  if (!str || str === '-' || str === '/' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') {
    return null;
  }

  // Präfixe wie <, >, ~, ca. entfernen
  str = str.replace(/^[<>~≈\s]+/, '').trim();
  // Einheiten am Ende entfernen (z.B. mg/l, °dGH, ppm, mg, µg/l, °C)
  str = str.replace(/[a-zA-Z°µ/%\s]+$/, '').trim();

  // Dezimalkomma zu Dezimalpunkt umwandeln (z.B. "7,2" -> "7.2" oder "1.200,50" -> "1200.50")
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 1.200,50 -> deutsches Tausenderformat
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,200.50 -> US-Format
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Erkennt automatisch passende Zuordnungen für CSV-Spaltennamen.
 */
function autoDetectMapping(headers: any = [], allParameters: any = null) {
  const params = allParameters || cfg.PARAMETERS;
  const paramMap = new Map();
  for (const p of params) {
    paramMap.set(p.key.toLowerCase(), p.key);
    paramMap.set(p.name.toLowerCase(), p.key);
    // Bereinigter Name ohne Maßeinheiten etc.
    const cleanName = p.name.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
    paramMap.set(cleanName, p.key);
  }

  const mapping: Record<string, any> = {};
  let dateFound = false;

  headers.forEach((h?: any, idx?: any) => {
    if (!h) {
      mapping[idx] = 'ignore';
      return;
    }
    const clean = String(h).trim().toLowerCase();

    // Datum & Zeit
    if (!dateFound && (clean.includes('datum') || clean.includes('date') || clean === 'zeitpunkt' || clean === 'measured_at' || clean === 'messung')) {
      mapping[idx] = 'measured_at';
      dateFound = true;
      return;
    }
    if (clean === 'uhrzeit' || clean === 'zeit' || clean === 'time') {
      mapping[idx] = 'time';
      return;
    }

    // Notiz / Bemerkung
    if (clean.includes('notiz') || clean.includes('note') || clean.includes('bemerkung') || clean.includes('kommentar') || clean.includes('beschreibung')) {
      mapping[idx] = 'note';
      return;
    }

    // Parameter Match
    // 1. Exakter Key oder Name
    if (paramMap.has(clean)) {
      mapping[idx] = paramMap.get(clean);
      return;
    }

    // 2. Bekannte Synonyme & Teilstrings
    if (clean === 'ph' || clean.startsWith('ph-') || clean.startsWith('ph ')) {
      mapping[idx] = 'ph';
      return;
    }
    if (clean === 'kh' || clean.includes('karbonathärte') || clean.includes('dkh')) {
      mapping[idx] = 'kh';
      return;
    }
    if (clean === 'gh' || clean.includes('gesamthärte') || clean.includes('dgh')) {
      mapping[idx] = 'gh';
      return;
    }
    if (clean === 'no2' || clean.includes('nitrit')) {
      mapping[idx] = 'no2';
      return;
    }
    if (clean === 'no3' || clean.includes('nitrat')) {
      mapping[idx] = 'no3';
      return;
    }
    if (clean === 'po4' || clean.includes('phosphat')) {
      mapping[idx] = 'po4';
      return;
    }
    if (clean === 'fe' || clean.includes('eisen')) {
      mapping[idx] = 'fe';
      return;
    }
    if (clean === 'k' || clean.includes('kalium') || clean === 'potassium') {
      mapping[idx] = 'k';
      return;
    }
    if (clean === 'mg' || clean.includes('magnesium')) {
      mapping[idx] = 'mg';
      return;
    }
    if (clean === 'ca' || clean.includes('calcium') || clean.includes('kalzium')) {
      mapping[idx] = 'ca';
      return;
    }
    if (clean === 'nh4' || clean.includes('ammonium')) {
      mapping[idx] = 'nh4';
      return;
    }
    if (clean === 'nh3' || clean.includes('ammoniak')) {
      mapping[idx] = 'nh3';
      return;
    }
    if (clean === 'co2' || clean.includes('kohlendioxid')) {
      mapping[idx] = 'co2';
      return;
    }
    if (clean === 'o2' || clean.includes('sauerstoff') || clean === 'oxygen') {
      mapping[idx] = 'o2';
      return;
    }
    if (clean === 'si' || clean === 'sio2' || clean.includes('silikat')) {
      mapping[idx] = 'sio2';
      return;
    }
    if (clean === 'cu' || clean.includes('kupfer') || clean === 'copper') {
      mapping[idx] = 'cu';
      return;
    }
    if (clean === 'cl2' || clean.includes('chlor') || clean === 'chlorine') {
      mapping[idx] = 'cl2';
      return;
    }
    if (clean === 'temp' || clean.includes('temperatur') || clean === 'temperature' || clean === '°c') {
      mapping[idx] = 'temp';
      return;
    }
    if (clean.includes('salinität') || clean.includes('salinity') || clean.includes('leitwert') || clean.includes('dichte') || clean === 'ec') {
      mapping[idx] = 'salinity';
      return;
    }

    mapping[idx] = 'ignore';
  });

  return mapping;
}

/**
 * Erstellt eine CSV-Zeichenkette für Messwerte (Excel-kompatibel mit BOM und wählbarem Trennzeichen).
 */
function generateCsv(measurements: any = [], options: any = {}) {
  const delimiter = options.delimiter || ';';
  const includeBOM = options.includeBOM !== false;
  const params = options.parameters || cfg.PARAMETERS;

  // Sammle alle tatsächlich vorkommenden oder konfigurierten Parameter
  const usedParamKeys = new Set();
  for (const m of measurements) {
    if (m.values && typeof m.values === 'object') {
      for (const k of Object.keys(m.values)) {
        if (m.values[k] != null) usedParamKeys.add(k);
      }
    }
  }

  // Reihenfolge der Parameter anhand der bekannten Definitionen, unbekannte anhängen
  const exportParams = [];
  const knownKeys = new Set();
  for (const p of params) {
    if (usedParamKeys.has(p.key) || options.allColumns) {
      exportParams.push(p);
      knownKeys.add(p.key);
    }
  }
  for (const k of usedParamKeys) {
    if (!knownKeys.has(k)) {
      exportParams.push({ key: k, name: k, unit: '' });
    }
  }

  const escapeCell = (val: any) => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerCells = ['Datum', 'Uhrzeit', 'Notiz', 'Erfasst von'];
  for (const p of exportParams) {
    const label = p.unit ? `${p.name} (${p.unit})` : p.name;
    headerCells.push(label);
  }

  const lines = [headerCells.map(escapeCell).join(delimiter)];

  // Chronologisch sortieren (älteste zuerst oder wie übergeben)
  const sorted = [...measurements].sort((a?: any, b?: any) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  for (const m of sorted) {
    const dateObj = new Date(m.measured_at);
    let dateStr = '';
    let timeStr = '';
    if (!Number.isNaN(dateObj.getTime())) {
      const y = dateObj.getFullYear();
      const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const h = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      const s = String(dateObj.getSeconds()).padStart(2, '0');
      dateStr = `${y}-${mo}-${d}`;
      timeStr = `${h}:${min}:${s}`;
    } else {
      dateStr = String(m.measured_at || '');
    }

    const rowCells = [
      dateStr,
      timeStr,
      m.note || '',
      m.created_by_username || '',
    ];

    for (const p of exportParams) {
      const v = m.values ? m.values[p.key] : null;
      if (v != null) {
        // Bei Semikolon Komma für Dezimaltrenner bei Zahlen nutzen (Excel DE Standard)
        if (delimiter === ';' && typeof v === 'number') {
          rowCells.push(String(v).replace('.', ','));
        } else {
          rowCells.push(String(v));
        }
      } else {
        rowCells.push('');
      }
    }

    lines.push(rowCells.map(escapeCell).join(delimiter));
  }

  const csvContent = lines.join('\r\n');
  return includeBOM ? '\uFEFF' + csvContent : csvContent;
}

/**
 * Importiert Messungen aus CSV-Zeilen und zugeordneten Spalten in die Datenbank.
 */
async function importMeasurementsFromRows({
  aquarium,
  userId,
  rows = [],
  mapping = {},
  hasHeader = true,
  db,
}: any) {
  if (!aquarium || !aquarium.id) {
    throw new Error('Aquarium nicht gefunden.');
  }

  const allParams = cfg.suiteService.getAllKnownParameters();
  const paramMap = new Map(allParams.map((p: any) => [p.key, p]));
  const { thresholds } = await thresholdsOfAquarium(aquarium, db);

  const startIdx = hasHeader ? 1 : 0;
  const dataRows = rows.slice(startIdx);

  if (dataRows.length === 0) {
    return { ok: true, imported: 0, skipped: 0, alerts: 0, errors: [] };
  }

  // Finde Spalten-Indizes für Datum, Uhrzeit, Notiz und Parameter
  let dateColIdx = null;
  let timeColIdx = null;
  let noteColIdx = null;
  const paramColMap = new Map(); // colIdx -> paramKey

  for (const [colIdxStr, targetKey] of Object.entries(mapping)) {
    const colIdx = parseInt(colIdxStr, 10);
    if (Number.isNaN(colIdx) || targetKey === 'ignore' || !targetKey) continue;

    if (targetKey === 'measured_at' || targetKey === 'date') {
      dateColIdx = colIdx;
    } else if (targetKey === 'time') {
      timeColIdx = colIdx;
    } else if (targetKey === 'note') {
      noteColIdx = colIdx;
    } else if (paramMap.has(targetKey)) {
      paramColMap.set(colIdx, targetKey);
    }
  }

  if (dateColIdx === null) {
    throw new Error('Bitte ordne mindestens eine Spalte dem Datum / Messzeitpunkt zu.');
  }

  let importedCount = 0;
  let skippedCount = 0;
  let totalAlertsCount = 0;
  const errors = [];
  const now = Date.now();

  for (let rIndex = 0; rIndex < dataRows.length; rIndex++) {
    const row = dataRows[rIndex];
    const rowNum = startIdx + rIndex + 1;

    if (!row || !row.length || row.every((c: any) => !c || c.trim() === '')) {
      skippedCount++;
      continue;
    }

    const rawDate = row[dateColIdx];
    const rawTime = timeColIdx !== null ? row[timeColIdx] : null;

    const parsedDate = parseDate(rawDate, rawTime);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      errors.push(`Zeile ${rowNum}: Ungültiges Datum („${rawDate || ''}“).`);
      skippedCount++;
      continue;
    }

    if (parsedDate.getTime() > now + 5 * 60000) {
      errors.push(`Zeile ${rowNum}: Messdatum liegt in der Zukunft.`);
      skippedCount++;
      continue;
    }

    const cleanValues: Record<string, any> = {};
    for (const [colIdx, paramKey] of paramColMap.entries()) {
      const rawVal = row[colIdx];
      if (rawVal === '' || rawVal == null) continue;

      const pDef = paramMap.get(paramKey);
      const parsedNum = parseNumber(rawVal);
      if (parsedNum == null) continue;

      if (pDef && (parsedNum < pDef.min || parsedNum > pDef.max)) {
        errors.push(`Zeile ${rowNum}: Wert ${parsedNum} für ${pDef.name} liegt außerhalb des gültigen Bereichs (${pDef.min} - ${pDef.max}).`);
        continue;
      }

      cleanValues[paramKey] = parsedNum;
    }

    let note = null;
    if (noteColIdx !== null && row[noteColIdx]) {
      note = String(row[noteColIdx]).trim().slice(0, 500);
    }

    // Mindestens ein Messwert oder eine Notiz
    if (Object.keys(cleanValues).length === 0 && !note) {
      skippedCount++;
      continue;
    }

    // Alarme für Grenzwerte berechnen
    const alertsToCreate = [];
    for (const [key, v] of Object.entries(cleanValues)) {
      const pDef = paramMap.get(key);
      const range = thresholds[key];
      const level = cfg.evaluate(range, v);
      if (level === 'warn' || level === 'crit') {
        const message = buildMessage(pDef, range, level, v);
        alertsToCreate.push({ param: key, level, value: v, message });
      }
    }

    await db.measurements.create({
      aquarium_id: aquarium.id,
      measured_at: parsedDate.toISOString(),
      note,
      created_by: userId || null,
      values: cleanValues,
      alerts: alertsToCreate,
    });

    importedCount++;
    totalAlertsCount += alertsToCreate.length;
  }

  return {
    ok: true,
    imported: importedCount,
    skipped: skippedCount,
    alerts: totalAlertsCount,
    errors,
  };
}

export = {
  detectDelimiter,
  parseCsv,
  parseDate,
  parseNumber,
  autoDetectMapping,
  generateCsv,
  importMeasurementsFromRows,
};
